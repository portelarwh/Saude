import { referenceFoods } from '../../data/reference';
import { calculateGoals } from '../../domain/goals';
import type { DiaryEntry, GoalSet } from '../../domain/types';
import { buildAiContext, localAnswer, type ContextInput } from '../aiContext';

const goals = calculateGoals({
  profile: { birth_date: '1990-01-01', sex: 'female', height_cm: 165, current_weight_kg: 80, target_weight_kg: 70, activity_level: 'light', objective: 'fat_loss', does_resistance_training: true, health_flags: [], hot_climate: false, water_ml_per_kg: null, target_date: null },
  today: new Date(2026, 9, 19),
}).targets;
const goalSet = { id: 'g', user_id: 'u', created_at: '', valid_from: '', targets: goals, calc: null, note: null } as GoalSet;

const base: ContextInput = { today: '2026-10-19', profile: null, goalSet, entries: [], waterLogs: [], activities: [], assessments: [], plan: null, supplements: [] };
const entry = (date: string, protein: number, meal = 'lunch') => ({ date, meal, food_name: 'Frango', amount: 100, unit: 'g', nutrients: { protein_g: protein, energy_kcal: 160, carbs_g: 0, fat_g: 2, fiber_g: null }, compounds: null }) as unknown as DiaryEntry;

describe('contexto e respostas locais do assistente', () => {
  it('dias sem registro aparecem como sem registro, não como zero', () => {
    const ctx = buildAiContext({ ...base, entries: [entry('2026-10-19', 30)] }) as { ultimos_7_dias: { registro?: string; proteina_g?: number }[]; hoje: { tem_registros: boolean } };
    expect(ctx.hoje.tem_registros).toBe(true);
    expect(ctx.ultimos_7_dias[0].proteina_g).toBe(30);
    expect(ctx.ultimos_7_dias[1].registro).toMatch(/sem registro/);
  });

  it('metas levam a origem para a IA respeitar prescrições', () => {
    const ctx = buildAiContext(base) as { metas: Record<string, { origem: string }> };
    expect(ctx.metas.protein_g.origem).toBe('Sugerida pelo app');
  });

  it('proteína restante sem registros não assume zero', () => {
    expect(localAnswer('Quanto de proteína falta hoje?', base, [])).toMatch(/ainda não registrou/);
    expect(localAnswer('Quanto de proteína falta hoje?', { ...base, entries: [entry('2026-10-19', 40)] }, [])).toMatch(new RegExp(`Faltam aproximadamente ${goals.protein_g.value! - 40} g`));
  });

  it('comparação de proteína usa a base TACO', () => {
    const a = localAnswer('Qual opção tem mais proteína: frango ou carne moída?', base, referenceFoods());
    expect(a).toMatch(/TACO/);
    expect(a).toMatch(/Mais proteína: Frango/);
  });
});
