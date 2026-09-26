/**
 * Minimal cache abstraction shared by all providers.
 * Implementations: MemoryCache (any runtime), FileCache (Node), KvCache (Workers).
 *
 * Contract: get() returns undefined on miss/expiry. set() may ignore ttlSeconds
 * on backends that don't support it (TTL is enforced on read via `expiresAt`).
 */
export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

interface Entry {
  value: unknown;
  /** epoch ms, undefined = no expiry */
  expiresAt?: number;
}

function fresh(e: Entry | undefined): e is Entry {
  return e !== undefined && (e.expiresAt === undefined || e.expiresAt > Date.now());
}

export class MemoryCache implements Cache {
  private store = new Map<string, Entry>();

  async get<T>(key: string): Promise<T | undefined> {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (!fresh(e)) {
      this.store.delete(key);
      return undefined;
    }
    return e.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds === undefined ? undefined : Date.now() + ttlSeconds * 1000,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}
