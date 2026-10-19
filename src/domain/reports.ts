/**
 * Relatórios semanais e mensais. Médias usam apenas dias COM registro:
 * falta de registro não é interpretada como ausência de consumo.
 */
import { compareAssessments, interpret, movingAverage, type Comparison, type Interpretation } from './bodyComposition';
import { dateRange } from './dates';
import { goalAttainment, summarizeHydration } from './hydration';
import { sumNutrients } from './nutrients';
import { dedupeActivities } from './activities';
import type { ActivityLog, BodyAssessment, DiaryEntry, GoalTargets, ISODate, WaterLog, WeightEntry } from './types';

export interface Report {
  from: ISODate;
  to: ISODate;
  days: number;
  food: {
    daysWithRecords: number;
    avgKcal: number | null;
    avgProtein: number | null;
    avgCarbs: number | null;
    avgFat: number | null;
    avgFiber: number | null;
    proteinGoalDays: number;
    avgMealsPerLoggedDay: number | null;
  };
  hydration: { daysWithLogs: number; daysMet: number; pct: number | null; avgMl: number | null };
  activity: { sessions: number; activeDays: number; minutes: number; strengthSessions: number };
  weight: { first: number | null; last: number | null; change: number | null; points: number };
  body: { comparison: Comparison; interpretation: Interpretation } | null;
  confidence: 'alta' | 'média' | 'baixa';
  missing: string[];
  suggestions: string[];
}

export function buildReport(params: {
  from: ISODate;
  to: ISODate;
  entries: DiaryEntry[];
  waterLogs: WaterLog[];
  activities: ActivityLog[];
  weights: WeightEntry[];
  assessments: BodyAssessment[];
  goals: GoalTargets | null;
}): Report {
  const { from, to, goals } = params;
  const days = dateRange(from, to);
  const inRange = (d: string) => d >= from && d <= to;

  const entries = params.entries.filter((e) => inRange(e.date));
  const byDay = new Map<string, DiaryEntry[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const dayTotals = [...byDay.values()].map((list) => sumNutrients(list.map((e) => e.nutrients)));
  const avg = (k: 'energy_kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g') =>
    dayTotals.length ? dayTotals.reduce((s, t) => s + t.values[k], 0) / dayTotals.length : null;
  const proteinGoal = goals?.protein_g.value ?? null;
  const proteinGoalDays = proteinGoal ? dayTotals.filter((t) => t.values.protein_g >= proteinGoal * 0.95).length : 0;
  const mealsPerDay = [...byDay.values()].map((list) => new Set(list.map((e) => e.meal)).size);

  const hydrationSummaries = days.map((d) => summarizeHydration(d, params.waterLogs, goals?.water_ml.value ?? null));
  const hydr = goalAttainment(hydrationSummaries);
  const loggedWater = hydrationSummaries.filter((s) => s.logs > 0);

  const { kept } = dedupeActivities(params.activities.filter((a) => inRange(a.date)));

  const weights = params.weights
    .filter((w) => inRange(w.measured_at.slice(0, 10)))
    .map((w) => ({ date: w.measured_at, value: w.weight_kg }));
  const smooth = movingAverage(weights, 7);

  const assessments = params.assessments
    .filter((a) => a.measured_at.slice(0, 10) <= to)
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  let body: Report['body'] = null;
  const inPeriod = assessments.filter((a) => inRange(a.measured_at.slice(0, 10)));
  if (inPeriod.length >= 1 && assessments.length >= 2) {
    const last = inPeriod[inPeriod.length - 1];
    const prev = assessments[assessments.indexOf(last) - 1];
    if (prev) {
      const comparison = compareAssessments(prev, last);
      body = { comparison, interpretation: interpret(comparison) };
    }
  }

  const coverage = byDay.size / days.length;
  const avgMeals = mealsPerDay.length ? mealsPerDay.reduce((a, b) => a + b, 0) / mealsPerDay.length : null;
  const confidence: Report['confidence'] = coverage >= 0.8 && (avgMeals ?? 0) >= 3 ? 'alta' : coverage >= 0.5 ? 'média' : 'baixa';

  const missing: string[] = [];
  const unlogged = days.length - byDay.size;
  if (unlogged > 0) missing.push(`${unlogged} de ${days.length} dias sem registro alimentar (não considerados nas médias).`);
  if (hydr.daysWithLogs < days.length) missing.push(`${days.length - hydr.daysWithLogs} dias sem registro de líquidos.`);
  if (!weights.length) missing.push('Nenhuma pesagem no período.');
  const partialDays = dayTotals.filter((t) => t.missing.energy_kcal > 0 || t.missing.protein_g > 0).length;
  if (partialDays) missing.push(`${partialDays} dia(s) com alimentos sem informação nutricional completa.`);

  const suggestions: string[] = [];
  const avgProtein = avg('protein_g');
  if (proteinGoal && avgProtein !== null && avgProtein < proteinGoal * 0.85) {
    suggestions.push(`A média de proteína (${Math.round(avgProtein)} g) ficou abaixo da meta (${proteinGoal} g). Incluir uma fonte proteica no café da manhã e nos lanches costuma ajudar.`);
  }
  if (hydr.pct !== null && hydr.pct < 50) suggestions.push('A meta de líquidos foi atingida em menos da metade dos dias registrados. Deixar uma garrafa à vista e usar lembretes pode ajudar.');
  if (kept.length < Math.ceil(days.length / 7) * 2) suggestions.push('Poucas sessões de atividade registradas. Mesmo caminhadas curtas somam ao longo da semana.');
  if (!kept.some((a) => a.type === 'strength')) suggestions.push('Treino de força ajuda a preservar a massa muscular durante o emagrecimento.');
  if (confidence === 'baixa') suggestions.push('Registrar mais dias deixará as análises mais confiáveis.');
  const avgFiber = avg('fiber_g');
  if (goals?.fiber_g.value && avgFiber !== null && avgFiber < goals.fiber_g.value * 0.7) suggestions.push('Fibras abaixo da meta: frutas, verduras, feijões e aveia são boas opções.');

  return {
    from,
    to,
    days: days.length,
    food: {
      daysWithRecords: byDay.size,
      avgKcal: avg('energy_kcal'),
      avgProtein,
      avgCarbs: avg('carbs_g'),
      avgFat: avg('fat_g'),
      avgFiber,
      proteinGoalDays,
      avgMealsPerLoggedDay: avgMeals,
    },
    hydration: { ...hydr, avgMl: loggedWater.length ? loggedWater.reduce((s, h) => s + h.counted_ml, 0) / loggedWater.length : null },
    activity: {
      sessions: kept.length,
      activeDays: new Set(kept.map((a) => a.date)).size,
      minutes: kept.reduce((s, a) => s + a.duration_min, 0),
      strengthSessions: kept.filter((a) => a.type === 'strength').length,
    },
    weight: {
      first: smooth[0]?.value ?? null,
      last: smooth[smooth.length - 1]?.value ?? null,
      change: smooth.length >= 2 ? Math.round((smooth[smooth.length - 1].value - smooth[0].value) * 10) / 10 : null,
      points: weights.length,
    },
    body,
    confidence,
    missing,
    suggestions,
  };
}

/** CSV simples (separador ";" para abrir corretamente no Excel em pt-BR). */
export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(';'), ...rows.map((r) => headers.map((h) => esc(r[h])).join(';'))].join('\n');
}
