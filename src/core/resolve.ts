import type { Cache } from "./cache.js";

/**
 * Resolves TMDB movie IDs (from the Letterboxd RSS feed) to IMDb IDs.
 * Primary: Wikidata SPARQL (one batched request, no API key).
 * Fallback: TMDB external_ids (per-id, requires a free API key).
 *
 * Cloudflare Workers free tier allows ~50 subrequests per invocation, so
 * resolution is bounded per call — resolved mappings are cached permanently
 * and the set converges over successive calls.
 */

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";
const TMDB_BASE = "https://api.themoviedb.org/3";
const MAX_RESOLVE_PER_CALL = 40;
const IDMAP_PREFIX = "idmap:tmdb:";

export type TextFetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export class IdResolver {
  constructor(
    private cache: Cache,
    private opts: { tmdbApiKey?: string; fetchImpl?: TextFetch } = {},
  ) {}

  private get f(): TextFetch {
    // never a bare `fetch` reference — detached fetch throws "Illegal invocation" on Workers
    return this.opts.fetchImpl ?? ((url, init) => fetch(url, init as RequestInit));
  }

  /** Returns tmdbId → imdbId for everything resolvable within the per-call budget. */
  async resolveTmdbIds(tmdbIds: number[]): Promise<Map<number, string>> {
    const out = new Map<number, string>();
    const missing: number[] = [];

    for (const id of tmdbIds) {
      const hit = await this.cache.get<string>(IDMAP_PREFIX + id);
      if (hit) out.set(id, hit);
      else missing.push(id);
    }

    const batch = missing.slice(0, MAX_RESOLVE_PER_CALL);
    if (batch.length) {
      // Wikidata failure (timeout, 5xx, network) still allows the TMDB fallback
      const viaWikidata = await this.resolveViaWikidata(batch).catch(() => new Map<number, string>());
      for (const [tmdb, imdb] of viaWikidata) out.set(tmdb, imdb);

      const stillMissing = batch.filter((id) => !out.has(id));
      if (stillMissing.length && this.opts.tmdbApiKey) {
        const viaTmdb = await this.resolveViaTmdb(stillMissing);
        for (const [tmdb, imdb] of viaTmdb) out.set(tmdb, imdb);
      }
    }
    return out;
  }

  /** One SPARQL request resolves up to ~50 TMDB ids at once. wdt:P4947 = TMDB movie id, wdt:P345 = IMDb id. */
  private async resolveViaWikidata(tmdbIds: number[]): Promise<Map<number, string>> {
    const values = tmdbIds.map((id) => `"${id}"`).join(" ");
    const query = `SELECT ?tmdb ?imdb WHERE { VALUES ?tmdb { ${values} } ?item wdt:P4947 ?tmdb ; wdt:P345 ?imdb . }`;
    const res = await this.f(WIKIDATA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/sparql-query",
        Accept: "application/sparql-results+json",
        "User-Agent": "stremio-top250-unseen (https://github.com/matteopollet/stremio-top250-unseen)",
      },
      body: query,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return new Map();

    interface WdResults { results: { bindings: { tmdb: { value: string }; imdb: { value: string } }[] } }
    const body = (await res.json()) as WdResults;
    const out = new Map<number, string>();
    for (const b of body.results?.bindings ?? []) {
      const tmdb = Number(b.tmdb.value);
      const imdb = b.imdb.value;
      if (tmdb && /^tt\d+$/.test(imdb)) {
        out.set(tmdb, imdb);
        await this.cache.set(IDMAP_PREFIX + tmdb, imdb);
      }
    }
    return out;
  }

  private async resolveViaTmdb(tmdbIds: number[]): Promise<Map<number, string>> {
    const out = new Map<number, string>();
    for (const id of tmdbIds) {
      try {
        const res = await this.f(`${TMDB_BASE}/movie/${id}/external_ids`, {
          headers: { Authorization: `Bearer ${this.opts.tmdbApiKey}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) continue;
        const body = (await res.json()) as { imdb_id?: string | null };
        if (body.imdb_id && /^tt\d+$/.test(body.imdb_id)) {
          out.set(id, body.imdb_id);
          await this.cache.set(IDMAP_PREFIX + id, body.imdb_id);
        }
      } catch {
        continue; // one failed id must not abort the remaining resolutions
      }
    }
    return out;
  }
}
