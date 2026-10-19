/**
 * Nutrientes e aritmética com valores ausentes.
 *
 * Regra central: `null` significa "não informado" e NUNCA é tratado como zero.
 * Somas carregam a contagem de itens sem o dado, para que a interface possa
 * exibir "parcial" em vez de um total falsamente completo.
 */

export const NUTRIENT_KEYS = [
  'energy_kcal',
  'protein_g',
  'carbs_g',
  'fat_g',
  'fiber_g',
  'sugars_g',
  'added_sugars_g',
  'saturated_fat_g',
  'monounsaturated_fat_g',
  'polyunsaturated_fat_g',
  'trans_fat_g',
  'cholesterol_mg',
  'sodium_mg',
  'potassium_mg',
  'calcium_mg',
  'magnesium_mg',
  'iron_mg',
  'zinc_mg',
  'vitamin_c_mg',
  'water_g',
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

/** Valores por 100 g/100 ml (ou por porção, conforme o contexto). */
export type Nutrients = Partial<Record<NutrientKey, number | null>>;

export const MACRO_KEYS: NutrientKey[] = ['energy_kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'];

export const NUTRIENT_LABELS: Record<NutrientKey, { label: string; unit: string }> = {
  energy_kcal: { label: 'Energia', unit: 'kcal' },
  protein_g: { label: 'Proteínas', unit: 'g' },
  carbs_g: { label: 'Carboidratos', unit: 'g' },
  fat_g: { label: 'Gorduras totais', unit: 'g' },
  fiber_g: { label: 'Fibras', unit: 'g' },
  sugars_g: { label: 'Açúcares totais', unit: 'g' },
  added_sugars_g: { label: 'Açúcares adicionados', unit: 'g' },
  saturated_fat_g: { label: 'Gorduras saturadas', unit: 'g' },
  monounsaturated_fat_g: { label: 'Gorduras monoinsaturadas', unit: 'g' },
  polyunsaturated_fat_g: { label: 'Gorduras poli-insaturadas', unit: 'g' },
  trans_fat_g: { label: 'Gorduras trans', unit: 'g' },
  cholesterol_mg: { label: 'Colesterol', unit: 'mg' },
  sodium_mg: { label: 'Sódio', unit: 'mg' },
  potassium_mg: { label: 'Potássio', unit: 'mg' },
  calcium_mg: { label: 'Cálcio', unit: 'mg' },
  magnesium_mg: { label: 'Magnésio', unit: 'mg' },
  iron_mg: { label: 'Ferro', unit: 'mg' },
  zinc_mg: { label: 'Zinco', unit: 'mg' },
  vitamin_c_mg: { label: 'Vitamina C', unit: 'mg' },
  water_g: { label: 'Água (umidade)', unit: 'g' },
};

export function isKnown(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function round(value: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Escala valores "por 100" para uma quantidade em g/ml. Ausentes continuam ausentes. */
export function scalePer100(per100: Nutrients, amount: number): Nutrients {
  if (!(amount >= 0)) throw new Error('Quantidade inválida');
  const out: Nutrients = {};
  for (const key of NUTRIENT_KEYS) {
    if (!(key in per100)) continue;
    const v = per100[key];
    out[key] = isKnown(v) ? (v * amount) / 100 : null;
  }
  return out;
}

/** Converte valores de uma porção de `servingSize` g/ml para valores por 100. */
export function perServingToPer100(perServing: Nutrients, servingSize: number): Nutrients {
  if (!(servingSize > 0)) throw new Error('Porção deve ser maior que zero');
  const out: Nutrients = {};
  for (const key of NUTRIENT_KEYS) {
    if (!(key in perServing)) continue;
    const v = perServing[key];
    out[key] = isKnown(v) ? (v * 100) / servingSize : null;
  }
  return out;
}

export interface NutrientTotals {
  /** Soma dos valores conhecidos. */
  values: Record<NutrientKey, number>;
  /** Quantos itens não tinham o nutriente informado. */
  missing: Record<NutrientKey, number>;
  itemCount: number;
}

export function emptyTotals(): NutrientTotals {
  const values = {} as Record<NutrientKey, number>;
  const missing = {} as Record<NutrientKey, number>;
  for (const k of NUTRIENT_KEYS) {
    values[k] = 0;
    missing[k] = 0;
  }
  return { values, missing, itemCount: 0 };
}

export function sumNutrients(items: Nutrients[]): NutrientTotals {
  const totals = emptyTotals();
  for (const item of items) {
    totals.itemCount += 1;
    for (const k of NUTRIENT_KEYS) {
      const v = item[k];
      if (isKnown(v)) totals.values[k] += v;
      else totals.missing[k] += 1;
    }
  }
  return totals;
}

/** Soma de totais (por exemplo, refeições -> dia). */
export function mergeTotals(list: NutrientTotals[]): NutrientTotals {
  const out = emptyTotals();
  for (const t of list) {
    out.itemCount += t.itemCount;
    for (const k of NUTRIENT_KEYS) {
      out.values[k] += t.values[k];
      out.missing[k] += t.missing[k];
    }
  }
  return out;
}

/** Energia calculada pelos fatores de Atwater (4/4/9), usada apenas para conferência. */
export function atwaterKcal(n: Nutrients): number | null {
  const { protein_g: p, carbs_g: c, fat_g: f } = n;
  if (!isKnown(p) || !isKnown(c) || !isKnown(f)) return null;
  return p * 4 + c * 4 + f * 9;
}

/**
 * Verifica coerência entre energia declarada e macronutrientes.
 * Tabelas de rótulo têm arredondamentos; toleramos 20% ou 20 kcal/100 g.
 */
export function energyConsistency(n: Nutrients): 'ok' | 'inconsistent' | 'unknown' {
  const declared = n.energy_kcal;
  const computed = atwaterKcal(n);
  if (!isKnown(declared) || computed === null) return 'unknown';
  const diff = Math.abs(declared - computed);
  return diff <= Math.max(20, declared * 0.2) ? 'ok' : 'inconsistent';
}
