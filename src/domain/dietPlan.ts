/**
 * Planos alimentares com alternativas.
 *
 * Cada refeição tem uma ou mais opções mutuamente exclusivas ("ou"). O total
 * diário soma apenas a opção selecionada de cada refeição, e as faixas
 * mínimo–máximo mostram o efeito de escolher outras opções.
 */
import { MACRO_KEYS, emptyTotals, mergeTotals, scalePer100, sumNutrients, type NutrientKey, type NutrientTotals } from './nutrients';
import type { DiaryEntry, DietPlan, GoalTargets, MealType, PlanMeal, PlanOption } from './types';

export interface OptionNutrition {
  totals: NutrientTotals;
  unresolvedItems: number; // itens sem correspondência na base ou sem quantidade
}

export function optionNutrition(option: PlanOption): OptionNutrition {
  const resolved = option.items.filter((i) => i.per100 && i.amount_g && i.amount_g > 0);
  return {
    totals: sumNutrients(resolved.map((i) => scalePer100(i.per100!, i.amount_g!))),
    unresolvedItems: option.items.length - resolved.length,
  };
}

export interface MealNutrition {
  meal: PlanMeal;
  selected: OptionNutrition;
  options: OptionNutrition[];
  range: Partial<Record<NutrientKey, [number, number]>>;
}

export function mealNutrition(meal: PlanMeal): MealNutrition {
  if (!meal.options.length) {
    return { meal, selected: { totals: emptyTotals(), unresolvedItems: 0 }, options: [], range: {} };
  }
  const options = meal.options.map(optionNutrition);
  const idx = Math.min(Math.max(0, meal.selected_option), options.length - 1);
  const range: MealNutrition['range'] = {};
  for (const k of MACRO_KEYS) {
    const vals = options.map((o) => o.totals.values[k]);
    range[k] = [Math.min(...vals), Math.max(...vals)];
  }
  return { meal, selected: options[idx], options, range };
}

export interface PlanNutrition {
  meals: MealNutrition[];
  total: NutrientTotals;
  range: Partial<Record<NutrientKey, [number, number]>>;
  unresolvedItems: number;
}

export function planNutrition(plan: Pick<DietPlan, 'meals'>): PlanNutrition {
  const meals = plan.meals.map(mealNutrition);
  const total = mergeTotals(meals.map((m) => m.selected.totals));
  const range: PlanNutrition['range'] = {};
  for (const k of MACRO_KEYS) {
    range[k] = [
      meals.reduce((s, m) => s + (m.range[k]?.[0] ?? 0), 0),
      meals.reduce((s, m) => s + (m.range[k]?.[1] ?? 0), 0),
    ];
  }
  return { meals, total, range, unresolvedItems: meals.reduce((s, m) => s + m.selected.unresolvedItems, 0) };
}

export interface PlanFinding {
  level: 'info' | 'attention';
  message: string;
}

/** Pontos de atenção do plano frente às metas (orientativo, não diagnóstico). */
export function planFindings(n: PlanNutrition, goals: GoalTargets | null): PlanFinding[] {
  const out: PlanFinding[] = [];
  if (n.unresolvedItems > 0) out.push({ level: 'attention', message: `${n.unresolvedItems} item(ns) sem correspondência na base ou sem quantidade: os totais estão incompletos.` });
  if (!goals) return out;
  const cmp = (k: 'energy_kcal' | 'protein_g' | 'fiber_g', label: string) => {
    const g = goals[k].value;
    const v = n.total.values[k];
    if (!g) return;
    const pct = (v / g) * 100;
    if (pct < 80) out.push({ level: 'attention', message: `${label} do plano (${Math.round(v)}) está ${Math.round(100 - pct)}% abaixo da meta (${g}).` });
    else if (pct > 120) out.push({ level: 'attention', message: `${label} do plano (${Math.round(v)}) está ${Math.round(pct - 100)}% acima da meta (${g}).` });
  };
  cmp('energy_kcal', 'Energia');
  cmp('protein_g', 'Proteína');
  cmp('fiber_g', 'Fibra');
  const proteinByMeal = n.meals.map((m) => m.selected.totals.values.protein_g);
  const totalProtein = proteinByMeal.reduce((a, b) => a + b, 0);
  if (totalProtein > 0 && proteinByMeal.some((p) => p / totalProtein > 0.6)) {
    out.push({ level: 'info', message: 'Mais de 60% da proteína está concentrada em uma única refeição. Distribuir ao longo do dia pode ajudar a saciedade.' });
  }
  return out;
}

/** Adesão diária: refeições do plano com algum registro no diário. */
export function planAdherence(plan: Pick<DietPlan, 'meals'>, entries: Pick<DiaryEntry, 'meal' | 'date'>[], date: string): { planned: number; logged: number; pct: number | null } {
  const plannedMeals = new Set(plan.meals.map((m) => m.meal).filter((m): m is MealType => Boolean(m)));
  const loggedMeals = new Set(entries.filter((e) => e.date === date).map((e) => e.meal));
  const logged = [...plannedMeals].filter((m) => loggedMeals.has(m)).length;
  return { planned: plannedMeals.size, logged, pct: plannedMeals.size ? (logged / plannedMeals.size) * 100 : null };
}

/** Planos bloqueados (prescritos) não podem ser alterados por automações/IA. */
export function assertEditable(plan: Pick<DietPlan, 'locked'>, actor: 'user' | 'ai' | 'system'): void {
  if (plan.locked && actor !== 'user') {
    throw new Error('Este plano foi prescrito por profissional e está bloqueado para alterações automáticas.');
  }
}

