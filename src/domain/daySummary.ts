/**
 * Resumo diário para o painel. Distingue "sem registros" de "consumo zero".
 */
import { compoundTotals } from './entries';
import { progress, type Progress } from './goals';
import { MEAL_ORDER, type ActivityLog, type DiaryEntry, type GoalTargets, type ISODate, type MealType, type WaterLog } from './types';
import { sumNutrients, type NutrientTotals } from './nutrients';
import { summarizeHydration, type HydrationSummary, DEFAULT_COUNTED } from './hydration';
import { dedupeActivities } from './activities';

export interface DaySummary {
  date: ISODate;
  hasFoodRecords: boolean;
  totals: NutrientTotals;
  byMeal: Partial<Record<MealType, NutrientTotals>>;
  energy: Progress;
  protein: Progress;
  carbs: Progress;
  fat: Progress;
  fiber: Progress;
  water: Progress;
  hydration: HydrationSummary;
  compounds: Record<string, number>;
  activities: { count: number; minutes: number; kcal: number };
  /** Nutrientes cujo total é parcial (algum item sem o dado). */
  partial: string[];
}

export function summarizeDay(params: {
  date: ISODate;
  entries: DiaryEntry[];
  waterLogs: WaterLog[];
  activities: ActivityLog[];
  goals: GoalTargets | null;
  countedBeverages?: typeof DEFAULT_COUNTED;
}): DaySummary {
  const { date, goals } = params;
  const entries = params.entries.filter((e) => e.date === date);
  const has = entries.length > 0;
  const totals = sumNutrients(entries.map((e) => e.nutrients));
  const byMeal: DaySummary['byMeal'] = {};
  for (const meal of MEAL_ORDER) {
    const list = entries.filter((e) => e.meal === meal);
    if (list.length) byMeal[meal] = sumNutrients(list.map((e) => e.nutrients));
  }
  const consumed = (k: keyof NutrientTotals['values']) => (has ? totals.values[k] : null);
  const hydration = summarizeHydration(date, params.waterLogs, goals?.water_ml.value ?? null, params.countedBeverages, has ? totals.values.water_g : null);
  const { kept } = dedupeActivities(params.activities.filter((a) => a.date === date));
  const partial = (['energy_kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'] as const).filter((k) => has && totals.missing[k] > 0);
  return {
    date,
    hasFoodRecords: has,
    totals,
    byMeal,
    energy: progress(goals?.energy_kcal.value ?? null, consumed('energy_kcal')),
    protein: progress(goals?.protein_g.value ?? null, consumed('protein_g')),
    carbs: progress(goals?.carbs_g.value ?? null, consumed('carbs_g')),
    fat: progress(goals?.fat_g.value ?? null, consumed('fat_g')),
    fiber: progress(goals?.fiber_g.value ?? null, consumed('fiber_g')),
    water: progress(goals?.water_ml.value ?? null, hydration.logs > 0 ? hydration.counted_ml : null),
    hydration,
    compounds: compoundTotals(entries),
    activities: {
      count: kept.length,
      minutes: kept.reduce((s, a) => s + a.duration_min, 0),
      kcal: kept.reduce((s, a) => s + (a.kcal_estimated ?? 0), 0),
    },
    partial,
  };
}

/** Texto amigável para a proteína restante (sem culpa). */
export function proteinMessage(p: Progress): string | null {
  if (p.consumed === null) return 'Nenhuma refeição registrada hoje ainda.';
  if (!p.target) return null;
  if (p.remaining === 0) return 'Meta de proteína do dia atingida.';
  return `Faltam aproximadamente ${Math.round(p.remaining!)} g de proteína para sua meta de hoje.`;
}

/** Distribuição orientativa das calorias do dia entre as refeições (soma 100%). */
export const MEAL_SHARE: Record<MealType, number> = {
  breakfast: 0.25,
  morning_snack: 0.1,
  lunch: 0.3,
  afternoon_snack: 0.1,
  dinner: 0.2,
  supper: 0.05,
  extra: 0,
};

/** Sugestão de calorias por refeição (arredondada a 10 kcal). */
export function mealTargets(goalKcal: number | null): Partial<Record<MealType, number>> {
  if (!goalKcal) return {};
  const out: Partial<Record<MealType, number>> = {};
  for (const m of MEAL_ORDER) if (MEAL_SHARE[m]) out[m] = Math.round((goalKcal * MEAL_SHARE[m]) / 10) * 10;
  return out;
}

/** Dias seguidos com algum registro alimentar, contando a partir de hoje (ou de ontem, se hoje ainda está vazio). */
export function loggingStreak(dates: Iterable<ISODate>, today: ISODate): number {
  const set = new Set(dates);
  const prev = (d: ISODate) => {
    const [y, m, day] = d.split('-').map(Number);
    const dt = new Date(y, m - 1, day - 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };
  let cur = set.has(today) ? today : prev(today);
  let n = 0;
  while (set.has(cur)) {
    n += 1;
    cur = prev(cur);
  }
  return n;
}
