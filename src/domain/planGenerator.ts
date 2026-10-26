/**
 * Proposta alimentar ORIENTATIVA gerada por regras (sem IA), para quem não
 * tem um plano. Usa alimentos brasileiros simples da TACO, distribui a
 * proteína entre as refeições e ajusta as porções de carboidrato para se
 * aproximar da meta calórica. Cada escolha é explicada.
 *
 * Não é prescrição: o texto da proposta deixa isso claro e recomenda
 * validação com nutricionista.
 */
import { normalizeText, searchFoods } from './foodSearch';
import { planNutrition } from './dietPlan';
import type { DietPlan, Food, GoalTargets, MealType, PlanItem, PlanMeal, Profile } from './types';

interface Slot {
  query: string;
  grams: number;
  role: 'protein' | 'carb' | 'fat' | 'veg' | 'fruit' | 'dairy' | 'drink';
  scalable?: boolean; // porção ajustada para a meta calórica
  fixed?: boolean; // porção que nunca é ajustada (ex.: castanhas)
  unit?: string;
}

interface MealTemplate {
  name: string;
  meal: MealType;
  time: string;
  options: Slot[][];
}

const TEMPLATES: MealTemplate[] = [
  {
    name: 'Café da manhã',
    meal: 'breakfast',
    time: '07:30',
    options: [
      [{ query: 'pão francês', grams: 50, role: 'carb', scalable: true }, { query: 'ovo cozido', grams: 100, role: 'protein' }, { query: 'mamão', grams: 100, role: 'fruit' }, { query: 'café', grams: 100, role: 'drink' }],
      [{ query: 'iogurte natural', grams: 170, role: 'dairy' }, { query: 'aveia', grams: 30, role: 'carb', scalable: true }, { query: 'banana', grams: 60, role: 'fruit' }],
    ],
  },
  {
    name: 'Almoço',
    meal: 'lunch',
    time: '12:30',
    options: [
      [{ query: 'arroz branco', grams: 100, role: 'carb', scalable: true }, { query: 'feijão', grams: 100, role: 'carb' }, { query: 'peito de frango', grams: 120, role: 'protein' }, { query: 'alface', grams: 40, role: 'veg' }, { query: 'tomate', grams: 60, role: 'veg' }, { query: 'azeite', grams: 5, role: 'fat' }],
      [{ query: 'arroz integral', grams: 100, role: 'carb', scalable: true }, { query: 'feijão preto', grams: 100, role: 'carb' }, { query: 'patinho', grams: 110, role: 'protein' }, { query: 'tomate', grams: 80, role: 'veg' }, { query: 'azeite', grams: 5, role: 'fat' }],
    ],
  },
  {
    name: 'Lanche da tarde',
    meal: 'afternoon_snack',
    time: '16:00',
    options: [
      [{ query: 'iogurte natural', grams: 170, role: 'dairy' }, { query: 'maçã', grams: 130, role: 'fruit' }],
      [{ query: 'pão de forma integral', grams: 50, role: 'carb', scalable: true }, { query: 'queijo minas', grams: 30, role: 'dairy' }, { query: 'banana', grams: 60, role: 'fruit' }],
    ],
  },
  {
    name: 'Jantar',
    meal: 'dinner',
    time: '19:30',
    options: [
      [{ query: 'arroz branco', grams: 80, role: 'carb', scalable: true }, { query: 'feijão', grams: 80, role: 'carb' }, { query: 'patinho', grams: 110, role: 'protein' }, { query: 'alface', grams: 40, role: 'veg' }, { query: 'azeite', grams: 5, role: 'fat' }],
      [{ query: 'batata doce', grams: 150, role: 'carb', scalable: true }, { query: 'frango cozido', grams: 120, role: 'protein' }, { query: 'tomate', grams: 80, role: 'veg' }, { query: 'azeite', grams: 5, role: 'fat' }],
    ],
  },
];

const MEAT = /frango|patinho|carne|bovina|peixe/;
const DAIRY = /iogurte|queijo|leite|requeij|ricota/;
const GLUTEN = /pao|aveia|macarr/;

export interface GeneratedPlan {
  plan: Omit<DietPlan, 'id' | 'user_id' | 'created_at'>;
  explanations: string[];
}

function allowed(slot: Slot, profile: Pick<Profile, 'food_restrictions' | 'allergies' | 'intolerances'>): boolean {
  const q = normalizeText(slot.query);
  const r = (profile.food_restrictions ?? []).map(normalizeText);
  const avoid = [...(profile.allergies ?? []), ...(profile.intolerances ?? [])].map(normalizeText).filter(Boolean);
  if ((r.includes('vegetariano') || r.includes('vegano')) && MEAT.test(q)) return false;
  if (r.includes('vegano') && (DAIRY.test(q) || /ovo/.test(q))) return false;
  if ((r.includes('sem lactose') || avoid.some((a) => a.includes('lactose'))) && DAIRY.test(q)) return false;
  if ((r.includes('sem gluten') || avoid.some((a) => a.includes('gluten'))) && GLUTEN.test(q)) return false;
  if (r.includes('sem carne vermelha') && /patinho|bovina|carne/.test(q)) return false;
  if (r.includes('sem frutos do mar') && /peixe|camarao|atum|sardinha|salmao|tilapia/.test(q)) return false;
  return !avoid.some((a) => a.length > 2 && q.includes(a));
}

/** Substituto proteico para restrições (ex.: vegetariano: ovo; vegano: feijão + porção maior). */
function substitute(slot: Slot, profile: Pick<Profile, 'food_restrictions' | 'allergies' | 'intolerances'>): Slot | null {
  if (slot.role === 'protein') {
    const egg: Slot = { query: 'ovo cozido', grams: 100, role: 'protein' };
    if (allowed(egg, profile)) return egg;
    const beans: Slot = { query: 'feijão', grams: 140, role: 'protein' };
    return allowed(beans, profile) ? beans : null;
  }
  return null;
}

/** Low carb: gordura boa e proteína extra nos lanches. */
const LOW_CARB_EXTRAS: Partial<Record<MealType, Slot[]>> = {
  afternoon_snack: [{ query: 'castanha-de-caju', grams: 20, role: 'fat', fixed: true }, { query: 'abacate', grams: 100, role: 'fat', fixed: true }],
  breakfast: [{ query: 'queijo minas', grams: 30, role: 'dairy', fixed: true }],
};

const SUGARY = /acucar|mel\b|achocolatado|doce|suco|refrigerante|geleia|biscoito|bolo|chocolate/;
/** Menos açúcar: frutas de menor teor de açúcar no lugar das mais doces. */
const LOWER_SUGAR_FRUIT: Record<string, string> = { banana: 'morango', manga: 'morango', uva: 'morango' };

export function generatePlan(goals: GoalTargets, profile: Pick<Profile, 'food_restrictions' | 'allergies' | 'intolerances'>, foods: Food[]): GeneratedPlan {
  const explanations: string[] = [];
  const restrictions = (profile.food_restrictions ?? []).map(normalizeText);
  const lowCarb = restrictions.includes('low carb');
  const lessSugar = restrictions.includes('pouco acucar');
  const lookup = new Map<string, Food | undefined>();
  const find = (q: string) => {
    if (!lookup.has(q)) lookup.set(q, searchFoods(foods, q, 1)[0]?.food);
    return lookup.get(q);
  };
  const resolve = (slot: Slot): PlanItem | null => {
    let base = slot;
    if (lessSugar) {
      if (SUGARY.test(normalizeText(slot.query))) return null;
      const swap = LOWER_SUGAR_FRUIT[normalizeText(slot.query)];
      if (slot.role === 'fruit' && swap && find(swap)) base = { ...slot, query: swap, grams: 150 };
    }
    const s = allowed(base, profile) ? base : substitute(base, profile);
    if (!s) return null;
    const food = find(s.query);
    if (!food) return null;
    return { food_name: food.name, amount: s.grams, unit: food.base_unit, amount_g: s.grams, food_id: food.id, per100: food.per100, note: s.scalable ? 'porção ajustável' : null };
  };
  // carbScale: arroz, pão, aveia e batata; no low carb, fatScale (azeite, castanhas) e proteinScale completam as calorias
  const build = (carbScale: number, proteinScale = 1, fatScale = 1): PlanMeal[] =>
    TEMPLATES.map((t) => ({
      name: t.name,
      meal: t.meal,
      time: t.time,
      selected_option: 0,
      options: t.options.map((slots, i) => ({
        label: `Opção ${i + 1}`,
        items: [...slots, ...(lowCarb ? LOW_CARB_EXTRAS[t.meal] ?? [] : [])]
          .map((sl) => {
            const g = (k: number) => Math.round((sl.grams * k) / 5) * 5;
            if (sl.fixed) return resolve(sl);
            if (sl.scalable) return resolve({ ...sl, grams: g(carbScale) });
            if (sl.role === 'fat' && fatScale !== 1) return resolve({ ...sl, grams: g(fatScale) });
            if (sl.role === 'protein' && proteinScale !== 1) return resolve({ ...sl, grams: g(proteinScale) });
            return resolve(sl);
          })
          .filter((x): x is PlanItem => Boolean(x)),
      })),
    }));
  const totals = (c: number, pr = 1, f = 1) => planNutrition({ meals: build(c, pr, f) }).total.values;
  const argmin = (from: number, to: number, step: number, cost: (x: number) => number) => {
    let best = { x: from, cost: Infinity };
    for (let x = from; x <= to + 1e-9; x += step) {
      const c = cost(x);
      if (c < best.cost) best = { x, cost: c };
    }
    return best.x;
  };

  const target = goals.energy_kcal.value;
  const carbTarget = goals.carbs_g.value;
  let scale = 1;
  let proteinScale = 1;
  let lowCarbFat = 1;
  if (target && lowCarb && carbTarget) {
    // 1) carboidrato na meta; 2) proteína na meta; 3) azeite (até 15 g por refeição) completa as calorias
    const proteinTarget = goals.protein_g.value;
    scale = argmin(0.1, 2, 0.05, (c) => Math.abs(totals(c).carbs_g - carbTarget));
    if (proteinTarget) proteinScale = argmin(1, 1.4, 0.05, (pr) => Math.abs(totals(scale, pr).protein_g - proteinTarget));
    lowCarbFat = argmin(1, 3, 0.25, (f) => Math.abs(totals(scale, proteinScale, f).energy_kcal - target));
    explanations.push(
      `Low carb moderado: porções de arroz, pão, aveia e batata em ${Math.round(scale * 100)}% da porção base para ficar perto de ${carbTarget} g de carboidrato; castanhas e abacate no lanche e azeite (${Math.round(lowCarbFat * 100)}%)${proteinScale > 1 ? ` e proteínas (${Math.round(proteinScale * 100)}%)` : ''} completam ~${target} kcal. Legumes e verduras à vontade.`,
    );
  } else if (target) {
    let best = { scale: 1, diff: Infinity };
    for (let s = 0.5; s <= 3.01; s += 0.05) {
      const kcal = planNutrition({ meals: build(s) }).total.values.energy_kcal;
      const diff = Math.abs(kcal - target);
      if (diff < best.diff) best = { scale: s, diff };
    }
    scale = best.scale;
    explanations.push(`Porções de arroz, pão, aveia e batata ajustadas (${Math.round(scale * 100)}% da porção base) para aproximar a meta de ${target} kcal.`);
  } else {
    explanations.push('Sem meta calórica definida: porções de referência sem ajuste.');
  }
  if (lowCarb && !carbTarget) explanations.push('Low carb marcado, mas sem meta de carboidrato: recalcule as metas para aplicar a faixa de 100–130 g/dia.');
  if (lessSugar) explanations.push('Menos açúcar: nada com açúcar adicionado, sucos ou doces; iogurte natural; até 2 porções de fruta por dia, preferindo as menos doces (ex.: morango no lugar de banana).');
  const meals = build(scale, proteinScale, lowCarbFat);
  const n = planNutrition({ meals });
  const proteinTarget = goals.protein_g.value;
  if (lowCarb && target && n.total.values.energy_kcal < target * 0.92) {
    explanations.push(`A proposta low carb fica em ~${Math.round(n.total.values.energy_kcal)} kcal: para chegar a ${target} kcal sem subir o carboidrato, aumente ovos, queijos, azeite ou castanhas.`);
  }
  explanations.push('Uma fonte de proteína em cada refeição principal ajuda na saciedade e na preservação da massa muscular.');
  explanations.push('Base em alimentos brasileiros acessíveis (arroz, feijão, ovos, frango, frutas), com uma alternativa por refeição para variar.');
  if (proteinTarget && n.total.values.protein_g < proteinTarget * 0.9) {
    explanations.push(`A proposta fornece ~${Math.round(n.total.values.protein_g)} g de proteína, abaixo da meta (${proteinTarget} g): considere aumentar a porção de proteína do almoço/jantar ou incluir um suplemento cadastrado.`);
  }
  explanations.push('Horários são sugestões: ajuste à sua rotina. Nenhum horário ou padrão alimentar é obrigatório.');
  return {
    plan: {
      name: 'Proposta orientativa',
      origin: 'generated',
      professional_name: null,
      locked: false,
      active: false,
      meals,
      source_file_path: null,
      notes: 'Proposta gerada automaticamente a partir das suas metas e preferências. Orientação geral, não é prescrição; valide com um nutricionista.',
    },
    explanations,
  };
}

/** Distribuição de proteína por refeição sugerida (≈ 0,3–0,4 g/kg por refeição principal). */
export function proteinDistribution(proteinTarget: number, meals: MealType[] = ['breakfast', 'lunch', 'afternoon_snack', 'dinner']): Record<string, number> {
  const weights: Partial<Record<MealType, number>> = { breakfast: 0.25, morning_snack: 0.1, lunch: 0.3, afternoon_snack: 0.15, dinner: 0.3, supper: 0.1 };
  const total = meals.reduce((s, m) => s + (weights[m] ?? 0.1), 0);
  return Object.fromEntries(meals.map((m) => [m, Math.round((proteinTarget * (weights[m] ?? 0.1)) / total)]));
}
