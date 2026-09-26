import type { Cache } from "../core/cache.js";

/** Structural subset of Cloudflare's KVNamespace — avoids a hard workers-types dependency in shared code. */
export interface KvLike {
  get(key: string, opts?: { type?: string }): Promise<unknown>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

/** KV-backed cache for the Cloudflare Workers runtime. */
export class KvCache implements Cache {
  constructor(
    private kv: KvLike,
    private prefix = "cache:",
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    const v = (await this.kv.get(this.prefix + key, { type: "json" })) as T | null;
    return v ?? undefined;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const opts = ttlSeconds === undefined ? {} : { expirationTtl: ttlSeconds };
    await this.kv.put(this.prefix + key, JSON.stringify(value), opts);
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(this.prefix + key);
  }
}
