import { describe, expect, it } from "vitest";
import { MemoryCache } from "../src/core/cache.js";
import { encodeConfig } from "../src/core/config.js";
import type { ChartProvider, RankedFilm } from "../src/core/types.js";
import type { KeyValueStore } from "../src/core/watched/letterboxd-rss.js";
import { handleRequest, type AddonDeps } from "../src/http/addon.js";

class MapStore implements KeyValueStore {
  map = new Map<string, unknown>();
  async get<T>(k: string) { return this.map.get(k) as T | undefined; }
  async set<T>(k: string, v: T) { this.map.set(k, v); }
}

const films: RankedFilm[] = Array.from({ length: 5 }, (_, i) => ({
  rank: i + 1, imdbId: `tt00000${i}`, title: `Film ${i}`, originalTitle: null,
  year: 2000 + i, posterUrl: null, imdbRating: 8,
}));

const stubChart: ChartProvider = { name: "stub", getChart: async () => films };
const failingChart: ChartProvider = {
  name: "failing",
  getChart: async () => { throw new Error("upstream down"); },
};

function deps(opts: { store?: MapStore; envConfig?: AddonDeps["envConfig"]; providers?: ChartProvider[] } = {}): AddonDeps {
  return {
    cache: new MemoryCache(),
    store: opts.store ?? new MapStore(),
    envConfig: opts.envConfig ?? {},
    snapshot: { source: "test", fetchedAt: "2025-01-01", films: [] },
    chartProviders: opts.providers ?? [stubChart],
  };
}

describe("manifest", () => {
  it("serves the default catalog name", async () => {
    const res = await handleRequest("GET", "/manifest.json", null, deps());
    const m = JSON.parse(res.body);
    expect(m.catalogs[0].id).toBe("top250_unseen");
    expect(m.behaviorHints.configurable).toBe(true);
  });

  it("honors catalogName from the URL config", async () => {
    const cfg = encodeConfig({ catalogName: "My List" });
    const res = await handleRequest("GET", `/${cfg}/manifest.json`, null, deps());
    expect(JSON.parse(res.body).catalogs[0].name).toBe("My List");
  });
});

describe("catalog route", () => {
  it("returns metas in rank order", async () => {
    const res = await handleRequest("GET", "/catalog/movie/top250_unseen.json", null, deps());
    const metas = JSON.parse(res.body).metas;
    expect(metas.map((m: { id: string }) => m.id)).toEqual(films.map((f) => f.imdbId));
  });

  it("excludes ids stored under the config's storageKey", async () => {
    const store = new MapStore();
    await store.set("watched:csv:k1", {
      excludedImdbIds: ["tt000000", "tt000002"], manualExclusions: [], ambiguous: [], updatedAt: "x",
    });
    const cfg = encodeConfig({ storageKey: "k1" });
    const res = await handleRequest("GET", `/${cfg}/catalog/movie/top250_unseen.json`, null, deps({ store }));
    const ids = JSON.parse(res.body).metas.map((m: { id: string }) => m.id);
    expect(ids).toEqual(["tt000001", "tt000003", "tt000004"]);
  });

  it("paginates via the skip extra, plain or percent-encoded", async () => {
    const r1 = await handleRequest("GET", "/catalog/movie/top250_unseen/skip=2.json", null, deps());
    expect(JSON.parse(r1.body).metas[0].id).toBe("tt000002");
    const r2 = await handleRequest("GET", "/catalog/movie/top250_unseen/skip%3D2.json", null, deps());
    expect(JSON.parse(r2.body).metas[0].id).toBe("tt000002");
  });

  it("404s on an unknown catalog id", async () => {
    const res = await handleRequest("GET", "/catalog/movie/other.json", null, deps());
    expect(res.status).toBe(404);
  });

  it("503s when every chart provider fails", async () => {
    const res = await handleRequest("GET", "/catalog/movie/top250_unseen.json", null, deps({ providers: [failingChart] }));
    expect(res.status).toBe(503);
  });

  it("applies forceInclude/forceExclude overrides from the config", async () => {
    const store = new MapStore();
    await store.set("watched:csv:k1", {
      excludedImdbIds: ["tt000000"], manualExclusions: [], ambiguous: [], updatedAt: "x",
    });
    const cfg = encodeConfig({ storageKey: "k1", overrides: { forceInclude: ["tt000000"], forceExclude: ["tt000001"] } });
    const res = await handleRequest("GET", `/${cfg}/catalog/movie/top250_unseen.json`, null, deps({ store }));
    const ids = JSON.parse(res.body).metas.map((m: { id: string }) => m.id);
    expect(ids).toEqual(["tt000000", "tt000002", "tt000003", "tt000004"]);
  });

  it("a malformed first path segment falls through to env config", async () => {
    const res = await handleRequest("GET", "/%zz/manifest.json", null, deps({ envConfig: { catalogName: "Env" } }));
    expect(res.status).toBe(404); // "%zz" is not a valid route, not a 500
  });
});
