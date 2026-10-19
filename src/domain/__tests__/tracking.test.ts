import { summarizeHydration, hydrationNudge, goalAttainment } from '../hydration';
import { summarizeDay, proteinMessage } from '../daySummary';
import { compareAssessments, interpret, trend, movingAverage, validateAssessmentDraft } from '../bodyComposition';
import { planNutrition, planFindings, assertEditable } from '../dietPlan';
import { planNotifications, defaultSettings, isQuiet } from '../notifications';
import { estimateActivityKcal, dedupeActivities, exerciseCaloriesCredit, weeklyActivity } from '../activities';
import { buildReport, toCSV } from '../reports';
import { calculateGoals } from '../goals';
import type { ActivityLog, DiaryEntry, DietPlan, NotificationSetting, WaterLog } from '../types';
import { makeAssessment } from './fixtures';

const water = (ml: number, beverage: WaterLog['beverage'] = 'water', at = '2026-10-19T09:00:00'): WaterLog => ({
  id: Math.random().toString(),
  user_id: 'u1',
  created_at: at,
  date: '2026-10-19',
  logged_at: at,
  volume_ml: ml,
  beverage,
  container_id: null,
});

describe('Cenário 1: registrar 250 ml reduz o restante', () => {
  it('reduz corretamente', () => {
    const before = summarizeHydration('2026-10-19', [], 2000);
    const after = summarizeHydration('2026-10-19', [water(250)], 2000);
    expect(before.remaining_ml).toBe(2000);
    expect(after.remaining_ml).toBe(1750);
    expect(after.pct).toBeCloseTo(12.5);
  });
  it('diferencia água pura, outras bebidas e bebidas que não contam', () => {
    const s = summarizeHydration('2026-10-19', [water(250), water(200, 'coffee'), water(350, 'soda')], 2000);
    expect(s.pure_water_ml).toBe(250);
    expect(s.other_counted_ml).toBe(200);
    expect(s.not_counted_ml).toBe(350);
    expect(s.counted_ml).toBe(450);
  });
  it('lembrete não incentiva compensação excessiva', () => {
    const s = summarizeHydration('2026-10-19', [water(100)], 3000);
    const n = hydrationNudge(s, new Date(2026, 9, 19, 18, 0));
    expect(n.behind).toBe(true);
    expect(n.suggested_ml!).toBeLessThanOrEqual(300);
    expect(n.message).not.toMatch(/deveria|falhou|atrasad/i);
  });
  it('meta atingida considera só dias com registro', () => {
    const days = [summarizeHydration('d1', [], 2000), { ...summarizeHydration('2026-10-19', [water(2000)], 2000) }];
    expect(goalAttainment(days)).toEqual({ daysWithLogs: 1, daysMet: 1, pct: 100 });
  });
});

const goals = calculateGoals({
  profile: {
    birth_date: '1986-01-01', sex: 'male', height_cm: 178, current_weight_kg: 90, target_weight_kg: 80,
    activity_level: 'moderate', objective: 'fat_loss', does_resistance_training: true, health_flags: [],
    hot_climate: false, water_ml_per_kg: null, target_date: null,
  },
  today: new Date(2026, 9, 19),
}).targets;

describe('Cenário 15: dashboard sem registros não assume consumo zero', () => {
  it('sem registros', () => {
    const d = summarizeDay({ date: '2026-10-19', entries: [], waterLogs: [], activities: [], goals });
    expect(d.hasFoodRecords).toBe(false);
    expect(d.protein.consumed).toBeNull();
    expect(d.protein.pct).toBeNull();
    expect(d.energy.consumed).toBeNull();
    expect(d.water.consumed).toBeNull();
    expect(proteinMessage(d.protein)).toMatch(/Nenhuma refeição registrada/);
  });
  it('com registro mostra restante', () => {
    const entry = { date: '2026-10-19', meal: 'lunch', nutrients: { protein_g: 50, energy_kcal: 500 }, compounds: null } as unknown as DiaryEntry;
    const d = summarizeDay({ date: '2026-10-19', entries: [entry], waterLogs: [], activities: [], goals });
    expect(d.protein.consumed).toBe(50);
    expect(d.protein.remaining).toBe(goals.protein_g.value! - 50);
    expect(d.partial).toEqual(expect.arrayContaining(['carbs_g']));
  });
});

describe('Cenário 8: comparação de exames por data e indicador', () => {
  const a1 = makeAssessment({
    measured_at: '2026-06-01T08:00:00Z',
    metrics: {
      weight_kg: { value: 90, unit: 'kg' },
      fat_mass_kg: { value: 30, unit: 'kg' },
      body_fat_pct: { value: 33.3, unit: '%' },
      skeletal_muscle_mass_kg: { value: 33, unit: 'kg' },
      total_body_water_l: { value: 44, unit: 'L' },
    },
  });
  const a2 = makeAssessment({
    measured_at: '2026-08-01T08:00:00Z',
    metrics: {
      weight_kg: { value: 86, unit: 'kg' },
      fat_mass_kg: { value: 26.5, unit: 'kg' },
      body_fat_pct: { value: 30.8, unit: '%' },
      skeletal_muscle_mass_kg: { value: 32.8, unit: 'kg' },
      total_body_water_l: { value: 43.8, unit: 'l' },
      phase_angle_deg: { value: 6, unit: '°' },
    },
  });

  it('calcula variações absolutas, percentuais e em pontos percentuais', () => {
    const c = compareAssessments(a2, a1); // ordem invertida é corrigida pela data
    expect(c.fromDate).toBe(a1.measured_at);
    expect(c.days).toBe(61);
    const fat = c.changes.find((x) => x.key === 'fat_mass_kg')!;
    expect(fat.abs).toBe(-3.5);
    expect(fat.pct).toBeCloseTo(-11.7, 1);
    expect(fat.unit).toBe('kg');
    expect(fat.direction).toBe('improved');
    const pct = c.changes.find((x) => x.key === 'body_fat_pct')!;
    expect(pct.pp).toBe(-2.5);
    expect(pct.pct).toBeNull();
    const smm = c.changes.find((x) => x.key === 'skeletal_muscle_mass_kg')!;
    expect(smm.direction).toBe('stable');
    // ângulo de fase só existe no segundo exame: não é comparado
    expect(c.changes.find((x) => x.key === 'phase_angle_deg')).toBeUndefined();
    // "L" e "l" são a mesma unidade
    expect(c.changes.find((x) => x.key === 'total_body_water_l')).toBeDefined();
  });

  it('interpretação cautelosa', () => {
    const i = interpret(compareAssessments(a1, a2));
    expect(i.fatLoss).toBe('likely');
    expect(i.leanPreserved).toBe('likely');
    expect(i.caveats.join(' ')).toMatch(/hidratação/);
    expect(i.caveats.join(' ')).toMatch(/não permite diagnosticar/);
  });

  it('não compara unidades diferentes', () => {
    const b = makeAssessment({ measured_at: '2026-09-01T08:00:00Z', metrics: { weight_kg: { value: 190, unit: 'lb' } } });
    const c = compareAssessments(a1, b);
    expect(c.unitMismatches).toContain('weight_kg');
    expect(c.changes).toHaveLength(0);
  });

  it('tendência consistente exige 3+ pontos', () => {
    const a3 = makeAssessment({ measured_at: '2026-09-01T08:00:00Z', metrics: { fat_mass_kg: { value: 25, unit: 'kg' } } });
    const t = trend([a1, a2, a3], 'fat_mass_kg', 120, new Date('2026-09-02T00:00:00Z'));
    expect(t.direction).toBe('down');
    expect(t.consistent).toBe(true);
    expect(trend([a1, a2], 'fat_mass_kg', 30, new Date('2026-08-02T00:00:00Z')).direction).toBe('insufficient');
  });

  it('média móvel suaviza oscilações', () => {
    const m = movingAverage([
      { date: '2026-10-01', value: 80 },
      { date: '2026-10-02', value: 81 },
      { date: '2026-10-03', value: 79 },
    ]);
    expect(m[2].value).toBe(80);
  });

  it('valida rascunho', () => {
    expect(validateAssessmentDraft({ measured_at: '', metrics: {} }).errors.length).toBeGreaterThan(0);
    const v = validateAssessmentDraft({ measured_at: '2026-01-01', metrics: { weight_kg: { value: 80, unit: 'kg' }, fat_mass_kg: { value: 20, unit: 'kg' }, fat_free_mass_kg: { value: 55, unit: 'kg' } } });
    expect(v.errors).toEqual([]);
    expect(v.warnings.join(' ')).toMatch(/1,5 kg/);
  });
});

describe('Cenário 9: dieta com alternativas não soma todas as opções', () => {
  const item = (name: string, g: number, kcal: number, protein: number) => ({
    food_name: name, amount: g, unit: 'g', amount_g: g, food_id: name, note: null,
    per100: { energy_kcal: (kcal * 100) / g, protein_g: (protein * 100) / g, carbs_g: 0, fat_g: 0, fiber_g: 0 },
  });
  const plan: Pick<DietPlan, 'meals'> = {
    meals: [
      {
        name: 'Café da manhã', meal: 'breakfast', time: '07:00', selected_option: 0,
        options: [
          { label: 'Opção 1', items: [item('pão', 50, 150, 4), item('ovo', 100, 146, 13)] },
          { label: 'Opção 2', items: [item('tapioca', 60, 200, 0), item('queijo', 30, 90, 7)] },
        ],
      },
      { name: 'Almoço', meal: 'lunch', time: '12:00', selected_option: 0, options: [{ label: 'Única', items: [item('frango', 150, 240, 48)] }] },
    ],
  };

  it('total usa somente a opção selecionada de cada refeição', () => {
    const n = planNutrition(plan);
    expect(n.total.values.energy_kcal).toBeCloseTo(150 + 146 + 240);
    expect(n.total.values.protein_g).toBeCloseTo(4 + 13 + 48);
    expect(n.range.energy_kcal).toEqual([290 + 240, 296 + 240]);
  });

  it('faixa considera escolha de outras alternativas', () => {
    const n = planNutrition({ meals: [{ ...plan.meals[0], selected_option: 1 }, plan.meals[1]] });
    expect(n.total.values.energy_kcal).toBeCloseTo(290 + 240);
    expect(n.range.energy_kcal![0]).toBeCloseTo(290 + 240);
    expect(n.range.energy_kcal![1]).toBeCloseTo(296 + 240);
  });

  it('aponta concentração de proteína e diferença da meta', () => {
    const f = planFindings(planNutrition(plan), goals);
    expect(f.map((x) => x.message).join(' ')).toMatch(/Proteína|Energia/);
  });

  it('plano prescrito é bloqueado para alterações automáticas', () => {
    expect(() => assertEditable({ locked: true }, 'ai')).toThrow(/bloqueado/);
    expect(() => assertEditable({ locked: true }, 'user')).not.toThrow();
  });
});

describe('Cenário 10: desativar um tipo de notificação não interrompe os demais', () => {
  const settings = defaultSettings().map((s) => ({ ...s, enabled: true })) as NotificationSetting[];

  it('remove apenas o tipo desativado', () => {
    const all = planNotifications(settings);
    const withoutWater = planNotifications(settings.map((s) => (s.kind === 'water' ? { ...s, enabled: false } : s)));
    expect(withoutWater.some((p) => p.kind === 'water')).toBe(false);
    const others = (list: typeof all) => list.filter((p) => p.kind !== 'water').map((p) => p.id);
    expect(others(withoutWater)).toEqual(others(all));
    expect(withoutWater.some((p) => p.kind === 'lunch')).toBe(true);
  });

  it('respeita horário de descanso e dias da semana', () => {
    expect(isQuiet('23:00', '22:00', '07:00')).toBe(true);
    expect(isQuiet('12:00', '22:00', '07:00')).toBe(false);
    const plan = planNotifications([{ ...settings.find((s) => s.kind === 'lunch')!, weekdays: [1, 2], times: ['12:30', '23:30'] }]);
    expect(plan.map((p) => p.id)).toEqual(['lunch:1:12:30', 'lunch:2:12:30']);
  });

  it('lembretes de água ficam dentro da janela e com intervalo mínimo', () => {
    const plan = planNotifications([{ ...settings.find((s) => s.kind === 'water')!, weekdays: [1], interval_min: 10 }]);
    expect(plan.length).toBeLessThanOrEqual(25);
    expect(plan[0].time).toBe('08:00');
    expect(plan[1].time).toBe('08:30');
  });
});

describe('atividades', () => {
  const act = (o: Partial<ActivityLog>): ActivityLog => ({
    id: Math.random().toString(), user_id: 'u1', created_at: '', date: '2026-10-19', started_at: '2026-10-19T18:00:00Z',
    type: 'walking', custom_name: null, duration_min: 60, intensity: 'moderate', rpe: null, distance_km: null, notes: null,
    kcal_estimated: 200, kcal_source: 'met', source: 'manual', external_id: null, ...o,
  });
  it('estimativa por MET líquido com faixa de incerteza', () => {
    const e = estimateActivityKcal('walking', 'moderate', 60, 80)!;
    expect(e.kcal).toBe(Math.round((3.5 - 1) * 80));
    expect(e.low).toBeLessThan(e.kcal);
    expect(e.high).toBeGreaterThan(e.kcal);
  });
  it('não conta duas vezes a mesma atividade', () => {
    const { kept, duplicates } = dedupeActivities([act({}), act({ source: 'device', started_at: '2026-10-19T18:05:00Z', kcal_estimated: 220 })]);
    expect(kept).toHaveLength(1);
    expect(kept[0].source).toBe('device');
    expect(duplicates).toHaveLength(1);
  });
  it('calorias de exercício não viram crédito alimentar por padrão', () => {
    expect(exerciseCaloriesCredit([act({})])).toBe(0);
    expect(exerciseCaloriesCredit([act({})], 50)).toBe(100);
  });
  it('resumo semanal', () => {
    const w = weeklyActivity([act({}), act({ date: '2026-10-20', started_at: '2026-10-20T18:00:00Z', type: 'strength', duration_min: 45 }), act({ date: '2026-10-21', started_at: '2026-10-21T18:00:00Z', duration_min: 50 })], '2026-10-19');
    expect(w.sessions).toBe(3);
    expect(w.strengthSessions).toBe(1);
    expect(w.meetsWhoMinimum).toBe(true);
  });
});

describe('relatórios', () => {
  it('médias consideram apenas dias com registro e informam lacunas', () => {
    const e = (date: string, kcal: number, protein: number) => ({ date, meal: 'lunch', nutrients: { energy_kcal: kcal, protein_g: protein, carbs_g: 0, fat_g: 0, fiber_g: 0 } }) as unknown as DiaryEntry;
    const r = buildReport({
      from: '2026-10-13', to: '2026-10-19',
      entries: [e('2026-10-13', 1800, 100), e('2026-10-14', 2000, 120)],
      waterLogs: [], activities: [], weights: [], assessments: [], goals,
    });
    expect(r.food.daysWithRecords).toBe(2);
    expect(r.food.avgKcal).toBe(1900);
    expect(r.confidence).toBe('baixa');
    expect(r.missing.join(' ')).toMatch(/5 de 7 dias sem registro/);
  });
  it('CSV usa ; e vírgula decimal', () => {
    expect(toCSV([{ a: 1.5, b: 'x;y' }])).toBe('a;b\n1,5;"x;y"');
  });
});
