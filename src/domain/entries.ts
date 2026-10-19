/**
 * Construção de itens do diário a partir de alimentos e suplementos.
 */
import { isKnown, scalePer100, sumNutrients, type NutrientTotals, type Nutrients } from './nutrients';
import type { DiaryEntry, EntryOrigin, Food, ISODate, MealType } from './types';

export type NewDiaryEntry = Omit<DiaryEntry, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export interface EntryOptions {
  date: ISODate;
  meal: MealType;
  origin: EntryOrigin;
  consumed_at?: string | null;
  custom_meal_name?: string | null;
  group_id?: string | null;
  note?: string | null;
  servings?: number | null;
}

/** Nutrientes proporcionais à quantidade consumida (g ou ml). */
export function buildEntry(food: Food, amount: number, opts: EntryOptions): NewDiaryEntry {
  if (!(amount > 0)) throw new Error('A quantidade deve ser maior que zero');
  return {
    date: opts.date,
    meal: opts.meal,
    custom_meal_name: opts.custom_meal_name ?? null,
    consumed_at: opts.consumed_at ?? null,
    food_id: food.id,
    food_name: displayFoodName(food),
    amount,
    unit: food.base_unit,
    servings: opts.servings ?? null,
    per100_snapshot: { ...food.per100 },
    nutrients: scalePer100(food.per100, amount),
    compounds: null,
    source: food.source,
    verification: food.verification,
    origin: opts.origin,
    group_id: opts.group_id ?? null,
    note: opts.note ?? null,
  };
}

export function displayFoodName(food: Pick<Food, 'name' | 'brand' | 'flavor' | 'variant'>): string {
  const extras = [food.brand, food.variant, food.flavor].filter(Boolean);
  return extras.length ? `${food.name} (${extras.join(' · ')})` : food.name;
}

/**
 * Dose de suplemento. Os nutrientes vêm do rótulo do produto escolhido; os
 * compostos ativos (ex.: creatina) são registrados separadamente e nunca
 * entram como proteína.
 */
export function buildSupplementEntry(product: Food, doses: number, opts: EntryOptions): NewDiaryEntry {
  if (!product.is_supplement) throw new Error('O produto selecionado não é um suplemento');
  if (!product.serving_size) throw new Error('Informe a porção (dose) do suplemento');
  if (!(doses > 0)) throw new Error('Número de doses inválido');
  const amount = product.serving_size * doses;
  const entry = buildEntry(product, amount, { ...opts, origin: 'supplement', servings: doses });
  entry.nutrients = sanitizeSupplementNutrients(product, entry.nutrients);
  if (product.compounds_per_serving) {
    const compounds: Record<string, number> = {};
    for (const [k, v] of Object.entries(product.compounds_per_serving)) compounds[k] = v * doses;
    entry.compounds = compounds;
  }
  return entry;
}

/**
 * Creatina pura não contém proteína: mesmo que o cadastro tenha sido feito por
 * engano com a creatina no campo de proteína, ela não é contabilizada.
 */
export function sanitizeSupplementNutrients(product: Food, nutrients: Nutrients): Nutrients {
  if (product.supplement_category !== 'creatine') return nutrients;
  const out = { ...nutrients };
  const creatinePer100 = creatinePer100g(product);
  const protein = product.per100.protein_g;
  if (isKnown(protein) && creatinePer100 !== null && Math.abs(protein - creatinePer100) < 1) {
    out.protein_g = 0;
  }
  return out;
}

function creatinePer100g(product: Food): number | null {
  const perServing = product.compounds_per_serving?.creatine_g;
  if (!isKnown(perServing) || !product.serving_size) return null;
  return (perServing * 100) / product.serving_size;
}

/** Valida o cadastro de um suplemento antes de salvar. */
export function validateSupplement(product: Food): string[] {
  const problems: string[] = [];
  if (!product.serving_size) problems.push('Informe o tamanho da dose (g ou ml).');
  if (product.supplement_category === 'creatine') {
    const c = creatinePer100g(product);
    if (c === null) problems.push('Informe a quantidade de creatina por dose.');
    const protein = product.per100.protein_g;
    if (isKnown(protein) && c !== null && Math.abs(protein - c) < 1) {
      problems.push('A creatina foi informada como proteína. Creatina não é contabilizada como proteína; corrija o campo de proteínas conforme o rótulo (geralmente 0 g).');
    }
  }
  if (product.supplement_category?.startsWith('whey') && !isKnown(product.per100.protein_g)) {
    problems.push('Informe a proteína por porção do rótulo deste whey (cada sabor/versão pode ter valores diferentes).');
  }
  return problems;
}

export function totalsFor(entries: Pick<DiaryEntry, 'nutrients'>[]): NutrientTotals {
  return sumNutrients(entries.map((e) => e.nutrients));
}

/** Soma compostos (creatina etc.) registrados no dia. */
export function compoundTotals(entries: Pick<DiaryEntry, 'compounds'>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    for (const [k, v] of Object.entries(e.compounds ?? {})) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

/** Copia itens de uma refeição para outra data/refeição, mantendo os valores. */
export function copyEntries(entries: DiaryEntry[], to: { date: ISODate; meal?: MealType }): NewDiaryEntry[] {
  return entries.map((e) => {
    const { id: _id, user_id: _u, created_at: _c, updated_at: _up, ...rest } = e;
    return { ...rest, date: to.date, meal: to.meal ?? e.meal, consumed_at: null, origin: 'copy' as const };
  });
}
