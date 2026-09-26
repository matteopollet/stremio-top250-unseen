import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Cache } from "../core/cache.js";

interface FileEntry {
  value: unknown;
  expiresAt?: number;
}

/** JSON-file-backed cache for the Node runtime. One file per namespace. */
export class FileCache implements Cache {
  private loaded = false;
  private store = new Map<string, FileEntry>();
  private dirty = false;
  private flushing: Promise<void> | null = null;

  constructor(private filePath: string) {}

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, FileEntry>;
      for (const [k, v] of Object.entries(parsed)) this.store.set(k, v);
    } catch {
      // missing or corrupt cache file: start empty
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    await this.load();
    const e = this.store.get(key);
    if (!e) return undefined;
    if (e.expiresAt !== undefined && e.expiresAt <= Date.now()) {
      this.store.delete(key);
      this.dirty = true;
      return undefined;
    }
    return e.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.load();
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds === undefined ? undefined : Date.now() + ttlSeconds * 1000,
    });
    this.dirty = true;
  }

  async delete(key: string): Promise<void> {
    await this.load();
    this.dirty = this.store.delete(key) || this.dirty;
  }

  /** Persist pending writes. Safe to call periodically and on shutdown. */
  async flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.doFlush().finally(() => (this.flushing = null));
    return this.flushing;
  }

  private async doFlush(): Promise<void> {
    if (!this.dirty) return;
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = join(dirname(this.filePath), `.tmp-${process.pid}.json`);
    const obj = Object.fromEntries(this.store);
    await writeFile(tmp, JSON.stringify(obj));
    await rename(tmp, this.filePath);
    this.dirty = false;
  }
}
