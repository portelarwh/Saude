/**
 * Formato "meu-equilibrio/v1" para colar respostas de um agente de IA
 * externo (Claude, ChatGPT, Gemini…) sem precisar de chave de API.
 *
 * Dois tipos de documento:
 *  - "refeicao": refeição montada pelo agente (itens + quantidades em g/ml).
 *    Os nutrientes vêm da base do app sempre que houver correspondência; a
 *    estimativa do agente só é usada para itens sem correspondência e fica
 *    marcada como "estimativa da IA externa".
 *  - "rotulo": transcrição de tabela nutricional, que passa pela mesma
 *    conferência do cadastro por foto.
 */
import { z } from 'zod';
import { compoundsToRecord, normalizeCompoundUnit } from './compounds';
import { normalizeText, searchFoods, stem, tokens } from './foodSearch';
import type { LabelData } from './labels';
import { resolveAmount } from './mealParser';
import { isKnown, perServingToPer100, type Nutrients } from './nutrients';
import { extractJsonDocuments, PasteParseError } from './pastedJson';
import type { Food, MealType, SavedMeal, SavedMealItem, SupplementCategory } from './types';

export const AGENT_FORMAT = 'meu-equilibrio/v1';

/** Aceita número, "30", "30,5" ou "30 g"; vazio = null. */
const num = z.preprocess((v) => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const m = v.replace(',', '.').match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : v;
  }
  return v;
}, z.number().nonnegative().nullable());
const str = z.preprocess((v) => (v === undefined || v === '' ? null : v), z.string().trim().nullable());
const optNum = num.optional().transform((v) => v ?? null);
const optStr = str.optional().transform((v) => v ?? null);

const NutrientsPt = z
  .object({
    kcal: optNum,
    proteina_g: optNum,
    carboidrato_g: optNum,
    acucares_g: optNum,
    acucares_adicionados_g: optNum,
    gordura_g: optNum,
    gordura_saturada_g: optNum,
    gordura_trans_g: optNum,
    fibra_g: optNum,
    sodio_mg: optNum,
  })
  .partial();
type NutrientsPtValue = z.infer<typeof NutrientsPt>;

const MEAL_NAMES: Record<string, MealType> = {
  cafe_da_manha: 'breakfast',
  lanche_da_manha: 'morning_snack',
  almoco: 'lunch',
  lanche_da_tarde: 'afternoon_snack',
  jantar: 'dinner',
  ceia: 'supper',
  extra: 'extra',
};

export const AgentMealItemSchema = z.object({
  alimento: z.string().trim().min(1),
  quantidade_g: optNum,
  quantidade: optNum,
  unidade: optStr,
  medida: optStr,
  nutrientes_estimados: NutrientsPt.nullable().optional(),
});
export type AgentMealItem = z.infer<typeof AgentMealItemSchema>;

export const AgentMealSchema = z.object({
  formato: optStr,
  tipo: z.literal('refeicao'),
  nome: z.string().trim().min(1),
  refeicao: optStr,
  itens: z.array(AgentMealItemSchema).min(1),
  observacoes: optStr,
});
export type AgentMeal = z.infer<typeof AgentMealSchema>;

const SUPP: Record<string, SupplementCategory> = {
  whey_concentrado: 'whey_concentrate',
  whey_isolado: 'whey_isolate',
  whey_hidrolisado: 'whey_hydrolyzed',
  proteina_vegetal: 'plant_protein',
  creatina: 'creatine',
  colageno: 'collagen',
  barra_proteica: 'protein_bar',
  bebida_proteica: 'protein_drink',
  multivitaminico: 'multivitamin',
  vitamina_mineral: 'vitamin_mineral',
  outro: 'other',
};

export const AgentLabelSchema = z.object({
  formato: optStr,
  tipo: z.literal('rotulo'),
  produto: z.string().trim().min(1),
  marca: optStr,
  sabor: optStr,
  variante: optStr,
  codigo_barras: optStr,
  porcao: optNum,
  unidade: z.preprocess((v) => (typeof v === 'string' ? v.toLowerCase().trim() : v), z.enum(['g', 'ml']).nullable().optional()),
  medida_caseira: optStr,
  base: z.preprocess((v) => (typeof v === 'string' ? normalizeText(v) : v), z.enum(['vendido', 'preparado', 'desconhecido']).nullable().optional()),
  por_porcao: NutrientsPt.nullable().optional(),
  por_100: NutrientsPt.nullable().optional(),
  ingredientes: optStr,
  suplemento: z.boolean().optional(),
  categoria_suplemento: optStr,
  compostos_por_porcao: z.array(z.object({ nome: z.string(), quantidade: num, unidade: z.string() })).optional(),
});
export type AgentLabel = z.infer<typeof AgentLabelSchema>;

export type AgentDocument = { kind: 'meal'; meal: AgentMeal } | { kind: 'label'; label: AgentLabel } | { kind: 'error'; index: number; message: string };

function toNutrients(n: NutrientsPtValue | null | undefined): Nutrients | null {
  if (!n) return null;
  const out: Nutrients = {
    energy_kcal: n.kcal ?? null,
    protein_g: n.proteina_g ?? null,
    carbs_g: n.carboidrato_g ?? null,
    sugars_g: n.acucares_g ?? null,
    added_sugars_g: n.acucares_adicionados_g ?? null,
    fat_g: n.gordura_g ?? null,
    saturated_fat_g: n.gordura_saturada_g ?? null,
    trans_fat_g: n.gordura_trans_g ?? null,
    fiber_g: n.fibra_g ?? null,
    sodium_mg: n.sodio_mg ?? null,
  };
  return Object.values(out).some(isKnown) ? out : null;
}

function describeIssue(e: z.ZodError): string {
  const i = e.issues[0];
  return i ? `campo "${i.path.join('.') || 'documento'}": ${i.message}` : 'formato inválido';
}

/** Lê o texto colado e separa refeições e rótulos (um ou vários documentos). */
export function parseAgentPaste(text: string): AgentDocument[] {
  if (text.trim().length < 2) throw new PasteParseError('Cole o texto gerado pelo agente.');
  const docs = extractJsonDocuments(text);
  return docs.map((d, index): AgentDocument => {
    const tipo = d && typeof d === 'object' ? normalizeText(String((d as Record<string, unknown>).tipo ?? '')) : '';
    if (tipo === 'refeicao') {
      const r = AgentMealSchema.safeParse(d);
      return r.success ? { kind: 'meal', meal: r.data } : { kind: 'error', index, message: `Refeição inválida (${describeIssue(r.error)}).` };
    }
    if (tipo === 'rotulo') {
      const r = AgentLabelSchema.safeParse(d);
      return r.success ? { kind: 'label', label: r.data } : { kind: 'error', index, message: `Rótulo inválido (${describeIssue(r.error)}).` };
    }
    return { kind: 'error', index, message: 'Documento sem "tipo" ("refeicao" ou "rotulo"). Confira se o agente está usando as instruções do app.' };
  });
}

// ---------------------------------------------------------------------------
// Rótulo -> LabelData (segue para a tela de conferência)
// ---------------------------------------------------------------------------
export function agentLabelToLabelData(l: AgentLabel): LabelData {
  const category = l.categoria_suplemento ? SUPP[normalizeText(l.categoria_suplemento).replace(/\s+/g, '_')] ?? 'other' : null;
  const compounds = compoundsToRecord(
    (l.compostos_por_porcao ?? []).flatMap((c) => {
      const unit = normalizeCompoundUnit(c.unidade);
      return unit && c.quantidade ? [{ name: c.nome, amount: c.quantidade, unit }] : [];
    }),
  );
  return {
    product_name: l.produto,
    brand: l.marca,
    flavor: l.sabor,
    variant: l.variante,
    barcode: l.codigo_barras ? l.codigo_barras.replace(/\D/g, '') || null : null,
    serving_size: l.porcao,
    serving_unit: l.unidade ?? 'g',
    household_measure: l.medida_caseira,
    basis: l.base === 'vendido' ? 'as_sold' : l.base === 'preparado' ? 'prepared' : 'unknown',
    per_serving: toNutrients(l.por_porcao),
    per_100: toNutrients(l.por_100),
    energy_kj_per_serving: null,
    ingredients_text: l.ingredientes,
    is_supplement: Boolean(l.suplemento || category || compounds),
    supplement_category: category,
    compounds_per_serving: compounds,
  };
}

// ---------------------------------------------------------------------------
// Refeição -> conferência -> refeição salva
// ---------------------------------------------------------------------------
export type ItemChoice = { kind: 'food'; food: Food } | { kind: 'estimate'; per100: Nutrients } | null;

export interface ReviewItem {
  input: AgentMealItem;
  amount: number | null;
  candidates: Food[];
  /** Correspondência forte: todas as palavras do item aparecem no alimento da base. */
  strong: boolean;
  estimatePer100: Nutrients | null;
  choice: ItemChoice;
  warnings: string[];
}

export interface MealReview {
  name: string;
  meal: MealType | null;
  notes: string | null;
  items: ReviewItem[];
}

/** Fração das palavras do item presentes no nome/sinônimos do alimento. */
export function matchCoverage(food: Food, query: string): number {
  const q = tokens(query).map(stem);
  if (!q.length) return 0;
  const hay = tokens([food.name, ...food.aliases, food.brand ?? '', food.flavor ?? ''].join(' ')).map(stem);
  const aliasHit = food.aliases.map(normalizeText).includes(normalizeText(query));
  if (aliasHit) return 1;
  return q.filter((t) => hay.includes(t)).length / q.length;
}

function amountFor(item: AgentMealItem, food: Food | null): { amount: number | null; warning: string | null } {
  if (item.quantidade_g && item.quantidade_g > 0) return { amount: item.quantidade_g, warning: null };
  if (food) {
    const unit = item.unidade ? normalizeText(item.unidade) : null;
    const r = resolveAmount(food, item.quantidade, unit === 'gramas' ? 'g' : unit);
    if (r.amount) return { amount: r.amount, warning: r.estimated ? `Quantidade de "${item.alimento}" estimada pela medida caseira (${r.label ?? ''}).` : null };
  }
  return { amount: null, warning: `Informe a quantidade em gramas de "${item.alimento}".` };
}

export function reviewAgentMeal(meal: AgentMeal, foods: Food[]): MealReview {
  const items = meal.itens.map((input): ReviewItem => {
    const candidates = searchFoods(foods, input.alimento, 4).map((h) => h.food);
    // prefere o primeiro candidato com todas as palavras do item (ex.: rótulo cadastrado por você)
    const exact = candidates.find((c) => matchCoverage(c, input.alimento) === 1) ?? null;
    const top = exact ?? candidates[0] ?? null;
    const strong = Boolean(exact);
    const preliminary = amountFor(input, top);
    const estimated = toNutrients(input.nutrientes_estimados);
    const estimatePer100 = estimated && preliminary.amount ? perServingToPer100(estimated, preliminary.amount) : null;
    const warnings: string[] = [];
    let choice: ItemChoice = null;
    if (top && strong) choice = { kind: 'food', food: top };
    else if (estimatePer100) {
      choice = { kind: 'estimate', per100: estimatePer100 };
      warnings.push(top ? `"${input.alimento}" não tem correspondência exata na base: usando a estimativa do agente (pode escolher "${top.name}").` : `"${input.alimento}" não está na base: usando a estimativa do agente. Para valores confiáveis, cadastre o rótulo.`);
    } else if (top) {
      choice = { kind: 'food', food: top };
      warnings.push(`Confira: "${input.alimento}" foi associado a "${top.name}".`);
    } else warnings.push(`"${input.alimento}" não foi encontrado e o agente não enviou estimativa: cadastre o alimento ou remova o item.`);
    const food = choice?.kind === 'food' ? choice.food : null;
    const amount = food ? amountFor(input, food) : preliminary;
    if (amount.warning) warnings.push(amount.warning);
    return { input, amount: amount.amount, candidates, strong, estimatePer100, choice, warnings };
  });
  return {
    name: meal.nome,
    meal: meal.refeicao ? MEAL_NAMES[normalizeText(meal.refeicao).replace(/\s+/g, '_')] ?? null : null,
    notes: meal.observacoes,
    items,
  };
}

export function reviewItemToSaved(item: ReviewItem): SavedMealItem | null {
  if (!item.choice || !item.amount || item.amount <= 0) return null;
  const measure = item.input.medida ?? (item.input.quantidade ? `${item.input.quantidade} ${item.input.unidade ?? ''}`.trim() : null);
  if (item.choice.kind === 'food') {
    const f = item.choice.food;
    return {
      food_name: f.name,
      amount: item.amount,
      unit: f.base_unit,
      measure,
      food_id: f.id,
      per100: { ...f.per100 },
      source: f.source,
      verification: f.verification,
      is_supplement: f.is_supplement,
      serving_size: f.serving_size,
      compounds_per_serving: f.compounds_per_serving,
    };
  }
  return {
    food_name: item.input.alimento,
    amount: item.amount,
    unit: 'g',
    measure,
    food_id: null,
    per100: item.choice.per100,
    source: 'ai_estimate',
    verification: 'estimated',
    is_supplement: false,
    serving_size: null,
    compounds_per_serving: null,
  };
}

export function reviewToSavedMeal(r: MealReview): Omit<SavedMeal, 'id' | 'user_id' | 'created_at' | 'updated_at'> {
  const items = r.items.map(reviewItemToSaved).filter((x): x is SavedMealItem => Boolean(x));
  if (!items.length) throw new PasteParseError('Nenhum item com alimento e quantidade definidos.');
  return { name: r.name.trim() || 'Refeição', meal: r.meal, items, origin: 'agent', favorite: false, notes: r.notes };
}


// ---------------------------------------------------------------------------
// Instruções para o agente externo
// ---------------------------------------------------------------------------
export const AGENT_INSTRUCTIONS = `Você vai gerar dados para o app "Meu Equilíbrio" (nutrição). Responda SEMPRE com blocos \`\`\`json no formato abaixo, um bloco por refeição ou rótulo, sem texto fora dos blocos (ou uma lista [ ... ] com vários documentos).

REGRAS GERAIS
- Use nomes de alimentos em português do Brasil, como na Tabela TACO quando possível (ex.: "arroz branco cozido", "feijão carioca cozido", "peito de frango grelhado", "ovo cozido", "pão francês").
- Quantidades sempre em gramas (ou ml para bebidas) em "quantidade_g". Se quiser, informe também a medida caseira em "medida".
- Números com ponto decimal (ex.: 12.5). Campo desconhecido = null. Nunca invente valores de rótulo.

1) REFEIÇÃO (quando eu pedir para montar ou registrar uma refeição)
\`\`\`json
{
  "formato": "${AGENT_FORMAT}",
  "tipo": "refeicao",
  "nome": "Café da manhã proteico",
  "refeicao": "cafe_da_manha",
  "itens": [
    { "alimento": "pão francês", "quantidade_g": 50, "medida": "1 unidade",
      "nutrientes_estimados": { "kcal": 150, "proteina_g": 4.0, "carboidrato_g": 29.3, "gordura_g": 1.6, "fibra_g": 1.2 } },
    { "alimento": "ovo cozido", "quantidade_g": 100, "medida": "2 unidades",
      "nutrientes_estimados": { "kcal": 146, "proteina_g": 13.3, "carboidrato_g": 0.6, "gordura_g": 9.5, "fibra_g": 0 } }
  ],
  "observacoes": null
}
\`\`\`
- "refeicao": cafe_da_manha, lanche_da_manha, almoco, lanche_da_tarde, jantar, ceia, extra ou null.
- "nutrientes_estimados" = valores para a quantidade do item (não por 100 g). O app usa a própria base quando reconhece o alimento e só usa sua estimativa nos itens que não encontrar, marcando-a como estimativa.

2) RÓTULO (quando eu enviar a foto de uma tabela nutricional)
\`\`\`json
{
  "formato": "${AGENT_FORMAT}",
  "tipo": "rotulo",
  "produto": "Whey Protein Concentrado",
  "marca": "Marca",
  "sabor": "Baunilha",
  "variante": null,
  "codigo_barras": null,
  "porcao": 30,
  "unidade": "g",
  "medida_caseira": "1 dosador",
  "base": "vendido",
  "por_porcao": { "kcal": 120, "proteina_g": 21, "carboidrato_g": 3.1, "acucares_g": 1.2, "acucares_adicionados_g": 0, "gordura_g": 2.0, "gordura_saturada_g": 1.1, "gordura_trans_g": 0, "fibra_g": null, "sodio_mg": 55 },
  "por_100": null,
  "ingredientes": "Proteína concentrada do soro do leite, ...",
  "suplemento": true,
  "categoria_suplemento": "whey_concentrado",
  "compostos_por_porcao": []
}
\`\`\`
- Transcreva SOMENTE o que está legível no rótulo; o resto = null. "por_porcao" = coluna da porção; "por_100" = coluna 100 g/100 ml (preencha as duas se existirem).
- "base": "vendido", "preparado" (valores do produto pronto, ex.: com leite) ou "desconhecido". Sódio em mg.
- "categoria_suplemento": whey_concentrado, whey_isolado, whey_hidrolisado, proteina_vegetal, creatina, colageno, barra_proteica, bebida_proteica, multivitaminico, vitamina_mineral, outro ou null.
- "compostos_por_porcao": creatina, vitaminas, minerais, cafeína etc. Ex.: [{ "nome": "Vitamina B12", "quantidade": 2500, "unidade": "mcg" }]. Unidades: g, mg, mcg ou UI. Creatina não é proteína.`;
