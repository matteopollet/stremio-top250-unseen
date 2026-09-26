import type { Cache } from "../cache.js";
import type { IdResolver } from "../resolve.js";
import type { WatchedProvider } from "../types.js";

/**
 * Letterboxd RSS provider — an opportunistic delta, not a guarantee.
 * The feed only exposes the ~50 most recent activity items, so resolved
 * imdbIds are ACCUMULATED in the persistent store: a film that scrolls out
 * of the feed stays excluded forever.
 *
 * Note: watch/diary/review items emit a `letterboxd-watch-*`/`-diary-*`/
 * `-review-*` guid. Rating a film marks it "watched" on Letterboxd, which
 * emits a watch item — but edge cases may not emit, so the CSV export stays
 * the canonical source.
 */

const FILM_GUID = /^letterboxd-(watch|diary|review)-/;
const FEED_TTL = 3600; // 1h

export interface RssFilmItem {
  tmdbId: number;
  title: string;
  watchedDate: string | null;
  rating: number | null;
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? m[1]!.trim() : null;
}

/** Parses the watch/diary/review items out of a Letterboxd RSS feed. */
export function parseLetterboxdRss(xml: string): RssFilmItem[] {
  const items: RssFilmItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1]!;
    const guid = tag(block, "guid") ?? "";
    if (!FILM_GUID.test(guid)) continue;
    const tmdbRaw = tag(block, "tmdb:movieId");
    if (!tmdbRaw) continue;
    const tmdbId = Number(tmdbRaw);
    if (!Number.isInteger(tmdbId)) continue;

    const ratingRaw = tag(block, "letterboxd:memberRating");
    items.push({
      tmdbId,
      title: tag(block, "letterboxd:filmTitle") ?? "",
      watchedDate: tag(block, "letterboxd:watchedDate"),
      rating: ratingRaw ? Number(ratingRaw) : null,
    });
  }
  return items;
}

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

export class LetterboxdRssProvider implements WatchedProvider {
  readonly name = "letterboxd-rss";

  constructor(
    private username: string,
    private cache: Cache,
    private store: KeyValueStore,
    private resolver: IdResolver,
    private fetchImpl: (url: string) => Promise<{ ok: boolean; text(): Promise<string> }> = fetch as never,
  ) {}

  private get storeKey() {
    return `watched:rss:${this.username}`;
  }

  async getWatchedIds(): Promise<Set<string>> {
    const accumulated = new Set<string>((await this.store.get<string[]>(this.storeKey)) ?? []);

    const items = await this.fetchFeed();
    const resolved = await this.resolver.resolveTmdbIds(items.map((i) => i.tmdbId));
    for (const imdbId of resolved.values()) accumulated.add(imdbId);
    await this.store.set(this.storeKey, [...accumulated]);

    return accumulated;
  }

  private async fetchFeed(): Promise<RssFilmItem[]> {
    const cacheKey = `rss:${this.username}`;
    const cached = await this.cache.get<RssFilmItem[]>(cacheKey);
    if (cached) return cached;

    const res = await this.fetchImpl(`https://letterboxd.com/${encodeURIComponent(this.username)}/rss/`);
    if (!res.ok) throw new Error(`letterboxd rss: HTTP ${res.status}`);
    const items = parseLetterboxdRss(await res.text());
    await this.cache.set(cacheKey, items, FEED_TTL);
    return items;
  }
}
