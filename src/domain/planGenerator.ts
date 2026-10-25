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

export function generatePlan(goals: GoalTargets, profile: Pick<Profile, 'food_restrictions' | 'allergies' | 'intolerances'>, foods: Food[]): GeneratedPlan {
  const explanations: string[] = [];
  const resolve = (slot: Slot): PlanItem | null => {
    const s = allowed(slot, profile) ? slot : substitute(slot, profile);
    if (!s) return null;
    const food = searchFoods(foods, s.query, 1)[0]?.food;
    if (!food) return null;
    return { food_name: food.name, amount: s.grams, unit: food.base_unit, amount_g: s.grams, food_id: food.id, per100: food.per100, note: s.scalable ? 'porção ajustável' : null };
  };
  const build = (scale: number): PlanMeal[] =>
    TEMPLATES.map((t) => ({
      name: t.name,
      meal: t.meal,
      time: t.time,
      selected_option: 0,
      options: t.options.map((slots, i) => ({
        label: `Opção ${i + 1}`,
        items: slots
          .map((sl) => resolve(sl.scalable ? { ...sl, grams: Math.round((sl.grams * scale) / 5) * 5 } : sl))
          .filter((x): x is PlanItem => Boolean(x)),
      })),
    }));

  // Ajuste das porções de carboidrato para aproximar da meta (busca simples por escala)
  const target = goals.energy_kcal.value;
  let scale = 1;
  if (target) {
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
  const meals = build(scale);
  const n = planNutrition({ meals });
  const proteinTarget = goals.protein_g.value;
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
