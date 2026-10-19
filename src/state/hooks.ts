import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { referenceFoods } from '../data/reference';
import type { Query, TableName } from '../data/store';
import { toISODate } from '../domain/dates';
import { DEFAULT_COUNTED } from '../domain/hydration';
import type { Beverage, Food, GoalSet, Profile } from '../domain/types';
import { useStore } from './AppProvider';

export interface Collection<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Lista reativa: recarrega quando a tabela é alterada. */
export function useCollection<T>(table: TableName, query?: Query): Collection<T> {
  const store = useStore();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(query ?? {});
  const seq = useRef(0);

  const load = useCallback(() => {
    const my = ++seq.current;
    store
      .list<T>(table, JSON.parse(key))
      .then((rows) => {
        if (my !== seq.current) return;
        setData(rows);
        setError(null);
      })
      .catch((e: Error) => my === seq.current && setError(e.message))
      .finally(() => my === seq.current && setLoading(false));
  }, [store, table, key]);

  useEffect(() => {
    load();
    return store.subscribe((t) => {
      if (t === table) load();
    });
  }, [load, store, table]);

  return { data, loading, error, reload: load };
}

export function useProfile(): { profile: Profile | null; loading: boolean; save: (patch: Partial<Profile>) => Promise<Profile> } {
  const store = useStore();
  const { data, loading } = useCollection<Profile>('profiles');
  const profile = data[0] ?? null;
  const save = useCallback(
    async (patch: Partial<Profile>) => {
      if (profile) return store.update<Profile>('profiles', profile.id, patch);
      return store.upsert<Profile>('profiles', { ...(emptyProfile() as object), ...patch, id: store.userId } as Profile);
    },
    [store, profile],
  );
  return { profile, loading, save };
}

export function emptyProfile(): Omit<Profile, 'id' | 'user_id' | 'created_at'> {
  return {
    name: '',
    birth_date: null,
    sex: null,
    height_cm: null,
    current_weight_kg: null,
    target_weight_kg: null,
    waist_cm: null,
    hip_cm: null,
    other_measures: null,
    activity_level: null,
    work_routine: null,
    does_resistance_training: null,
    objective: null,
    target_date: null,
    wake_time: '07:00',
    sleep_time: '23:00',
    meal_times: null,
    food_preferences: null,
    food_restrictions: [],
    allergies: [],
    intolerances: [],
    health_flags: [],
    health_notes: null,
    supplements_notes: null,
    professional_guidance: null,
    hot_climate: false,
    water_ml_per_kg: null,
    onboarding_completed: false,
    consent_health_data_at: null,
    consent_ai_at: null,
    settings: {},
  };
}

/** Versão vigente das metas (a mais recente). */
export function useGoals(): { goalSet: GoalSet | null; loading: boolean } {
  const { data, loading } = useCollection<GoalSet>('goal_sets', { order: { field: 'valid_from', ascending: false }, limit: 1 });
  return { goalSet: data[0] ?? null, loading };
}

/** Base de referência + alimentos do usuário (receitas, rótulos, suplementos). */
export function useAllFoods(): { foods: Food[]; userFoods: Food[]; loading: boolean } {
  const { data, loading } = useCollection<Food>('foods');
  const foods = useMemo(() => [...data, ...referenceFoods()], [data]);
  return { foods, userFoods: data, loading };
}

export function useToday(): string {
  const [today, setToday] = useState(toISODate(new Date()));
  useEffect(() => {
    const t = setInterval(() => setToday(toISODate(new Date())), 60_000);
    return () => clearInterval(t);
  }, []);
  return today;
}

export function useCountedBeverages(profile: Profile | null): Record<Beverage, boolean> {
  return useMemo(() => ({ ...DEFAULT_COUNTED, ...(profile?.settings?.counted_beverages ?? {}) }), [profile]);
}
