/**
 * Interpretação de refeições descritas em linguagem natural.
 *
 * Este parser local é determinístico e funciona offline. Quando a IA está
 * configurada, ela substitui a etapa de identificação de itens (mais robusta),
 * mas a etapa de correspondência com a base e o cálculo dos nutrientes é a
 * mesma: os números SEMPRE vêm da base de alimentos, nunca do modelo.
 *
 * Resultado: sugestões para conferência, nunca registros confirmados.
 */
import { normalizeText, searchFoods } from './foodSearch';
import { dosesFromCompoundAmount } from './compounds';
import { scalePer100, type Nutrients } from './nutrients';
import type { Food } from './types';

const num1 = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');

export interface ParsedItem {
  text: string; // trecho original
  quantity: number | null;
  unit: string | null; // "unidade", "g", "colher de sopa"...
  foodQuery: string;
  candidates: Food[];
  food: Food | null;
  amount: number | null; // g/ml resolvido
  amountEstimated: boolean; // veio de medida caseira estimada/padrão
  measureLabel: string | null;
  notes: string[];
  questions: string[];
  nutrients: Nutrients | null;
}

export interface ParsedMeal {
  items: ParsedItem[];
  questions: string[];
  engine: 'local' | 'ai';
}

const NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  meia: 0.5, meio: 0.5,
};

const UNIT_PATTERNS: [RegExp, string][] = [
  [/^(mcg|µg|ug|microgramas?)\b/, 'mcg'],
  [/^(mg|miligramas?)\b/, 'mg'],
  [/^(ui|iu)\b/, 'UI'],
  [/^(capsulas?|comprimidos?|caps|gotas?)\b/, 'dose'],
  [/^(g|gr|grama|gramas)\b/, 'g'],
  [/^(ml|mililitro|mililitros)\b/, 'ml'],
  [/^(kg|quilo|quilos)\b/, 'kg'],
  [/^(l|litro|litros)\b/, 'l'],
  [/^colher(es)? (de )?sopa\b/, 'colher de sopa'],
  [/^colher(es)? (de )?cha\b/, 'colher de chá'],
  [/^colher(es)?\b/, 'colher de sopa'],
  [/^(fatia|fatias)\b/, 'fatia'],
  [/^(unidade|unidades|un)\b/, 'unidade'],
  [/^(copo|copos)\b/, 'copo'],
  [/^(xicara|xicaras)\b/, 'xícara'],
  [/^(concha|conchas)\b/, 'concha'],
  [/^(escumadeira|escumadeiras)\b/, 'escumadeira'],
  [/^(pote|potes)\b/, 'pote'],
  [/^(file|files)\b/, 'filé'],
  [/^(bife|bifes)\b/, 'bife'],
  [/^(scoop|scoops|dosador|dosadores|medida|medidas)\b/, 'dose'],
  [/^(cafezinho|cafezinhos)\b/, 'cafezinho'],
];

const LEAD_VERBS = /^(eu )?(comi|bebi|tomei|almocei|jantei|lanchei|ingeri|consumi)\b\s*/;

/** Divide a frase em itens: "pão com dois ovos e café" -> [pão, dois ovos, café]. */
export function splitItems(text: string): string[] {
  // separadores de pontuação são aplicados antes da normalização (que os remove)
  return text
    .split(/\s*[,;+]\s*/)
    .flatMap((part) => normalizeText(part).replace(LEAD_VERBS, '').split(/\s+(?:mais|e|com)\s+/))
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && !/^(sem acucar|sem adocante)$/.test(s));
}

export function parseQuantity(segment: string): { quantity: number | null; unit: string | null; rest: string } {
  let s = segment.trim();
  let quantity: number | null = null;
  const num = s.match(/^(\d+(?:[.,]\d+)?)\s*/);
  if (num) {
    quantity = parseFloat(num[1].replace(',', '.'));
    s = s.slice(num[0].length);
  } else {
    const word = s.match(/^([a-z]+)\s+/);
    if (word && word[1] in NUMBER_WORDS) {
      quantity = NUMBER_WORDS[word[1]];
      s = s.slice(word[0].length);
    }
  }
  let unit: string | null = null;
  for (const [re, u] of UNIT_PATTERNS) {
    const m = s.match(re);
    if (m) {
      unit = u;
      s = s.slice(m[0].length).trim().replace(/^(de|do|da)\s+/, '');
      break;
    }
  }
  // "100g de arroz" já tratado; "arroz 100g" no final
  if (quantity === null) {
    const tail = s.match(/\s(\d+(?:[.,]\d+)?)\s*(mcg|mg|ui|g|ml)$/);
    if (tail) {
      quantity = parseFloat(tail[1].replace(',', '.'));
      unit = tail[2] === 'ui' ? 'UI' : tail[2];
      s = s.slice(0, tail.index).trim();
    }
  }
  return { quantity, unit, rest: s.trim() };
}

const FAT_COOKING = /\b(mexid|frit|refogad|omelete)/;

function modifiersOf(rest: string): { query: string; notes: string[]; questions: string[] } {
  const notes: string[] = [];
  const questions: string[] = [];
  let query = rest;
  if (/\bsem acucar\b/.test(query)) {
    notes.push('sem açúcar');
    query = query.replace(/\bsem acucar\b/, '').trim();
  }
  if (FAT_COOKING.test(query)) {
    questions.push(`Para "${rest}": houve uso de manteiga, óleo ou azeite? Se sim, quanto (ex.: 1 colher de chá)?`);
  }
  return { query, notes, questions };
}

export function resolveAmount(food: Food, quantity: number | null, unit: string | null): { amount: number | null; estimated: boolean; label: string | null; question: string | null } {
  const q = quantity ?? 1;
  // suplementos: "2500 mcg" ou "2 cápsulas" viram doses do produto cadastrado
  if (food.is_supplement && food.serving_size) {
    if (unit === 'mcg' || unit === 'mg' || unit === 'UI' || (unit === 'g' && food.compounds_per_serving?.creatine_g)) {
      const doses = dosesFromCompoundAmount(food.compounds_per_serving, q, unit);
      if (doses !== null) return { amount: food.serving_size * doses, estimated: false, label: `${num1(doses)} dose(s)`, question: null };
      return { amount: food.serving_size, estimated: true, label: '1 dose', question: `Não foi possível converter ${q} ${unit} em doses de "${food.name}": confirme o número de doses.` };
    }
    if (unit === 'dose' || unit === null) return { amount: food.serving_size * q, estimated: false, label: `${num1(q)} dose(s)`, question: null };
  }
  if (unit === 'mcg' || unit === 'mg' || unit === 'UI') {
    return { amount: null, estimated: true, label: null, question: `"${food.name}" não é um suplemento cadastrado; ${unit} não pode ser convertido em gramas do alimento.` };
  }
  if (unit === 'g' || unit === 'ml') return { amount: q, estimated: false, label: null, question: null };
  if (unit === 'kg' || unit === 'l') return { amount: q * 1000, estimated: false, label: null, question: null };
  const measures = food.household_measures;
  if (unit && unit !== 'dose') {
    const m = measures.find((x) => normalizeText(x.label).includes(normalizeText(unit)));
    if (m) return { amount: m.amount * q, estimated: m.estimated, label: `${q} × ${m.label}`, question: null };
  }
  if (unit === 'dose' && food.serving_size) {
    return { amount: food.serving_size * q, estimated: false, label: `${q} dose(s)`, question: null };
  }
  if (measures.length) {
    const m = measures[0];
    return {
      amount: m.amount * q,
      estimated: true,
      label: `${q} × ${m.label}`,
      question: quantity === null ? `Confirme a quantidade de "${food.name}" (sugerimos ${m.label}, ~${m.amount} ${food.base_unit}).` : null,
    };
  }
  if (food.serving_size) return { amount: food.serving_size * q, estimated: true, label: `${q} porção(ões)`, question: null };
  return { amount: null, estimated: true, label: null, question: `Quantos ${food.base_unit === 'ml' ? 'ml' : 'gramas'} de "${food.name}"?` };
}

export function buildParsedItem(
  text: string,
  parsed: { quantity: number | null; unit: string | null; foodQuery: string; notes?: string[]; questions?: string[] },
  foods: Food[],
): ParsedItem {
  const hits = searchFoods(foods, parsed.foodQuery, 5).map((h) => h.food);
  const food = hits[0] ?? null;
  const questions = [...(parsed.questions ?? [])];
  let amount: number | null = null;
  let estimated = true;
  let label: string | null = null;
  if (food) {
    const r = resolveAmount(food, parsed.quantity, parsed.unit);
    amount = r.amount;
    estimated = r.estimated;
    label = r.label;
    if (r.question) questions.push(r.question);
  } else if (parsed.unit === 'mcg' || parsed.unit === 'mg' || parsed.unit === 'UI') {
    questions.push(`"${parsed.foodQuery}" parece um suplemento ainda não cadastrado. Cadastre-o em Meus suplementos (dose e quantidade por dose) para registrar.`);
  } else {
    questions.push(`Não encontramos "${parsed.foodQuery}" na base. Pesquise manualmente ou cadastre o alimento.`);
  }
  return {
    text,
    quantity: parsed.quantity,
    unit: parsed.unit,
    foodQuery: parsed.foodQuery,
    candidates: hits,
    food,
    amount,
    amountEstimated: estimated,
    measureLabel: label,
    notes: parsed.notes ?? [],
    questions,
    nutrients: food && amount ? scalePer100(food.per100, amount) : null,
  };
}

export function parseMealLocally(text: string, foods: Food[]): ParsedMeal {
  const items = splitItems(text).map((segment) => {
    const { quantity, unit, rest } = parseQuantity(segment);
    const { query, notes, questions } = modifiersOf(rest);
    return buildParsedItem(segment, { quantity, unit, foodQuery: query, notes, questions }, foods);
  });
  return { items, questions: items.flatMap((i) => i.questions), engine: 'local' };
}

/** Recalcula um item após o usuário trocar o alimento ou a quantidade. */
export function updateParsedItem(item: ParsedItem, changes: { food?: Food; amount?: number }): ParsedItem {
  const food = changes.food ?? item.food;
  const amount = changes.amount ?? item.amount;
  return {
    ...item,
    food,
    amount,
    amountEstimated: changes.amount !== undefined ? false : item.amountEstimated,
    nutrients: food && amount ? scalePer100(food.per100, amount) : null,
  };
}
