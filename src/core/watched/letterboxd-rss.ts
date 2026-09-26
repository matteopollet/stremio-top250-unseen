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
 * `-review-*` guid. Observed behavior on a live account: marking a film
 * watched (eye icon) or rating it without a diary entry produced no feed
 * item within ~10 min — Letterboxd appears to regenerate feeds periodically
 * (or not emit bare marks at all). The CSV export therefore stays canonical
 * and /configure's manual checklist covers immediate, guaranteed hiding.
 */

const FILM_GUID = /^letterboxd-(watch|diary|review)-/;
const FEED_TTL = 900; // 15min — feed regeneration upstream is the real bottleneck

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
    // never a bare `fetch` reference — detached fetch throws "Illegal invocation" on Workers
    private fetchImpl: (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }> = (url) => fetch(url),
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
