import { referenceFoods } from '../../data/reference';
import { dietImportToPlan } from '../../services/imports';
import { parseDietText, guessMeal } from '../dietText';
import { planNutrition } from '../dietPlan';
import { calculateGoals } from '../goals';
import { generatePlan, proteinDistribution } from '../planGenerator';

const foods = referenceFoods();

describe('leitura local de plano alimentar digitado', () => {
  const text = `Café da manhã (07:00): 1 pão francês + 2 ovos OU 1 iogurte natural e 1 banana
Almoço: 4 colheres de sopa de arroz, 1 concha de feijão, 120 g de frango
Beber 2 L de água por dia`;

  it('separa refeições, horários, opções e itens', () => {
    const d = parseDietText(text);
    expect(d.meals).toHaveLength(2);
    expect(d.meals[0]).toMatchObject({ name: 'Café da manhã', meal: 'breakfast', time: '07:00' });
    expect(d.meals[0].options).toHaveLength(2);
    expect(d.meals[0].options[0].items.map((i) => i.food_name)).toEqual(['pao frances', 'ovos']);
    expect(d.meals[0].options[0].items[1].amount).toBe(2);
    expect(d.meals[1].options[0].items[0]).toMatchObject({ amount: 4, unit: 'colher de sopa' });
    expect(d.notes).toEqual(['Beber 2 L de água por dia']);
    expect(guessMeal('Lanche da tarde')).toBe('afternoon_snack');
  });

  it('Cenário 9 (ponta a ponta): alternativas não são somadas', () => {
    const plan = dietImportToPlan(parseDietText(text), foods, { professional: false, sourceFilePath: null });
    const n = planNutrition(plan);
    const opt1 = n.meals[0].options[0].totals.values.energy_kcal;
    const opt2 = n.meals[0].options[1].totals.values.energy_kcal;
    const lunch = n.meals[1].selected.totals.values.energy_kcal;
    expect(n.total.values.energy_kcal).toBeCloseTo(opt1 + lunch);
    expect(n.total.values.energy_kcal).toBeLessThan(opt1 + opt2 + lunch);
    // 4 colheres de arroz (25 g cada) = 100 g
    expect(plan.meals[1].options[0].items[0].amount_g).toBe(100);
  });
});

describe('proposta orientativa', () => {
  const goals = calculateGoals({
    profile: { birth_date: '1990-01-01', sex: 'female', height_cm: 165, current_weight_kg: 78, target_weight_kg: 68, activity_level: 'light', objective: 'fat_loss', does_resistance_training: true, health_flags: [], hot_climate: false, water_ml_per_kg: null, target_date: null },
    today: new Date(2026, 9, 19),
  }).targets;

  it('aproxima a meta calórica e explica as escolhas', () => {
    const g = generatePlan(goals, { food_restrictions: [], allergies: [], intolerances: [] }, foods);
    const kcal = planNutrition(g.plan).total.values.energy_kcal;
    expect(Math.abs(kcal - goals.energy_kcal.value!) / goals.energy_kcal.value!).toBeLessThan(0.1);
    expect(g.plan.origin).toBe('generated');
    expect(g.plan.locked).toBe(false);
    expect(g.explanations.length).toBeGreaterThan(2);
    expect(g.plan.meals.every((m) => m.options.length === 2)).toBe(true);
  });

  it('respeita restrições (vegetariano sem lactose)', () => {
    const g = generatePlan(goals, { food_restrictions: ['Vegetariano', 'Sem lactose'], allergies: [], intolerances: [] }, foods);
    const names = g.plan.meals.flatMap((m) => m.options.flatMap((o) => o.items.map((i) => i.food_name.toLowerCase())));
    expect(names.some((n) => /frango|bovina|carne/.test(n))).toBe(false);
    expect(names.some((n) => /iogurte|queijo|leite/.test(n))).toBe(false);
  });

  it('"Não como carne vermelha" tira a carne bovina do plano', () => {
    const g = generatePlan(goals, { food_restrictions: ['Sem carne vermelha'], allergies: [], intolerances: [] }, foods);
    const names = g.plan.meals.flatMap((m) => m.options.flatMap((o) => o.items.map((i) => i.food_name.toLowerCase())));
    expect(names.some((n) => /bovina|patinho/.test(n))).toBe(false);
    expect(names.some((n) => /frango/.test(n))).toBe(true);
  });

  it('respeita alergias informadas', () => {
    const g = generatePlan(goals, { food_restrictions: [], allergies: ['ovo'], intolerances: [] }, foods);
    const names = g.plan.meals.flatMap((m) => m.options.flatMap((o) => o.items.map((i) => i.food_name.toLowerCase())));
    expect(names.some((n) => n.startsWith('ovo'))).toBe(false);
  });

  it('distribui a proteína entre as refeições', () => {
    const d = proteinDistribution(120);
    expect(Object.values(d).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(118);
    expect(d.lunch).toBe(36);
  });
});
