import type { Cache } from "../core/cache.js";
import { buildCatalog } from "../core/catalog.js";
import { ChartService } from "../core/chart/index.js";
import { ImdbGraphqlProvider } from "../core/chart/imdb-graphql.js";
import { SnapshotProvider, type SnapshotFile } from "../core/chart/snapshot.js";
import { DEFAULT_STORAGE_KEY, decodeConfig, type AddonConfig } from "../core/config.js";
import { IdResolver } from "../core/resolve.js";
import type { ChartProvider, WatchedProvider } from "../core/types.js";
import { ExclusionsProvider, type StoredExclusions } from "../core/watched/exclusions.js";
import { LetterboxdRssProvider, type KeyValueStore } from "../core/watched/letterboxd-rss.js";

export const CATALOG_ID = "top250_unseen";
const DEFAULT_CATALOG_NAME = "IMDb Top 250 — À voir";

export interface AddonDeps {
  cache: Cache;
  store: KeyValueStore;
  /** default config when the URL carries none (self-hosted mode) */
  envConfig: AddonConfig;
  /** bundled chart snapshot used as final fallback */
  snapshot: SnapshotFile;
  /** optional user-provided snapshot URL */
  snapshotUrl?: string;
  /** curated title aliases used by matching and shown to the configure page */
  aliases?: Record<string, string>;
  /** HTML for the /configure page (injected so this file stays runtime-free) */
  configureHtml?: string;
  /** chart provider chain override — defaults to graphql → snapshot; tests inject fakes */
  chartProviders?: ChartProvider[];
}

interface HttpResult {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const JSON_HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

function json(status: number, body: unknown): HttpResult {
  return { status, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

const IMDB_ID = /^tt\d{4,10}$/;
const MAX_BODY_BYTES = 256_000;
const MAX_EXCLUSION_IDS = 2000;
const MAX_AMBIGUOUS = 500;

/**
 * Normalizes the client-supplied ambiguity report: keeps only well-formed
 * fields and filters out malformed candidates. Returns null on bad input —
 * garbage must not be persisted into the store.
 */
function sanitizeAmbiguous(v: unknown): StoredExclusions["ambiguous"] | null {
  if (!Array.isArray(v) || v.length > MAX_AMBIGUOUS) return null;
  const out: StoredExclusions["ambiguous"] = [];
  for (const item of v) {
    if (typeof item !== "object" || item === null) return null;
    const { name, year, reason, candidates } = item as Record<string, unknown>;
    if (typeof name !== "string" || typeof reason !== "string") return null;
    if (year !== null && year !== undefined && typeof year !== "number") return null;
    if (!Array.isArray(candidates)) return null;
    const cands = candidates
      .filter(
        (c): c is { imdbId: string; title: string; score: number } =>
          typeof c === "object" &&
          c !== null &&
          typeof (c as Record<string, unknown>).imdbId === "string" &&
          IMDB_ID.test((c as Record<string, unknown>).imdbId as string) &&
          typeof (c as Record<string, unknown>).title === "string" &&
          typeof (c as Record<string, unknown>).score === "number",
      )
      .map((c) => ({ imdbId: c.imdbId, title: c.title, score: c.score }));
    out.push({ name, year: year ?? null, reason, candidates: cands });
  }
  return out;
}

const RESERVED = new Set(["manifest.json", "catalog", "configure", "chart.json", "status.json", "exclusions", "configure.js"]);

/** Splits "/{cfg?}/rest/of/path" — cfg is present iff the first segment decodes as a config object. */
function splitConfig(segments: string[], envConfig: AddonConfig): { cfg: AddonConfig; rest: string[] } {
  const first = segments[0];
  if (first && !RESERVED.has(first)) {
    try {
      const cfg = decodeConfig(decodeURIComponent(first));
      if (cfg) return { cfg, rest: segments.slice(1) };
    } catch {
      // malformed percent-encoding: not a config, fall through to envConfig
    }
  }
  return { cfg: envConfig, rest: segments };
}

function manifest(cfg: AddonConfig) {
  return {
    id: "community.stremio-top250-unseen",
    version: "0.1.0",
    name: "Top 250 Unseen",
    description: "The IMDb Top 250, minus the films you've already seen (Letterboxd).",
    logo: "https://upload.wikimedia.org/wikipedia/commons/6/69/IMDB_Logo_2016.svg",
    resources: ["catalog"],
    types: ["movie"],
    catalogs: [
      {
        id: CATALOG_ID,
        type: "movie",
        name: cfg.catalogName ?? DEFAULT_CATALOG_NAME,
        extra: [{ name: "skip" }],
      },
    ],
    behaviorHints: { configurable: true },
  };
}

function watchedProviders(cfg: AddonConfig, deps: AddonDeps): { providers: WatchedProvider[]; exclusions: ExclusionsProvider } {
  const exclusions = new ExclusionsProvider(deps.store, cfg.storageKey ?? DEFAULT_STORAGE_KEY);
  const providers: WatchedProvider[] = [exclusions];
  if (cfg.letterboxdUsername) {
    const resolver = new IdResolver(deps.cache, cfg.tmdbApiKey ? { tmdbApiKey: cfg.tmdbApiKey } : {});
    providers.push(new LetterboxdRssProvider(cfg.letterboxdUsername, deps.cache, deps.store, resolver));
  }
  return { providers, exclusions };
}

async function watchedIds(providers: WatchedProvider[]): Promise<{ ids: Set<string>; errors: string[] }> {
  const ids = new Set<string>();
  const errors: string[] = [];
  for (const p of providers) {
    try {
      for (const id of await p.getWatchedIds()) ids.add(id);
      // providers that degrade gracefully (RSS serving its accumulated set on
      // feed failure) still report the error here so /status.json shows it
      if (p instanceof LetterboxdRssProvider && p.lastError) errors.push(`${p.name}: ${p.lastError}`);
    } catch (e) {
      // a failing watched source must never take the catalog down — it just
      // risks showing films that were already seen
      errors.push(`${p.name}: ${(e as Error).message}`);
    }
  }
  return { ids, errors };
}

function chartService(deps: AddonDeps): ChartService {
  return new ChartService(
    deps.chartProviders ?? [new ImdbGraphqlProvider(), new SnapshotProvider(deps.snapshot, deps.snapshotUrl ?? null)],
    deps.cache,
  );
}

export async function handleRequest(
  method: string,
  pathname: string,
  body: string | null,
  deps: AddonDeps,
): Promise<HttpResult> {
  const segments = pathname.split("/").filter(Boolean);
  const { cfg, rest } = splitConfig(segments, deps.envConfig);

  // / and /{cfg?}/configure → configuration page (static JS is served by the runtime)
  if (method === "GET" && (rest.length === 0 || rest[0] === "configure")) {
    return {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Access-Control-Allow-Origin": "*" },
      body: deps.configureHtml ?? "<h1>configure page not bundled</h1>",
    };
  }

  // /{cfg?}/manifest.json
  if (rest[0] === "manifest.json" && method === "GET") {
    return json(200, manifest(cfg));
  }

  // /{cfg?}/catalog/movie/{id}.json and /{cfg?}/catalog/movie/{id}/{extra}.json
  if (rest[0] === "catalog" && rest[1] === "movie" && rest[2] && method === "GET") {
    const id = rest[2].replace(/\.json$/, "");
    if (id !== CATALOG_ID) return json(404, { err: "unknown catalog" });

    let skip = 0;
    let extra: string | undefined;
    try {
      extra = rest[3] ? decodeURIComponent(rest[3]).replace(/\.json$/, "") : undefined;
    } catch {
      extra = undefined; // malformed percent-encoding — treat as no extra
    }
    if (extra) {
      const m = extra.match(/(?:^|&)skip=(\d+)/);
      if (m) skip = Number(m[1]);
    }

    try {
      const chart = await chartService(deps).getChart();
      const { ids } = await watchedIds(watchedProviders(cfg, deps).providers);
      const metas = buildCatalog(chart.films, ids, cfg.overrides ?? {}, skip);
      return json(200, { metas });
    } catch (e) {
      return json(503, { err: (e as Error).message });
    }
  }

  // /{cfg?}/chart.json — exposes the raw ranked chart (public data); used by
  // the configure page for browser-side matching and handy for debugging.
  if (rest[0] === "chart.json" && method === "GET") {
    try {
      const chart = await chartService(deps).getChart();
      return json(200, { source: chart.source, stale: chart.stale, films: chart.films, aliases: deps.aliases ?? {} });
    } catch (e) {
      return json(503, { err: (e as Error).message });
    }
  }

  // GET /{cfg?}/exclusions — the stored exclusion set, so /configure can
  // prefill its checklist on revisit. Read access = knowing the URL config
  // (its storageKey), same trust level as viewing the configured catalog.
  if (rest[0] === "exclusions" && method === "GET") {
    const provider = new ExclusionsProvider(deps.store, cfg.storageKey ?? DEFAULT_STORAGE_KEY);
    const stored = await provider.getStored();
    return json(200, {
      excludedImdbIds: stored?.excludedImdbIds ?? [],
      manualExclusions: stored?.manualExclusions ?? [],
      updatedAt: stored?.updatedAt ?? null,
    });
  }

  // POST /{cfg?}/exclusions — receives ONLY matched imdbIds (+ manual picks
  // and ambiguous rows). The browser does the matching; the raw CSV never
  // leaves the user's machine. Omitted fields keep their stored value, so a
  // checklist-only update can't wipe the CSV-matched set.
  if (rest[0] === "exclusions" && method === "POST") {
    // bodies are small by design (~250 ids + a short ambiguity report)
    if (body && body.length > MAX_BODY_BYTES) return json(413, { err: "payload too large" });
    let payload: Partial<StoredExclusions> & { storageKey?: unknown };
    try {
      payload = JSON.parse(body ?? "null");
    } catch {
      return json(400, { err: "invalid json" });
    }
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      return json(400, { err: "invalid json" });
    }
    const validIds = (v: unknown): v is string[] =>
      Array.isArray(v) && v.length <= MAX_EXCLUSION_IDS && v.every((id) => typeof id === "string" && IMDB_ID.test(id));
    for (const field of ["excludedImdbIds", "manualExclusions"] as const) {
      if (payload[field] !== undefined && !validIds(payload[field])) {
        return json(400, { err: `invalid imdb id in ${field}` });
      }
    }
    if (payload.excludedImdbIds === undefined && payload.manualExclusions === undefined) {
      return json(400, { err: "excludedImdbIds[] or manualExclusions[] required" });
    }

    let ambiguous: StoredExclusions["ambiguous"] | undefined;
    if (payload.ambiguous !== undefined) {
      ambiguous = sanitizeAmbiguous(payload.ambiguous) ?? undefined;
      if (!ambiguous) return json(400, { err: "invalid ambiguous[] entries" });
    }

    // storageKey = unguessable uuid generated by the configure page; knowing
    // it grants write access to that exclusion set. If the URL config carries
    // one, the payload must match it. A storageKey is required so anonymous
    // writes can't land in the shared "default" scope.
    if (payload.storageKey !== undefined && typeof payload.storageKey !== "string") {
      return json(400, { err: "invalid storageKey" });
    }
    if (cfg.storageKey && payload.storageKey !== cfg.storageKey) {
      return json(403, { err: "storageKey mismatch" });
    }
    const storageKey = cfg.storageKey ?? payload.storageKey;
    if (!storageKey) return json(400, { err: "storageKey required" });
    const provider = new ExclusionsProvider(deps.store, storageKey);
    const existing = await provider.getStored();
    const merged = {
      excludedImdbIds: [...new Set(payload.excludedImdbIds ?? existing?.excludedImdbIds ?? [])],
      manualExclusions: [...new Set(payload.manualExclusions ?? existing?.manualExclusions ?? [])],
      ambiguous: ambiguous ?? existing?.ambiguous ?? [],
      updatedAt: new Date().toISOString(),
    };
    await provider.put(merged);
    return json(200, { ok: true, excluded: merged.excludedImdbIds.length + merged.manualExclusions.length });
  }

  // /{cfg?}/status.json — observability: source freshness, exclusion counts, ambiguities
  if (rest[0] === "status.json" && method === "GET") {
    const { providers, exclusions } = watchedProviders(cfg, deps);
    const stored = await exclusions.getStored();
    const { ids, errors } = await watchedIds(providers);
    let chartInfo: { source?: string; stale?: boolean; count?: number; error?: string } = {};
    try {
      const chart = await chartService(deps).getChart();
      chartInfo = { source: chart.source, stale: chart.stale, count: chart.films.length };
    } catch (e) {
      chartInfo = { error: (e as Error).message };
    }
    return json(200, {
      chart: chartInfo,
      watched: {
        totalExcluded: ids.size,
        csv: stored
          ? { excluded: stored.excludedImdbIds.length, manual: stored.manualExclusions?.length ?? 0, updatedAt: stored.updatedAt, ambiguous: stored.ambiguous }
          : null,
        rss: cfg.letterboxdUsername ? { username: cfg.letterboxdUsername } : null,
        errors,
      },
    });
  }

  return json(404, { err: "not found" });
}
