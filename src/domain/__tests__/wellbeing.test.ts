import { creatineCaution, creatineStatus, CREATINE_GUIDE } from '../creatine';
import { addDays } from '../dates';
import { hydrationTips } from '../hydrationTips';
import type { DiaryEntry, WaterLog } from '../types';
import { analyzeSwelling, RED_FLAGS, type SwellingInput } from '../wellbeing';

const today = '2026-10-26';
let n = 0;
const entry = (date: string, food_name: string, nutrients: DiaryEntry['nutrients'] = {}, compounds: DiaryEntry['compounds'] = null): DiaryEntry => ({
  id: `e${n++}`, user_id: 'u', created_at: '', date, meal: 'lunch', custom_meal_name: null, consumed_at: null, food_id: 'x', food_name, amount: 100, unit: 'g',
  servings: null, per100_snapshot: nutrients, nutrients, compounds, source: 'taco', verification: 'reported', origin: 'search', group_id: null, note: null,
});
const creatineOn = (date: string) => entry(date, 'Creatina', {}, { creatine_g: 5 });

describe('creatina', () => {
  it('3–5 g/dia como padrão; saturação só como opção', () => {
    expect(CREATINE_GUIDE.dose).toMatch(/3–5 g por dia/);
    expect(CREATINE_GUIDE.loading).toMatch(/Opcional/);
    expect(CREATINE_GUIDE.notProtein).toMatch(/não é proteína/);
  });
  it('sem recomendação automática para renal, gestação, amamentação e menores', () => {
    expect(creatineCaution(['kidney_disease'], 40)).toMatch(/médico/);
    expect(creatineCaution(['pregnancy'], 30)).toMatch(/gestação/);
    expect(creatineCaution([], 16)).toMatch(/18 anos/);
    expect(creatineCaution([], 41)).toBeNull();
  });
  it('dias seguidos, início recente e retomada após pausa', () => {
    const s = creatineStatus([0, 1, 2, 3].map((i) => creatineOn(addDays(today, -i))), today);
    expect(s).toMatchObject({ takenToday: true, gramsToday: 5, streak: 4, startedOn: addDays(today, -3), recentStart: true });
    const ontem = creatineStatus([creatineOn(addDays(today, -1)), creatineOn(addDays(today, -2))], today);
    expect(ontem).toMatchObject({ takenToday: false, streak: 2 });
    const antigo = creatineStatus([creatineOn(addDays(today, -50)), ...[0, 1, 2].map((i) => creatineOn(addDays(today, -i)))], today);
    expect(antigo.startedOn).toBe(addDays(today, -2)); // pausa longa: novo início
    const longo = creatineStatus(Array.from({ length: 40 }, (_, i) => creatineOn(addDays(today, -i))), today);
    expect(longo.recentStart).toBe(false);
  });
});

describe('dicas de hidratação', () => {
  it('dicas gerais com referência da EFSA', () => {
    const { tips, caution } = hydrationTips([]);
    expect(caution).toBeNull();
    expect(tips.join(' ')).toMatch(/cor da urina/);
    expect(tips.join(' ')).toMatch(/2,5 L\/dia para homens/);
  });
  it('doença renal ou cardíaca: só orientação médica', () => {
    expect(hydrationTips(['heart_failure'])).toMatchObject({ tips: [] });
    expect(hydrationTips(['kidney_disease']).caution).toMatch(/médico/);
  });
});

describe('inchaço e retenção: o que pode ter contribuído', () => {
  const base = (over: Partial<SwellingInput>): SwellingInput => ({
    kind: 'fluid_retention', date: today, entries: [], waterLogs: [], water: [], creatine: null, sex: 'male', intolerances: [], ...over,
  });

  it('sódio acima de 2.000 mg, avisando quando há itens sem sódio', () => {
    const a = analyzeSwelling(base({ entries: [entry(today, 'Presunto', { sodium_mg: 1500 }), entry(today, 'Pão', { sodium_mg: 700 }), entry(today, 'Torta caseira', {})] }));
    const c = a.contributors.find((x) => x.id === 'sodium')!;
    expect(c.detail).toMatch(/2\.200 mg/);
    expect(c.detail).toMatch(/1 item\(ns\) sem sódio/);
    // ausente não vira zero nem acusa sódio
    expect(analyzeSwelling(base({ entries: [entry(today, 'Torta', {})] })).contributors.some((x) => x.id === 'sodium')).toBe(false);
  });

  it('pouca água, volta do carboidrato, creatina e industrializados', () => {
    const entries = [
      ...[-4, -3, -2].map((d) => entry(addDays(today, d), 'Ovos', { carbs_g: 60 })),
      entry(addDays(today, -1), 'Pizza', { carbs_g: 220, sodium_mg: 900 }),
      entry(today, 'Salsicha', { carbs_g: 5, sodium_mg: 600 }),
    ];
    const a = analyzeSwelling(base({
      entries,
      water: [{ date: today, counted_ml: 900, goal_ml: 2700 }],
      creatine: { takenToday: true, gramsToday: 5, streak: 10, startedOn: addDays(today, -10), recentStart: true },
    }));
    expect(a.contributors.map((c) => c.id)).toEqual(expect.arrayContaining(['low_water', 'carb_rebound', 'creatine', 'processed']));
    expect(a.tips[0]).toMatch(/água em dia/);
  });

  it('barriga estufada: gás, fibras de repente, fermentáveis e lactose', () => {
    const entries = [
      ...[-4, -3, -2].map((d) => entry(addDays(today, d), 'Arroz', { fiber_g: 10 })),
      entry(today, 'Feijão, carioca, cozido', { fiber_g: 20 }),
      entry(today, 'Repolho, cru', { fiber_g: 12 }),
      entry(today, 'Queijo, minas, frescal', {}),
    ];
    const waterLogs: WaterLog[] = [{ id: 'w', user_id: 'u', created_at: '', date: today, logged_at: '', volume_ml: 350, beverage: 'soda', container_id: null }];
    const a = analyzeSwelling(base({ kind: 'bloating', entries, waterLogs, intolerances: ['lactose'] }));
    expect(a.contributors.map((c) => c.id)).toEqual(expect.arrayContaining(['carbonated', 'fiber_jump', 'gassy_foods', 'lactose']));
    expect(a.tips.join(' ')).toMatch(/devagar/);
  });

  it('sinais de alerta sempre presentes; lembrete do ciclo para mulheres; sem registros avisa', () => {
    const a = analyzeSwelling(base({ sex: 'female' }));
    expect(a.redFlags).toBe(RED_FLAGS.fluid_retention);
    expect(analyzeSwelling(base({ kind: 'bloating' })).redFlags.join(' ')).toMatch(/Sangue nas fezes/);
    expect(a.redFlags.join(' ')).toMatch(/uma perna só/);
    expect(a.notes.join(' ')).toMatch(/menstruação/);
    expect(a.notes.join(' ')).toMatch(/Sem refeições registradas/);
    expect(a.contributors).toEqual([]);
  });
});
