/**
 * Conversão das extrações da IA em rascunhos para conferência.
 *
 * Nada aqui grava dados: os rascunhos só viram registros quando o usuário
 * confirma (funções `confirm*`). Valores nutricionais de alimentos genéricos
 * nunca vêm da IA — são buscados na base.
 */
import type { BioimpedanceExtraction, DietImport, LabelExtraction, MealParse } from '../../supabase/functions/_shared/schemas';
import { validateAssessmentDraft } from '../domain/bodyComposition';
import { compoundsToRecord, normalizeCompoundUnit } from '../domain/compounds';
import type { LabelData } from '../domain/labels';
import { buildParsedItem, resolveAmount, type ParsedMeal } from '../domain/mealParser';
import { searchFoods } from '../domain/foodSearch';
import type { BodyAssessment, BodyMetricKey, DietPlan, Food, MealType, MetricValue, PlanMeal, WeightEntry } from '../domain/types';
import type { DataStore, NewRow } from '../data/store';

// ---------------------------------------------------------------------------
// Refeição em linguagem natural
// ---------------------------------------------------------------------------
export function mealParseToParsedMeal(mp: MealParse, foods: Food[]): ParsedMeal {
  const items = mp.items.map((i) =>
    buildParsedItem(i.text, {
      quantity: i.quantity,
      unit: normalizeUnit(i.unit),
      foodQuery: [i.food_query, i.preparation].filter(Boolean).join(' '),
      notes: i.notes,
    }, foods),
  );
  // se a busca com preparo falhar, tenta só o nome
  mp.items.forEach((i, idx) => {
    if (!items[idx].food && i.preparation) {
      items[idx] = buildParsedItem(i.text, { quantity: i.quantity, unit: normalizeUnit(i.unit), foodQuery: i.food_query, notes: i.notes }, foods);
    }
  });
  return { items, questions: [...mp.questions, ...items.flatMap((i) => i.questions)], engine: 'ai' };
}

function normalizeUnit(u: string | null): string | null {
  if (!u) return null;
  const s = u.toLowerCase().trim();
  if (['g', 'grama', 'gramas'].includes(s)) return 'g';
  if (['ml', 'mililitro', 'mililitros'].includes(s)) return 'ml';
  if (s.startsWith('unidade')) return 'unidade';
  if (s.includes('colher') && s.includes('chá')) return 'colher de chá';
  if (s.includes('colher')) return 'colher de sopa';
  if (s.startsWith('dose') || s.startsWith('scoop') || s.startsWith('dosador')) return 'dose';
  return s;
}

// ---------------------------------------------------------------------------
// Rótulo
// ---------------------------------------------------------------------------
export function labelExtractionToLabelData(ex: LabelExtraction): LabelData {
  const compounds = compoundsToRecord(
    ex.compounds_per_serving.flatMap((c) => {
      const unit = normalizeCompoundUnit(c.unit);
      return unit ? [{ name: c.name, amount: c.amount, unit }] : [];
    }),
  );
  const toNutrients = (n: LabelExtraction['per_100']) =>
    n
      ? {
          energy_kcal: n.energy_kcal,
          protein_g: n.protein_g,
          carbs_g: n.carbs_g,
          sugars_g: n.sugars_g,
          added_sugars_g: n.added_sugars_g,
          fat_g: n.fat_g,
          saturated_fat_g: n.saturated_fat_g,
          trans_fat_g: n.trans_fat_g,
          fiber_g: n.fiber_g,
          sodium_mg: n.sodium_mg,
        }
      : null;
  return {
    product_name: ex.product_name,
    brand: ex.brand,
    flavor: ex.flavor,
    variant: ex.variant,
    barcode: ex.barcode,
    serving_size: ex.serving_size,
    serving_unit: ex.serving_unit,
    household_measure: ex.household_measure,
    basis: ex.basis,
    per_serving: toNutrients(ex.per_serving),
    per_100: toNutrients(ex.per_100),
    energy_kj_per_serving: ex.per_serving?.energy_kj ?? null,
    ingredients_text: ex.ingredients_text,
    is_supplement: ex.is_supplement,
    supplement_category: ex.supplement_category,
    compounds_per_serving: compounds,
  };
}

// ---------------------------------------------------------------------------
// Bioimpedância
// ---------------------------------------------------------------------------
export type AssessmentDraft = NewRow<BodyAssessment>;

export interface DraftResult {
  draft: AssessmentDraft;
  warnings: string[];
}

export function bioExtractionToDraft(ex: BioimpedanceExtraction, filePath: string | null): DraftResult {
  const metrics: Partial<Record<BodyMetricKey, MetricValue>> = {};
  const warnings = [...ex.warnings];
  for (const m of ex.metrics) {
    if (metrics[m.key]) {
      warnings.push(`"${m.printed_label}" apareceu mais de uma vez; mantivemos o primeiro valor. Confira.`);
      continue;
    }
    metrics[m.key] = { value: m.value, unit: m.unit };
  }
  if (!ex.measured_at) warnings.push('A data da avaliação não foi encontrada no arquivo. Informe a data original do exame.');
  return {
    draft: {
      measured_at: ex.measured_at ? new Date(ex.measured_at).toISOString() : '',
      device_manufacturer: ex.device_manufacturer,
      device_model: ex.device_model,
      method: 'bioimpedance',
      input: 'import',
      metrics,
      visceral_fat_scale: ex.visceral_fat_scale,
      segmental: ex.segmental,
      other_metrics: ex.other_metrics,
      conditions: null,
      file_path: filePath,
      extraction_raw: ex,
      notes: null,
    },
    warnings,
  };
}

/**
 * Salva uma avaliação SOMENTE após conferência. Também registra o peso
 * medido no histórico de peso, para alimentar tendências.
 */
export async function confirmAssessment(store: DataStore, draft: AssessmentDraft): Promise<BodyAssessment> {
  const { errors } = validateAssessmentDraft(draft);
  if (errors.length) throw new Error(errors.join(' '));
  const saved = await store.insert<BodyAssessment>('body_assessments', draft);
  const w = draft.metrics.weight_kg;
  if (w && w.unit.toLowerCase() === 'kg') {
    await store.insert<WeightEntry>('weight_entries', { measured_at: draft.measured_at, weight_kg: w.value, source: 'assessment', note: `Avaliação ${draft.device_model ?? ''}`.trim() });
  }
  return saved;
}

// ---------------------------------------------------------------------------
// Plano alimentar
// ---------------------------------------------------------------------------
export function dietImportToPlan(di: DietImport, foods: Food[], opts: { professional: boolean; sourceFilePath: string | null }): NewRow<DietPlan> {
  const meals: PlanMeal[] = di.meals.map((m) => ({
    name: m.name,
    meal: (m.meal as MealType | null) ?? null,
    time: m.time,
    selected_option: 0,
    options: m.options.map((o) => ({
      label: o.label,
      items: o.items.map((it) => {
        const food = searchFoods(foods, it.food_name, 1)[0]?.food ?? null;
        const unit = normalizeUnit(it.unit);
        const resolved = food && (it.amount !== null || unit) ? resolveAmount(food, it.amount, unit) : null;
        return {
          food_name: it.food_name,
          amount: it.amount,
          unit: it.unit,
          amount_g: resolved?.amount ?? null,
          food_id: food?.id ?? null,
          per100: food?.per100 ?? null,
          note: [it.note, food ? `Correspondência: ${food.name}${resolved?.estimated ? ' (porção estimada)' : ''}` : 'Sem correspondência na base'].filter(Boolean).join(' · '),
        };
      }),
    })),
  }));
  return {
    name: di.name || 'Plano importado',
    origin: opts.professional ? 'professional' : 'imported',
    professional_name: di.professional_name,
    locked: opts.professional,
    active: true,
    meals,
    source_file_path: opts.sourceFilePath,
    notes: di.notes.join('\n') || null,
  };
}
