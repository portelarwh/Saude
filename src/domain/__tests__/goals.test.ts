import { estimateBmr, mifflinStJeor, katchMcArdle } from '../energy';
import { assessTimeline, calculateGoals, mergeSystemSuggestions, progress, referenceWeight, setTarget } from '../goals';
import type { GoalInput } from '../goals';

const today = new Date(2026, 9, 19);

const baseProfile: GoalInput['profile'] = {
  birth_date: '1986-10-19', // 40 anos em 19/10/2026
  sex: 'female',
  height_cm: 165,
  current_weight_kg: 80,
  target_weight_kg: 70,
  activity_level: 'light',
  objective: 'fat_loss',
  does_resistance_training: true,
  health_flags: [],
  hot_climate: false,
  water_ml_per_kg: null,
  target_date: null,
};

describe('equações de gasto energético', () => {
  it('Mifflin–St Jeor segue a fórmula publicada', () => {
    // 10*80 + 6.25*165 - 5*40 - 161 = 800 + 1031.25 - 200 - 161
    expect(mifflinStJeor(80, 165, 40, 'female')).toBeCloseTo(1470.25);
    expect(mifflinStJeor(80, 180, 30, 'male')).toBeCloseTo(800 + 1125 - 150 + 5);
  });

  it('usa Katch–McArdle quando só há massa livre de gordura', () => {
    const r = estimateBmr({ weight_kg: 80, height_cm: null, age: null, sex: null, fat_free_mass_kg: 50 });
    expect(r?.method).toBe('katch_mcardle');
    expect(r?.kcal).toBeCloseTo(katchMcArdle(50));
  });

  it('não estima sem dados suficientes', () => {
    expect(estimateBmr({ weight_kg: 80, height_cm: 165, age: null, sex: null })).toBeNull();
  });
});

describe('metas orientativas', () => {
  it('calcula todas as metas com explicação', () => {
    const r = calculateGoals({ profile: baseProfile, today });
    expect(r.bmr?.kcal).toBeCloseTo(1470.25);
    expect(r.tdee?.kcal).toBeCloseTo(1470.25 * 1.375);
    const t = r.targets;
    // déficit de 20% do GET (≈404 kcal), limitado pelo piso (TMB)
    expect(t.energy_kcal.value).toBe(Math.round((1470.25 * 1.375 * 0.8) / 10) * 10);
    expect(t.energy_kcal.explanation).toMatch(/Mifflin/);
    expect(t.protein_g.value).toBe(Math.round(80 * 1.8)); // IMC 29,4 -> peso atual
    expect(t.fiber_g.value).toBeGreaterThanOrEqual(25);
    expect(t.water_ml.value).toBe(2800); // 35 ml/kg × 80 kg
    for (const k of Object.keys(t) as (keyof typeof t)[]) expect(t[k].origin).toBe('system');
  });

  it('em obesidade usa peso de referência para proteína (não o peso total)', () => {
    const ref = referenceWeight(120, 165);
    expect(ref.kg).toBeCloseTo(25 * 1.65 * 1.65, 0);
    const r = calculateGoals({ profile: { ...baseProfile, current_weight_kg: 120 }, today });
    expect(r.targets.protein_g.value).toBe(Math.round(ref.kg * 1.8));
    expect(r.targets.protein_g.value!).toBeLessThan(120 * 1.6);
  });

  it('não sugere proteína elevada nem meta de líquidos com doença renal', () => {
    const r = calculateGoals({ profile: { ...baseProfile, health_flags: ['kidney_disease'] }, today });
    expect(r.targets.protein_g.value).toBeNull();
    expect(r.targets.protein_g.warnings?.[0]).toMatch(/médico ou nutricionista/);
    expect(r.targets.water_ml.value).toBeNull();
  });

  it('não cria déficit automático na gestação', () => {
    const r = calculateGoals({ profile: { ...baseProfile, health_flags: ['pregnancy'] }, today });
    expect(r.targets.energy_kcal.value).toBeNull();
  });

  it('meta calórica nunca fica abaixo da TMB', () => {
    const r = calculateGoals({ profile: { ...baseProfile, activity_level: 'sedentary', current_weight_kg: 55, height_cm: 155 }, today });
    expect(r.targets.energy_kcal.value!).toBeGreaterThanOrEqual(Math.floor(r.bmr!.kcal / 10) * 10);
  });

  it('informa dados faltantes', () => {
    const r = calculateGoals({ profile: { ...baseProfile, sex: null, birth_date: null }, today });
    expect(r.targets.energy_kcal.value).toBeNull();
    expect(r.missingData).toEqual(expect.arrayContaining(['data de nascimento']));
  });
});

describe('prioridade de metas', () => {
  it('recálculo não altera metas profissionais nem do usuário', () => {
    const sys = calculateGoals({ profile: baseProfile, today }).targets;
    let current = setTarget(sys, 'protein_g', 110, 'professional', { actor: 'user', professional_name: 'Dra. Ana' });
    current = setTarget(current, 'water_ml', 2000, 'user', { actor: 'user' });
    const newer = calculateGoals({ profile: { ...baseProfile, current_weight_kg: 75 }, today }).targets;
    const merged = mergeSystemSuggestions(current, newer);
    expect(merged.protein_g).toMatchObject({ value: 110, origin: 'professional' });
    expect(merged.water_ml).toMatchObject({ value: 2000, origin: 'user' });
    expect(merged.energy_kcal.value).toBe(newer.energy_kcal.value);
  });

  it('IA não pode alterar metas', () => {
    const sys = calculateGoals({ profile: baseProfile, today }).targets;
    expect(() => setTarget(sys, 'protein_g', 200, 'user', { actor: 'ai' })).toThrow();
  });
});

describe('progresso', () => {
  it('mostra meta, consumido, percentual e restante', () => {
    expect(progress(120, 90)).toEqual({ target: 120, consumed: 90, pct: 75, remaining: 30, exceeded: false });
  });
  it('ausência de registro não vira zero', () => {
    const p = progress(120, null);
    expect(p.consumed).toBeNull();
    expect(p.pct).toBeNull();
  });
});

describe('viabilidade do prazo', () => {
  it('sinaliza prazo inseguro', () => {
    const r = assessTimeline(80, 70, '2026-11-19', today); // 10 kg em ~4 semanas
    expect(r.status).toBe('unsafe');
    expect(r.suggestedWeeks).toBeGreaterThan(10);
  });
  it('aceita ritmo sustentável', () => {
    expect(assessTimeline(80, 75, '2027-03-01', today).status).toBe('ok');
  });
});
