import type { WatchedProvider } from "../types.js";
import type { KeyValueStore } from "./letterboxd-rss.js";

export interface StoredExclusions {
  /** imdbIds matched confidently by the browser-side matcher */
  excludedImdbIds: string[];
  /**
   * imdbIds ticked by hand in /configure — for films seen but never logged
   * on Letterboxd. Stored separately so a CSV re-import never wipes them.
   */
  manualExclusions?: string[];
  /** entries the matcher could not confidently identify — surfaced in /status */
  ambiguous: { name: string; year: number | null; reason: string; candidates: { imdbId: string; title: string; score: number }[] }[];
  updatedAt: string;
}

/**
 * The canonical watched source: imdbIds produced by the browser-side matcher
 * in /configure (CSV export never leaves the user's machine) or by the
 * `import-watched` CLI in self-hosted mode. Persisted under the config's
 * storage key.
 */
export class ExclusionsProvider implements WatchedProvider {
  readonly name = "csv-exclusions";

  constructor(
    private store: KeyValueStore,
    private storageKey: string,
  ) {}

  private get key() {
    return `watched:csv:${this.storageKey}`;
  }

  async getWatchedIds(): Promise<Set<string>> {
    const stored = await this.store.get<StoredExclusions>(this.key);
    return new Set([...(stored?.excludedImdbIds ?? []), ...(stored?.manualExclusions ?? [])]);
  }

  async getStored(): Promise<StoredExclusions | undefined> {
    return this.store.get<StoredExclusions>(this.key);
  }

  async put(exclusions: StoredExclusions): Promise<void> {
    await this.store.set(this.key, exclusions);
  }
}
