/** Testes A–E da especificação "Revisão do motor de cálculo" (v1.0), com a política atual do app. */
import { estimateTdee, mifflinStJeor } from '../energy';
import { calculateGoals, GOAL_KEYS, validateGoalInput, type GoalInput } from '../goals';

const today = new Date(2026, 9, 26);
const p: GoalInput['profile'] = {
  birth_date: '1985-07-14', sex: 'male', height_cm: 176, current_weight_kg: 110, target_weight_kg: 90,
  activity_level: 'sedentary', objective: 'fat_loss', does_resistance_training: false, health_flags: [], hot_climate: false, water_ml_per_kg: null, target_date: null,
};
const goals = (o: Partial<GoalInput['profile']> = {}) => calculateGoals({ profile: { ...p, ...o }, today });

describe('Teste A — masculino sedentário', () => {
  it('metabolismo de repouso 2.000 kcal e gasto total 2.400 kcal', () => {
    expect(mifflinStJeor(110, 176, 41, 'male')).toBe(2000);
    expect(estimateTdee(2000, 'sedentary').kcal).toBe(2400);
    const g = goals();
    expect(g.tdee?.kcal).toBe(2400);
    expect(g.bmr?.explanation).toMatch(/Metabolismo de repouso estimado/);
  });
  it('emagrecimento moderado (15%): 2.040 kcal, como na especificação', () => {
    expect(goals().targets.energy_kcal.value).toBe(2040);
    expect(goals({ deficit_pct: 10 }).targets.energy_kcal.value).toBe(2160);
  });
  it('ritmo intenso (20%) abaixo do metabolismo de repouso: alerta, sem travar', () => {
    const e = goals({ deficit_pct: 20 }).targets.energy_kcal;
    expect(e.value).toBe(1920);
    expect(e.warnings?.join(' ')).toMatch(/abaixo do seu metabolismo de repouso/);
  });
  it('1.500 kcal (homens) / 1.200 kcal (mulheres) continuam como mínimo', () => {
    const e = goals({ current_weight_kg: 55, height_cm: 150, sex: 'female', deficit_pct: 20, birth_date: '1950-01-01' }).targets.energy_kcal;
    expect(e.value).toBe(1200);
    expect(e.warnings?.join(' ')).toMatch(/mínimo para metas automáticas/);
    expect(goals({ deficit_pct: 35 }).targets.energy_kcal.value).toBe(2040); // valor inválido volta ao padrão
  });
});

describe('Teste B — feminino sedentário', () => {
  it('1.834 kcal e 2.200,8 kcal com precisão interna', () => {
    expect(mifflinStJeor(110, 176, 41, 'female')).toBe(1834);
    expect(estimateTdee(1834, 'sedentary').kcal).toBeCloseTo(2200.8, 6);
  });
});

describe('Teste C — fechamento dos macronutrientes', () => {
  it('proteína + gordura + carboidrato fecham a meta (tolerância de apresentação ≤ 5 kcal)', () => {
    for (const o of [{}, { sex: 'female' as const }, { protein_g_per_kg: 2.2 }, { food_restrictions: ['Low carb'] }, { objective: 'muscle_gain' as const }]) {
      const t = goals(o).targets;
      const kcal = t.protein_g.value! * 4 + t.fat_g.value! * 9 + t.carbs_g.value! * 4;
      expect(Math.abs(kcal - t.energy_kcal.value!)).toBeLessThanOrEqual(5);
    }
  });
  it('fibras: 14 g por 1.000 kcal', () => {
    expect(goals({ activity_level: 'very_active' }).targets.fiber_g.value).toBe(Math.round((goals({ activity_level: 'very_active' }).targets.energy_kcal.value! / 1000) * 14));
  });
});

describe('Teste D — proteína na obesidade', () => {
  it('base no peso-alvo de 90 kg com 1,6 g/kg = 144 g (exemplo da especificação)', () => {
    const t = goals({ protein_g_per_kg: 1.6, protein_basis: 'target_weight' }).targets.protein_g;
    expect(t.value).toBe(144);
    expect(t.explanation).toMatch(/seu peso-alvo \(90 kg\)/);
  });
  it('peso-alvo implausível volta para o peso de referência', () => {
    for (const target_weight_kg of [120, 50, null]) {
      const t = goals({ protein_g_per_kg: 1.6, protein_basis: 'target_weight', target_weight_kg }).targets.protein_g;
      expect(t.value).toBe(Math.round(77.4 * 1.6));
      expect(t.warnings?.[0]).toMatch(/peso-alvo precisa ser menor/);
    }
  });
  it('nunca 2,2 g/kg sobre os 110 kg', () => {
    const t = goals({ protein_g_per_kg: 2.2, protein_basis: 'current' }).targets.protein_g;
    expect(t.value).toBeLessThan(110 * 2.2 * 0.8);
    expect(t.warnings?.join(' ')).toMatch(/IMC ≥ 30/);
    expect(t.explanation).toMatch(/2,2 g\/kg × 77,4 kg/);
  });
});

describe('Teste E — dados inconsistentes', () => {
  it.each([
    ['peso negativo', { current_weight_kg: -10 }],
    ['peso absurdo', { current_weight_kg: 900 }],
    ['altura em metros', { height_cm: 1.76 }],
    ['altura zero', { height_cm: 0 }],
    ['data futura', { birth_date: '2030-01-01' }],
  ])('%s: nenhuma meta calculada', (_, o) => {
    const g = goals(o as Partial<GoalInput['profile']>);
    for (const k of GOAL_KEYS) expect(g.targets[k].value).toBeNull();
    expect(g.targets.energy_kcal.explanation).toMatch(/Confira em Perfil/);
  });
  it('menor de 18 anos não recebe meta automática', () => {
    const g = goals({ birth_date: '2011-01-01' });
    expect(g.targets.energy_kcal.value).toBeNull();
    expect(g.targets.energy_kcal.explanation).toMatch(/menores de 18 anos/);
  });
  it('sem sexo para a equação: pede o dado, não infere', () => {
    const g = goals({ sex: null });
    expect(g.targets.energy_kcal.value).toBeNull();
    expect(g.missingData).toContain('sexo biológico (usado nas equações)');
  });
  it('bioimpedância sem massa magra não substitui nada', () => {
    expect(calculateGoals({ profile: p, latestFatFreeMassKg: null, today }).bmr?.method).toBe('mifflin_st_jeor');
  });
  it('validação isolada', () => {
    expect(validateGoalInput({ current_weight_kg: 80, height_cm: 170 }, 30)).toEqual({ errors: [], minor: false });
    expect(validateGoalInput({ current_weight_kg: null, height_cm: null }, null).errors).toEqual([]);
  });
  it('toda meta cita a fonte', () => {
    for (const k of GOAL_KEYS) expect(goals().targets[k].source).toBeTruthy();
  });
});
