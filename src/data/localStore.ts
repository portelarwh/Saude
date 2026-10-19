import { applyQuery, Emitter, StoreError, type DataStore, type NewRow, type Query, type Row, type TableName } from './store';

/** Armazenamento chave-valor assíncrono (AsyncStorage no app; memória nos testes). */
export interface KeyValue {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const PREFIX = 'meu-equilibrio:v1:';

export class LocalStore implements DataStore {
  readonly mode = 'local' as const;
  private cache = new Map<TableName, Row[]>();
  private queue: Promise<unknown> = Promise.resolve();
  private emitter = new Emitter();

  constructor(
    readonly userId: string,
    private kv: KeyValue,
    private newId: () => string,
    private now: () => Date = () => new Date(),
  ) {}

  private key(table: TableName) {
    return `${PREFIX}${this.userId}:${table}`;
  }

  private async load(table: TableName): Promise<Row[]> {
    const cached = this.cache.get(table);
    if (cached) return cached;
    const raw = await this.kv.getItem(this.key(table));
    const rows = raw ? (JSON.parse(raw) as Row[]) : [];
    this.cache.set(table, rows);
    return rows;
  }

  /** Escritas serializadas para evitar condições de corrida. */
  private write<R>(table: TableName, fn: (rows: Row[]) => { rows: Row[]; result: R }): Promise<R> {
    const run = async () => {
      const rows = await this.load(table);
      const { rows: next, result } = fn(rows);
      await this.kv.setItem(this.key(table), JSON.stringify(next));
      this.cache.set(table, next);
      this.emitter.emit(table);
      return result;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  async list<T>(table: TableName, query?: Query): Promise<T[]> {
    await this.queue;
    const rows = await this.load(table);
    return applyQuery(rows.filter((r) => r.user_id === this.userId), query) as unknown as T[];
  }

  async get<T>(table: TableName, id: string): Promise<T | null> {
    await this.queue;
    const rows = await this.load(table);
    return (rows.find((r) => r.id === id && r.user_id === this.userId) as unknown as T) ?? null;
  }

  private stamp<T>(row: NewRow<T>): Row {
    const ts = this.now().toISOString();
    return { ...(row as object), id: row.id ?? this.newId(), user_id: this.userId, created_at: ts, updated_at: ts } as Row;
  }

  insert<T>(table: TableName, row: NewRow<T>): Promise<T> {
    return this.write(table, (rows) => {
      const r = this.stamp(row);
      if (rows.some((x) => x.id === r.id)) throw new StoreError('Registro duplicado', 'validation');
      return { rows: [...rows, r], result: r as unknown as T };
    });
  }

  insertMany<T>(table: TableName, list: NewRow<T>[]): Promise<T[]> {
    return this.write(table, (rows) => {
      const created = list.map((r) => this.stamp(r));
      return { rows: [...rows, ...created], result: created as unknown as T[] };
    });
  }

  update<T>(table: TableName, id: string, patch: Partial<T>): Promise<T> {
    return this.write(table, (rows) => {
      const idx = rows.findIndex((r) => r.id === id && r.user_id === this.userId);
      if (idx < 0) throw new StoreError('Registro não encontrado', 'not_found');
      const { id: _i, user_id: _u, created_at: _c, ...safe } = patch as Record<string, unknown>;
      const updated = { ...rows[idx], ...safe, updated_at: this.now().toISOString() } as Row;
      const next = rows.slice();
      next[idx] = updated;
      return { rows: next, result: updated as unknown as T };
    });
  }

  upsert<T>(table: TableName, row: NewRow<T> & { id: string }): Promise<T> {
    return this.write(table, (rows) => {
      const idx = rows.findIndex((r) => r.id === row.id && r.user_id === this.userId);
      const next = rows.slice();
      let result: Row;
      if (idx >= 0) {
        result = { ...rows[idx], ...(row as object), user_id: this.userId, updated_at: this.now().toISOString() } as Row;
        next[idx] = result;
      } else {
        result = this.stamp(row);
        next.push(result);
      }
      return { rows: next, result: result as unknown as T };
    });
  }

  remove(table: TableName, id: string): Promise<void> {
    return this.write(table, (rows) => ({ rows: rows.filter((r) => !(r.id === id && r.user_id === this.userId)), result: undefined }));
  }

  /** Exclui todos os dados locais deste usuário (exclusão de conta no modo local). */
  async wipe(tables: TableName[]): Promise<void> {
    await this.queue;
    for (const t of tables) {
      await this.kv.removeItem(this.key(t));
      this.cache.delete(t);
      this.emitter.emit(t);
    }
  }

  subscribe(listener: (table: TableName) => void): () => void {
    return this.emitter.on(listener);
  }
}

/** Implementação em memória (testes). */
export class MemoryKeyValue implements KeyValue {
  data = new Map<string, string>();
  async getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  async setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  async removeItem(k: string) {
    this.data.delete(k);
  }
}
