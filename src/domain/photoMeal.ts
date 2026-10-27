/**
 * Refeição a partir da FOTO do prato analisada por uma IA externa.
 * 1) photoMealPrompt: roteiro para a IA responder no formato do app
 *    (itens, gramas e nutrientes estimados).
 * 2) parsePlainMealText: quando a resposta vem em texto livre
 *    ("Arroz: ~100 g — 130 a 150 kcal"), aproveita gramas e calorias
 *    (ponto médio das faixas); o que o texto não informa fica null.
 * 3) estimatedItemsToFoods: itens sem cadastro viram alimentos pessoais
 *    marcados como estimativa da IA, para achar na busca depois.
 * Os números de itens reconhecidos na base continuam vindo da base.
 */
import { AGENT_FORMAT, type AgentMeal, type MealReview } from './agentFormat';
import { findDuplicate, normalizeText } from './foodSearch';
import type { Food, MealType } from './types';

const MEAL_KEY: Record<MealType, string> = {
  breakfast: 'cafe_da_manha',
  morning_snack: 'lanche_da_manha',
  lunch: 'almoco',
  afternoon_snack: 'lanche_da_tarde',
  dinner: 'jantar',
  supper: 'ceia',
  extra: 'extra',
};

/** Pergunta para enviar junto com a foto do prato. */
export function photoMealPrompt(meal: MealType | null): string {
  return `Analise a foto do meu prato (vou anexar) e estime o que comi. Responda SOMENTE com um bloco \`\`\`json neste formato, sem texto fora dele:
\`\`\`json
{
  "formato": "${AGENT_FORMAT}",
  "tipo": "refeicao",
  "nome": "nome curto do prato, ex.: Frango com purê, arroz e feijão",
  "refeicao": ${meal ? `"${MEAL_KEY[meal]}"` : '"almoco"'},
  "itens": [
    { "alimento": "arroz branco cozido", "quantidade_g": 100, "medida": "4 colheres de sopa",
      "nutrientes_estimados": { "kcal": 128, "proteina_g": 2.5, "carboidrato_g": 28.1, "gordura_g": 0.2, "fibra_g": 1.6, "sodio_mg": 1 } }
  ],
  "observacoes": "o que pode mudar a estimativa (óleo, molho, queijo)"
}
\`\`\`
Regras:
- Um item por alimento visível, com nome simples em português como na Tabela TACO ("feijão carioca cozido", "peito de frango desfiado", "purê de mandioca", "salada de alface e tomate").
- "quantidade_g": UM número em gramas (ou ml para bebidas); se estiver em dúvida, use o meio da sua faixa. Em "medida", a medida caseira (ex.: "1 concha pequena").
- "nutrientes_estimados": valores para a quantidade do item (não por 100 g): kcal, proteina_g, carboidrato_g, gordura_g, fibra_g e sodio_mg. Use ponto decimal. O que não souber = null.
- Inclua óleo, azeite, molho ou queijo como itens próprios se aparecerem ou forem prováveis.`;
}

const num = (s: string) => Number(s.replace(',', '.'));
const mid = (a: string, b?: string) => (b ? (num(a) + num(b)) / 2 : num(a));
/** Palavras genéricas demais para associar sozinhas a um alimento da base. */
const GENERIC = new Set(['salada', 'legumes', 'verduras', 'molho', 'carne', 'sopa', 'prato', 'mistura', 'acompanhamento']);

/** Lê respostas em texto livre ("• Arroz: ~100g — 130 a 150 kcal"). null se não achar itens. */
export function parsePlainMealText(text: string, meal: MealType | null): AgentMeal | null {
  const items: AgentMeal['itens'] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[*\-•·]|\d+[.)])\s*/, '').trim();
    if (!line || /^total/i.test(normalizeText(line))) continue;
    const grams = line.match(/~?\s*(\d+(?:[.,]\d+)?)\s*(g|ml)\b(?:\s*(?:a|-|–|até)\s*~?\s*(\d+(?:[.,]\d+)?)\s*(?:g|ml)\b)?/i);
    const kcal = line.match(/(\d+(?:[.,]\d+)?)\s*(?:(?:a|-|–|até)\s*(\d+(?:[.,]\d+)?)\s*)?kcal/i);
    if (!grams && !kcal) continue;
    const head = line.split(/[:—–]|\s-\s|~/)[0].trim();
    if (!head || /^\d/.test(head)) continue;
    const base = head.replace(/\s*\([^)]*\)/g, '').trim();
    const firstWord = normalizeText(base).split(' ')[0];
    const alimento = (GENERIC.has(firstWord) && base.split(/\s+/).length === 1 ? head.replace(/[()]/g, ' ') : base).replace(/\s+/g, ' ').trim();
    const macro = (re: RegExp) => {
      const m = line.match(re);
      return m ? mid(m[1], m[2]) : null;
    };
    const medida = line.match(/\((?:aprox\.?\s*)?([^)]*(?:colher|concha|unidade|fatia|copo|xícara|escumadeira|filé|bife|pedaço)[^)]*)\)/i)?.[1]?.trim() ?? null;
    items.push({
      alimento,
      quantidade_g: grams ? Math.round(mid(grams[1], grams[3])) : null,
      quantidade: null,
      unidade: null,
      medida,
      nutrientes_estimados: {
        kcal: kcal ? Math.round(mid(kcal[1], kcal[2])) : null,
        proteina_g: macro(/prote[ií]nas?\D{0,12}(\d+(?:[.,]\d+)?)(?:\s*(?:a|-|–)\s*(\d+(?:[.,]\d+)?))?\s*g/i),
        carboidrato_g: macro(/carbo(?:idratos?)?\D{0,12}(\d+(?:[.,]\d+)?)(?:\s*(?:a|-|–)\s*(\d+(?:[.,]\d+)?))?\s*g/i),
        gordura_g: macro(/gorduras?\D{0,12}(\d+(?:[.,]\d+)?)(?:\s*(?:a|-|–)\s*(\d+(?:[.,]\d+)?))?\s*g/i),
      },
    });
  }
  if (!items.length) return null;
  const note = text.match(/\(?\s*nota:?\s*([^)]+)\)?/i)?.[1]?.trim() ?? null;
  return {
    formato: AGENT_FORMAT,
    tipo: 'refeicao',
    nome: items.length > 1 ? `${items[0].alimento} e mais ${items.length - 1}` : items[0].alimento,
    refeicao: meal ? MEAL_KEY[meal] : null,
    itens: items,
    observacoes: ['Lido de texto livre: só gramas e calorias quando a resposta não traz os outros nutrientes.', note].filter(Boolean).join(' '),
  };
}

export interface EstimatedFood {
  /** Posição do item na conferência. */
  index: number;
  food: Omit<Food, 'id' | 'user_id'>;
}

/** Itens com estimativa da IA (sem alimento da base) viram alimentos pessoais, sem duplicar. */
export function estimatedItemsToFoods(review: MealReview, existing: Food[]): EstimatedFood[] {
  const out: EstimatedFood[] = [];
  review.items.forEach((item, index) => {
    if (item.choice?.kind !== 'estimate' || !item.amount || item.amount <= 0) return;
    const name = item.input.alimento.trim().replace(/^./, (c) => c.toUpperCase());
    const candidate = { name, brand: null, flavor: null, variant: null, barcode: null };
    if (findDuplicate(existing, candidate) || out.some((o) => normalizeText(o.food.name) === normalizeText(name))) return;
    const measure = item.input.medida?.trim() || null;
    out.push({
      index,
      food: {
        name,
        aliases: [],
        brand: null,
        flavor: null,
        variant: null,
        category: null,
        preparation_state: 'preparado',
        base_unit: 'g',
        serving_size: item.amount,
        serving_label: measure ? `1 porção (${measure})` : '1 porção',
        household_measures: [{ label: '1 porção', amount: item.amount, estimated: true }],
        per100: item.choice.per100,
        trace_nutrients: [],
        source: 'ai_estimate',
        source_ref: 'Foto do prato analisada por IA externa',
        verification: 'estimated',
        verified_at: null,
        label_basis: null,
        barcode: null,
        ingredients_text: null,
        is_supplement: false,
        supplement_category: null,
        compounds_per_serving: null,
        tags: ['estimativa', 'foto do prato'],
      },
    });
  });
  return out;
}
