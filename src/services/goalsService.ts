import type { DataStore } from '../data/store';
import { calculateGoals, FORMULA_VERSION, mergeSystemSuggestions, setTarget, type GoalCalculation } from '../domain/goals';
import type { BodyAssessment, GoalKey, GoalOrigin, GoalSet, GoalTargets, Profile } from '../domain/types';

export async function latestFatFreeMass(store: DataStore): Promise<number | null> {
  const list = await store.list<BodyAssessment>('body_assessments', { order: { field: 'measured_at', ascending: false }, limit: 1 });
  const v = list[0]?.metrics.fat_free_mass_kg;
  return v && v.unit.toLowerCase() === 'kg' ? v.value : null;
}

/**
 * Recalcula as sugestões do sistema e grava uma NOVA versão das metas,
 * preservando as metas do usuário e as prescritas por profissional.
 */
export async function recalculateGoals(store: DataStore, profile: Profile, current: GoalSet | null, note = 'Recálculo automático'): Promise<{ goalSet: GoalSet; calc: GoalCalculation }> {
  const calc = calculateGoals({ profile, latestFatFreeMassKg: await latestFatFreeMass(store) });
  const targets = mergeSystemSuggestions(current?.targets ?? null, calc.targets);
  const goalSet = await store.insert<GoalSet>('goal_sets', {
    valid_from: new Date().toISOString(),
    targets,
    calc: { bmr: calc.bmr, tdee: calc.tdee, referenceWeight: calc.referenceWeight, missingData: calc.missingData, formula_version: FORMULA_VERSION },
    note,
  });
  return { goalSet, calc };
}

export async function saveManualTarget(
  store: DataStore,
  current: GoalSet,
  key: GoalKey,
  value: number | null,
  origin: Exclude<GoalOrigin, 'system'> | 'system',
  professionalName: string | null,
  profile: Profile,
): Promise<GoalSet> {
  let targets: GoalTargets;
  if (origin === 'system') {
    // volta a seguir a sugestão do sistema para esta meta
    const calc = calculateGoals({ profile, latestFatFreeMassKg: await latestFatFreeMass(store) });
    targets = { ...current.targets, [key]: calc.targets[key] };
  } else {
    targets = setTarget(current.targets, key, value, origin, { actor: 'user', professional_name: professionalName ?? null });
  }
  return store.insert<GoalSet>('goal_sets', {
    valid_from: new Date().toISOString(),
    targets,
    calc: current.calc,
    note: origin === 'professional' ? `Meta prescrita${professionalName ? ` por ${professionalName}` : ''}` : origin === 'user' ? 'Meta definida pelo usuário' : 'Meta volta a ser sugerida pelo app',
  });
}
