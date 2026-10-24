import { dailyNutrientSeries, dailyWaterSeries, macroEnergySplit } from '../reports';
import type { DiaryEntry, WaterLog } from '../types';
import { loggingStreak, MEAL_SHARE, mealTargets } from '../daySummary';

describe('painel', () => {
  it('distribuição por refeição soma 100%', () => {
    expect(Object.values(MEAL_SHARE).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(mealTargets(2000)).toMatchObject({ breakfast: 500, lunch: 600, dinner: 400 });
    expect(mealTargets(null)).toEqual({});
  });

  it('sequência de dias com registro', () => {
    expect(loggingStreak(['2026-10-24', '2026-10-23', '2026-10-21'], '2026-10-24')).toBe(2);
    // hoje ainda sem registro não zera a sequência
    expect(loggingStreak(['2026-10-23', '2026-10-22'], '2026-10-24')).toBe(2);
    expect(loggingStreak([], '2026-10-24')).toBe(0);
    expect(loggingStreak(['2026-10-01', '2026-09-30'], '2026-10-01')).toBe(2);
  });
});

describe('séries dos relatórios', () => {
  const e = (date: string, p: number, c: number, f: number) => ({ date, nutrients: { protein_g: p, carbs_g: c, fat_g: f, energy_kcal: p * 4 + c * 4 + f * 9 } }) as unknown as DiaryEntry;
  it('dia sem registro é null, não zero', () => {
    const s = dailyNutrientSeries([e('2026-10-20', 30, 50, 10)], '2026-10-20', '2026-10-22', 'protein_g');
    expect(s.map((x) => x.value)).toEqual([30, null, null]);
  });
  it('água por dia', () => {
    const w = { date: '2026-10-21', logged_at: '2026-10-21T10:00:00Z', volume_ml: 500, beverage: 'water' } as WaterLog;
    expect(dailyWaterSeries([w], '2026-10-20', '2026-10-21', 2000).map((x) => x.value)).toEqual([null, 500]);
  });
  it('divisão de calorias entre macros', () => {
    const split = macroEnergySplit([e('2026-10-20', 100, 100, 0)], '2026-10-20', '2026-10-26')!;
    expect(split.protein).toBeCloseTo(0.5);
    expect(split.fat).toBe(0);
    expect(macroEnergySplit([], '2026-10-20', '2026-10-26')).toBeNull();
  });
});
