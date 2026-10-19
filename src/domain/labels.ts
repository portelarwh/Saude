/**
 * Normalização de tabelas nutricionais de rótulo (RDC ANVISA 429/2020 e
 * rótulos antigos). Converte para valores por 100 g/ml e por porção e gera
 * avisos para conferência humana.
 */
import { NUTRIENT_KEYS, energyConsistency, isKnown, perServingToPer100, round, type Nutrients } from './nutrients';
import type { BaseUnit, Food, SupplementCategory } from './types';

export interface LabelData {
  product_name: string | null;
  brand: string | null;
  flavor: string | null;
  variant: string | null;
  barcode: string | null;
  serving_size: number | null;
  serving_unit: BaseUnit | null;
  household_measure: string | null; // "1 dosador", "2 colheres de sopa"
  /** Valores referem-se ao produto como vendido, preparado ou não indicado. */
  basis: 'as_sold' | 'prepared' | 'unknown';
  per_serving: Nutrients | null;
  per_100: Nutrients | null;
  energy_kj_per_serving?: number | null;
  ingredients_text: string | null;
  is_supplement?: boolean;
  supplement_category?: SupplementCategory | null;
  compounds_per_serving?: Record<string, number> | null;
}

export interface NormalizedLabel {
  food: Omit<Food, 'id' | 'user_id'>;
  perServing: Nutrients;
  warnings: string[];
  errors: string[];
}

const KJ_PER_KCAL = 4.184;

export function normalizeLabel(label: LabelData, source: Food['source'] = 'label'): NormalizedLabel {
  const warnings: string[] = [];
  const errors: string[] = [];
  if (!label.product_name) errors.push('Informe o nome do produto.');
  if (!label.serving_unit) errors.push('Informe se a porção é em gramas (g) ou mililitros (ml).');
  if (!label.per_100 && !label.per_serving) errors.push('Nenhum valor nutricional foi encontrado.');
  if (label.per_serving && !label.per_100 && !(label.serving_size && label.serving_size > 0)) {
    errors.push('Sem o tamanho da porção não é possível calcular os valores por 100 g/ml.');
  }

  let perServing: Nutrients = { ...(label.per_serving ?? {}) };
  if (!isKnown(perServing.energy_kcal) && isKnown(label.energy_kj_per_serving)) {
    perServing.energy_kcal = label.energy_kj_per_serving / KJ_PER_KCAL;
    warnings.push('Energia convertida de kJ para kcal (÷ 4,184).');
  }

  let per100: Nutrients = {};
  if (label.per_100) {
    per100 = { ...label.per_100 };
    if (label.per_serving && label.serving_size) {
      const derived = perServingToPer100(perServing, label.serving_size);
      for (const k of NUTRIENT_KEYS) {
        const a = per100[k];
        const b = derived[k];
        if (isKnown(a) && isKnown(b) && Math.abs(a - b) > Math.max(1, a * 0.15)) {
          warnings.push(`Valores por 100 e por porção não batem para ${k} (${round(a)} vs ${round(b)}). Confira o rótulo.`);
        }
        if (!isKnown(a) && isKnown(b)) per100[k] = b;
      }
    }
  } else if (label.per_serving && label.serving_size && label.serving_size > 0) {
    per100 = perServingToPer100(perServing, label.serving_size);
  }

  if (label.serving_size && Object.keys(perServing).length === 0 && Object.keys(per100).length) {
    perServing = {};
    for (const k of NUTRIENT_KEYS) {
      const v = per100[k];
      if (k in per100) perServing[k] = isKnown(v) ? (v * label.serving_size) / 100 : null;
    }
  }

  if (label.basis === 'unknown') warnings.push('Não foi possível identificar se os valores referem-se ao produto pronto ou ao pó/produto como vendido. Confirme no rótulo.');
  if (label.basis === 'prepared') warnings.push('Os valores referem-se ao produto preparado (ex.: com leite ou água). Registre o produto preparado, não o pó isolado.');
  if (energyConsistency(per100) === 'inconsistent') warnings.push('A energia declarada não é coerente com os macronutrientes (4/4/9 kcal/g). Confira os valores.');
  for (const k of ['energy_kcal', 'protein_g', 'carbs_g', 'fat_g'] as const) {
    if (!isKnown(per100[k])) warnings.push(`${k} não informado no rótulo: ficará como "não informado" (não zero).`);
  }
  const macroSum = (per100.protein_g ?? 0) + (per100.carbs_g ?? 0) + (per100.fat_g ?? 0) + (per100.fiber_g ?? 0);
  if (label.serving_unit === 'g' && macroSum > 105) errors.push('A soma de macronutrientes por 100 g passa de 100 g: provavelmente há erro de leitura.');

  const measures = label.household_measure && label.serving_size
    ? [{ label: label.household_measure, amount: label.serving_size, estimated: false }]
    : [];

  return {
    food: {
      name: label.product_name ?? '',
      aliases: [],
      brand: label.brand,
      flavor: label.flavor,
      variant: label.variant,
      category: label.is_supplement ? 'Suplementos' : null,
      preparation_state: label.basis === 'prepared' ? 'preparado' : null,
      base_unit: label.serving_unit ?? 'g',
      serving_size: label.serving_size,
      serving_label: label.household_measure,
      household_measures: measures,
      per100: roundAll(per100),
      trace_nutrients: [],
      source,
      source_ref: label.barcode,
      verification: 'reported',
      verified_at: null,
      label_basis: label.basis === 'unknown' ? null : label.basis,
      barcode: label.barcode,
      ingredients_text: label.ingredients_text,
      is_supplement: Boolean(label.is_supplement),
      supplement_category: label.supplement_category ?? null,
      compounds_per_serving: label.compounds_per_serving ?? null,
    },
    perServing: roundAll(perServing),
    warnings,
    errors,
  };
}

function roundAll(n: Nutrients): Nutrients {
  const out: Nutrients = {};
  for (const k of NUTRIENT_KEYS) {
    if (!(k in n)) continue;
    const v = n[k];
    out[k] = isKnown(v) ? round(v, 2) : null;
  }
  return out;
}
