/**
 * Contrato de persistência. Duas implementações:
 *  - LocalStore: dados apenas neste dispositivo (AsyncStorage). Usado quando o
 *    Supabase não está configurado.
 *  - CloudStore: Supabase/PostgreSQL com Row Level Security por usuário.
 */
export type TableName =
  | 'profiles'
  | 'goal_sets'
  | 'foods'
  | 'food_favorites'
  | 'diary_entries'
  | 'recipes'
  | 'water_logs'
  | 'containers'
  | 'activities'
  | 'weight_entries'
  | 'body_assessments'
  | 'notification_settings'
  | 'diet_plans'
  | 'chat_messages'
  | 'saved_meals'
  | 'wellbeing_logs';

export const ALL_TABLES: TableName[] = [
  'profiles',
  'goal_sets',
  'foods',
  'food_favorites',
  'diary_entries',
  'recipes',
  'water_logs',
  'containers',
  'activities',
  'weight_entries',
  'body_assessments',
  'notification_settings',
  'diet_plans',
  'chat_messages',
  'saved_meals',
  'wellbeing_logs',
];

type Scalar = string | number | boolean | null;

export interface Query {
  eq?: Record<string, Scalar>;
  gte?: [field: string, value: string | number];
  lte?: [field: string, value: string | number];
  order?: { field: string; ascending?: boolean };
  limit?: number;
}

export type Row = { id: string; user_id: string; created_at: string; updated_at?: string } & Record<string, unknown>;

export type NewRow<T> = Omit<T, 'id' | 'user_id' | 'created_at' | 'updated_at'> & { id?: string };

export interface DataStore {
  readonly mode: 'local' | 'cloud';
  readonly userId: string;
  list<T>(table: TableName, query?: Query): Promise<T[]>;
  get<T>(table: TableName, id: string): Promise<T | null>;
  insert<T>(table: TableName, row: NewRow<T>): Promise<T>;
  insertMany<T>(table: TableName, rows: NewRow<T>[]): Promise<T[]>;
  update<T>(table: TableName, id: string, patch: Partial<T>): Promise<T>;
  upsert<T>(table: TableName, row: NewRow<T> & { id: string }): Promise<T>;
  remove(table: TableName, id: string): Promise<void>;
  /** Notifica alterações para atualizar telas. */
  subscribe(listener: (table: TableName) => void): () => void;
}

export class StoreError extends Error {
  constructor(message: string, readonly kind: 'network' | 'permission' | 'not_found' | 'validation' | 'unknown' = 'unknown') {
    super(message);
  }
}

/** Aplica um Query em memória (LocalStore e cache offline). */
export function applyQuery<T extends Record<string, unknown>>(rows: T[], q: Query = {}): T[] {
  let out = rows;
  if (q.eq) {
    const eq = q.eq;
    out = out.filter((r) => Object.entries(eq).every(([k, v]) => (r[k] ?? null) === v));
  }
  if (q.gte) {
    const [f, v] = q.gte;
    out = out.filter((r) => (r[f] as string | number) >= v);
  }
  if (q.lte) {
    const [f, v] = q.lte;
    out = out.filter((r) => (r[f] as string | number) <= v);
  }
  if (q.order) {
    const { field, ascending = true } = q.order;
    out = [...out].sort((a, b) => {
      const x = a[field] as string | number;
      const y = b[field] as string | number;
      if (x === y) return 0;
      return (x > y ? 1 : -1) * (ascending ? 1 : -1);
    });
  }
  if (q.limit) out = out.slice(0, q.limit);
  return out;
}

export class Emitter {
  private listeners = new Set<(t: TableName) => void>();
  on(l: (t: TableName) => void) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  emit(t: TableName) {
    for (const l of this.listeners) l(t);
  }
}
