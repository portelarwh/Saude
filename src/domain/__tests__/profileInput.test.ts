import { maskBRDate, parseBRDate } from '../dates';
import { calculateGoals, combineObjectives, normalizeHeightCm, profileObjectives } from '../goals';

describe('data de nascimento digitada só com números', () => {
  it('14071985 vira 14/07/1985', () => {
    expect(maskBRDate('14071985')).toBe('14/07/1985');
    expect(parseBRDate('14071985')).toBe('1985-07-14');
  });

  it('formata enquanto digita, sem prender o apagar', () => {
    expect(['1', '14', '140', '1407', '14071', '140719'].map(maskBRDate)).toEqual(['1', '14', '14/0', '14/07', '14/07/1', '14/07/19']);
    expect(maskBRDate('14/')).toBe('14/');
    expect(maskBRDate('14')).toBe('14');
  });

  it('aceita separadores e dia/mês com um dígito', () => {
    expect(maskBRDate('1/7/1985')).toBe('01/07/1985');
    expect(parseBRDate('14.07.1985')).toBe('1985-07-14');
    expect(parseBRDate('14-07-1985')).toBe('1985-07-14');
    expect(maskBRDate('14/07/1985')).toBe('14/07/1985');
    expect(maskBRDate('140719851')).toBe('14/07/1985');
  });

  it('rejeita datas inexistentes ou incompletas', () => {
    expect(parseBRDate('31021985')).toBeNull();
    expect(parseBRDate('140785')).toBeNull();
    expect(parseBRDate('')).toBeNull();
  });
});

describe('altura em centímetros', () => {
  it('mantém cm e converte metros', () => {
    expect(normalizeHeightCm(175)).toBe(175);
    expect(normalizeHeightCm(1.75)).toBe(175);
    expect(normalizeHeightCm(1.6)).toBe(160);
    expect(normalizeHeightCm(null)).toBeNull();
    expect(normalizeHeightCm(0)).toBeNull();
  });
});

describe('vários objetivos', () => {
  it('combina para o cálculo das metas', () => {
    expect(combineObjectives([])).toBeNull();
    expect(combineObjectives(['fat_loss', 'muscle_gain'])).toBe('recomposition');
    expect(combineObjectives(['fat_loss', 'maintenance'])).toBe('fat_loss');
    expect(combineObjectives(['muscle_gain', 'maintenance'])).toBe('muscle_gain');
    expect(combineObjectives(['maintenance'])).toBe('maintenance');
    expect(combineObjectives(['recomposition', 'maintenance'])).toBe('recomposition');
  });

  it('perfis antigos com um só objetivo continuam funcionando', () => {
    expect(profileObjectives({ objective: 'fat_loss' })).toEqual(['fat_loss']);
    expect(profileObjectives({ objective: null, objectives: [] })).toEqual([]);
    expect(profileObjectives({ objective: 'recomposition', objectives: ['fat_loss', 'muscle_gain'] })).toEqual(['fat_loss', 'muscle_gain']);
  });

  it('emagrecer + ganhar massa usa déficit leve e proteína de recomposição', () => {
    const base = {
      birth_date: '1985-07-14', sex: 'male' as const, height_cm: 175, current_weight_kg: 85, target_weight_kg: null,
      activity_level: 'moderate' as const, does_resistance_training: true, health_flags: [], hot_climate: false, water_ml_per_kg: null, target_date: null,
    };
    const combo = calculateGoals({ profile: { ...base, objective: combineObjectives(['fat_loss', 'muscle_gain']) } });
    const recomp = calculateGoals({ profile: { ...base, objective: 'recomposition' } });
    expect(combo.targets.energy_kcal.value).toBe(recomp.targets.energy_kcal.value);
    expect(combo.targets.protein_g.value).toBe(recomp.targets.protein_g.value);
  });
});
