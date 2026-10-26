import { referenceFoods } from '../../data/reference';
import { planNutrition } from '../dietPlan';
import { estimateBmr, katchMcArdle, mifflinStJeor, suggestActivityLevel } from '../energy';
import { calculateGoals, LOW_CARB_RANGE, validProteinFactor, type GoalInput } from '../goals';
import { generatePlan } from '../planGenerator';

const today = new Date(2026, 9, 26);
// perfil do usuário (InBody120): 114,3 kg, 1,76 m, 41 anos, massa livre de gordura 73,7 kg
const user: GoalInput['profile'] = {
  birth_date: '1985-07-14', sex: 'male', height_cm: 176, current_weight_kg: 114.3, target_weight_kg: null,
  activity_level: 'sedentary', objective: 'fat_loss', does_resistance_training: true, health_flags: [], hot_climate: false,
  water_ml_per_kg: null, target_date: null,
};
const goals = (p: Partial<GoalInput['profile']> = {}, ffm: number | null = null) => calculateGoals({ profile: { ...user, ...p }, latestFatFreeMassKg: ffm, today });

describe('D — TMB pela massa magra da bioimpedância', () => {
  it('com massa livre de gordura medida usa Katch–McArdle e mostra Mifflin para comparar', () => {
    const r = estimateBmr({ weight_kg: 114.3, height_cm: 176, age: 41, sex: 'male', fat_free_mass_kg: 73.7 })!;
    expect(r.method).toBe('katch_mcardle');
    expect(Math.round(r.kcal)).toBe(1962); // igual à TMB impressa no InBody
    expect(r.explanation).toContain(`${Math.round(mifflinStJeor(114.3, 176, 41, 'male'))} kcal`);
    expect(r.kcal).toBeCloseTo(katchMcArdle(73.7));
  });
  it('sem exame continua com Mifflin (−161 para feminino, +5 para masculino)', () => {
    expect(estimateBmr({ weight_kg: 114.3, height_cm: 176, age: 41, sex: 'male', fat_free_mass_kg: null })!.method).toBe('mifflin_st_jeor');
    expect(mifflinStJeor(70, 165, 40, 'female')).toBe(mifflinStJeor(70, 165, 40, 'male') - 166);
  });
});

describe('C — treino de força coerente com o nível de atividade', () => {
  it('sugere o nível pelo número de treinos, sem rebaixar', () => {
    expect(suggestActivityLevel('sedentary', 0, null)).toBeNull();
    expect(suggestActivityLevel('sedentary', 2, 60)!.suggested).toBe('light');
    expect(suggestActivityLevel('sedentary', 4, 60)).toMatchObject({ suggested: 'moderate', incoherent: true });
    expect(suggestActivityLevel('sedentary', 6, 90)!.suggested).toBe('moderate'); // treino sozinho não vira "muito ativo"
    expect(suggestActivityLevel('active', 2, 40)).toMatchObject({ suggested: 'active', incoherent: false });
    expect(suggestActivityLevel('sedentary', 4, 20)!.suggested).toBe('light'); // treinos curtos
  });
  it('sedentário treinando 4×/semana recebe aviso na meta de calorias', () => {
    const g = goals({ strength_sessions_per_week: 4, strength_session_min: 60 });
    expect(g.activity?.incoherent).toBe(true);
    expect(g.targets.energy_kcal.warnings?.join(' ')).toMatch(/Sedentário.*Moderadamente ativo/);
  });
  it('0 treinos por semana = sem treino de força, mesmo com o botão antigo ligado', () => {
    expect(goals({ strength_sessions_per_week: 0 }).targets.protein_g.value).toBe(Math.round(77.4 * 1.6));
    expect(goals().targets.protein_g.value).toBe(Math.round(77.4 * 1.8));
  });
});

describe('B — padrão de proteína escolhido pelo usuário', () => {
  it('padrão do app continua 1,8 g/kg do peso de referência (139 g)', () => {
    const p = goals().targets.protein_g;
    expect(p.value).toBe(139);
    expect(p.explanation).toContain('Padrão do app para o objetivo: 1,8 g/kg');
  });
  it('2,2 g/kg sobre o peso de referência', () => {
    expect(goals({ protein_g_per_kg: 2.2 }).targets.protein_g.value).toBe(170);
  });
  it('base antiga "massa magra" é tratada como peso de referência (o g/kg vale para o peso corporal)', () => {
    expect(goals({ protein_g_per_kg: 2.0, protein_basis: 'fat_free_mass' }, 73.7).targets.protein_g.value).toBe(155);
  });
  it('peso atual não é usado com IMC ≥ 30 (evita 206–251 g)', () => {
    const p = goals({ protein_g_per_kg: 2.2, protein_basis: 'current' }).targets.protein_g;
    expect(p.value).toBe(170);
    expect(p.warnings?.join(' ')).toMatch(/IMC ≥ 30/);
    expect(goals({ current_weight_kg: 75, protein_g_per_kg: 2.0, protein_basis: 'current' }).targets.protein_g.value).toBe(150);
  });
  it('fora da faixa do objetivo avisa; valores absurdos são ignorados', () => {
    expect(goals({ protein_g_per_kg: 1.2 }).targets.protein_g.warnings?.[0]).toMatch(/fora da faixa usual/);
    expect(validProteinFactor(4)).toBeNull();
    expect(goals({ protein_g_per_kg: 4 }).targets.protein_g.value).toBe(139);
  });
  it('doença renal continua bloqueando a meta automática', () => {
    expect(goals({ protein_g_per_kg: 2.2, health_flags: ['kidney_disease'] }).targets.protein_g.value).toBeNull();
  });
});

describe('A — low carb moderado nas metas', () => {
  it('carboidrato entre 100 e 130 g e gordura completa as calorias', () => {
    const g = goals({ food_restrictions: ['Low carb'] }).targets;
    expect(g.carbs_g.value).toBeGreaterThanOrEqual(LOW_CARB_RANGE[0]);
    expect(g.carbs_g.value).toBeLessThanOrEqual(LOW_CARB_RANGE[1]);
    const kcal = g.protein_g.value! * 4 + g.carbs_g.value! * 4 + g.fat_g.value! * 9;
    expect(Math.abs(kcal - g.energy_kcal.value!)).toBeLessThan(15);
    expect(g.protein_g.value).toBe(goals().targets.protein_g.value); // proteína não muda
  });
  it('sem low carb o cálculo é o de antes', () => {
    expect(goals().targets.carbs_g.value).toBeGreaterThan(130);
  });
  it('com diabetes avisa sobre medicação', () => {
    expect(goals({ food_restrictions: ['Low carb'], health_flags: ['diabetes'] }).targets.carbs_g.warnings?.[0]).toMatch(/medicação/);
  });
});

describe('A — plano orientativo com low carb e menos açúcar', () => {
  const foods = referenceFoods();
  const items = (plan: ReturnType<typeof generatePlan>) => plan.plan.meals.flatMap((m) => m.options.flatMap((o) => o.items.map((i) => i.food_name)));

  it('low carb: carboidrato do dia perto da meta e calorias mantidas', () => {
    const g = goals({ food_restrictions: ['Low carb'] }).targets;
    const plan = generatePlan(g, { food_restrictions: ['Low carb'], allergies: [], intolerances: [] }, foods);
    const n = planNutrition({ meals: plan.plan.meals }).total.values;
    expect(Math.abs(n.carbs_g - g.carbs_g.value!)).toBeLessThan(35);
    expect(Math.abs(n.energy_kcal - g.energy_kcal.value!)).toBeLessThan(250);
    const normal = planNutrition({ meals: generatePlan(goals().targets, { food_restrictions: [], allergies: [], intolerances: [] }, foods).plan.meals }).total.values;
    expect(n.carbs_g).toBeLessThan(normal.carbs_g * 0.7);
    expect(plan.explanations.join(' ')).toMatch(/Low carb moderado/);
  });

  it('menos açúcar: nada doce, frutas menos doces', () => {
    const plan = generatePlan(goals().targets, { food_restrictions: ['Pouco açúcar'], allergies: [], intolerances: [] }, foods);
    const names = items(plan).join(' | ').toLowerCase();
    expect(names).not.toMatch(/banana|açúcar|doce|suco|mel,/);
    expect(names).toMatch(/morango/);
    expect(plan.explanations.join(' ')).toMatch(/Menos açúcar/);
  });
});
