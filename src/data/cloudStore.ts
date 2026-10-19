import type { SupabaseClient } from '@supabase/supabase-js';
import type { KeyValue } from './localStore';
import { applyQuery, Emitter, StoreError, type DataStore, type NewRow, type Query, type TableName } from './store';

/**
 * Persistência no Supabase. O isolamento entre usuários é garantido no banco
 * por políticas RLS (auth.uid() = user_id); o filtro por user_id aqui é
 * apenas uma defesa adicional.
 *
 * Leituras bem-sucedidas são guardadas em cache para funcionamento com
 * conectividade limitada (somente leitura offline).
 */
export class CloudStore implements DataStore {
  readonly mode = 'cloud' as const;
  private emitter = new Emitter();

  constructor(
    private client: SupabaseClient,
    readonly userId: string,
    private cache: KeyValue,
  ) {}

  private cacheKey(table: TableName) {
    return `meu-equilibrio:cache:${this.userId}:${table}`;
  }

  private fail(error: { message: string; code?: string }): never {
    const msg = error.message || 'Erro ao acessar o servidor';
    if (/fetch|network|Failed to fetch|timeout/i.test(msg)) throw new StoreError('Sem conexão com o servidor. Tente novamente.', 'network');
    if (error.code === '42501' || /row-level security|permission/i.test(msg)) throw new StoreError('Acesso negado.', 'permission');
    throw new StoreError(msg);
  }

  async list<T>(table: TableName, query: Query = {}): Promise<T[]> {
    let q = this.client.from(table).select('*').eq('user_id', this.userId);
    for (const [k, v] of Object.entries(query.eq ?? {})) q = v === null ? q.is(k, null) : q.eq(k, v);
    if (query.gte) q = q.gte(query.gte[0], query.gte[1]);
    if (query.lte) q = q.lte(query.lte[0], query.lte[1]);
    if (query.order) q = q.order(query.order.field, { ascending: query.order.ascending ?? true });
    if (query.limit) q = q.limit(query.limit);
    try {
      const { data, error } = await q;
      if (error) this.fail(error);
      if (!query.gte && !query.lte && !query.limit) {
        // cache por tabela completa (consultas sem filtro de intervalo)
        if (!query.eq) await this.cache.setItem(this.cacheKey(table), JSON.stringify(data));
      }
      return (data ?? []) as T[];
    } catch (e) {
      if (e instanceof StoreError && e.kind !== 'network') throw e;
      const raw = await this.cache.getItem(this.cacheKey(table));
      if (raw) return applyQuery(JSON.parse(raw), query) as T[];
      throw e instanceof StoreError ? e : new StoreError('Sem conexão com o servidor.', 'network');
    }
  }

  async get<T>(table: TableName, id: string): Promise<T | null> {
    const { data, error } = await this.client.from(table).select('*').eq('id', id).eq('user_id', this.userId).maybeSingle();
    if (error) this.fail(error);
    return (data as T) ?? null;
  }

  async insert<T>(table: TableName, row: NewRow<T>): Promise<T> {
    const { data, error } = await this.client.from(table).insert({ ...row, user_id: this.userId }).select().single();
    if (error) this.fail(error);
    this.emitter.emit(table);
    return data as T;
  }

  async insertMany<T>(table: TableName, rows: NewRow<T>[]): Promise<T[]> {
    if (!rows.length) return [];
    const { data, error } = await this.client.from(table).insert(rows.map((r) => ({ ...r, user_id: this.userId }))).select();
    if (error) this.fail(error);
    this.emitter.emit(table);
    return data as T[];
  }

  async update<T>(table: TableName, id: string, patch: Partial<T>): Promise<T> {
    const { id: _i, user_id: _u, created_at: _c, ...safe } = patch as Record<string, unknown>;
    const { data, error } = await this.client.from(table).update(safe).eq('id', id).eq('user_id', this.userId).select().single();
    if (error) this.fail(error);
    this.emitter.emit(table);
    return data as T;
  }

  async upsert<T>(table: TableName, row: NewRow<T> & { id: string }): Promise<T> {
    const { data, error } = await this.client.from(table).upsert({ ...row, user_id: this.userId }).select().single();
    if (error) this.fail(error);
    this.emitter.emit(table);
    return data as T;
  }

  async remove(table: TableName, id: string): Promise<void> {
    const { error } = await this.client.from(table).delete().eq('id', id).eq('user_id', this.userId);
    if (error) this.fail(error);
    this.emitter.emit(table);
  }

  subscribe(listener: (table: TableName) => void): () => void {
    return this.emitter.on(listener);
  }
}
