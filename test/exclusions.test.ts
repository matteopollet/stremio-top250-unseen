import { describe, expect, it } from "vitest";
import { MemoryCache } from "../src/core/cache.js";
import { encodeConfig } from "../src/core/config.js";
import { ExclusionsProvider, type StoredExclusions } from "../src/core/watched/exclusions.js";
import type { KeyValueStore } from "../src/core/watched/letterboxd-rss.js";
import { handleRequest, type AddonDeps } from "../src/http/addon.js";

class MapStore implements KeyValueStore {
  map = new Map<string, unknown>();
  async get<T>(k: string) { return this.map.get(k) as T | undefined; }
  async set<T>(k: string, v: T) { this.map.set(k, v); }
}

function deps(store = new MapStore()): AddonDeps {
  return {
    cache: new MemoryCache(),
    store,
    envConfig: {},
    snapshot: { source: "test", fetchedAt: "2025-01-01", films: [] },
  };
}

const post = (deps: AddonDeps, body: unknown, path = "/exclusions") =>
  handleRequest("POST", path, JSON.stringify(body), deps);

describe("ExclusionsProvider", () => {
  it("unions csv-matched and manual exclusions", async () => {
    const store = new MapStore();
    const p = new ExclusionsProvider(store, "k");
    await p.put({
      excludedImdbIds: ["tt0111161"],
      manualExclusions: ["tt0068646"],
      ambiguous: [],
      updatedAt: "2025-01-01",
    });
    const ids = await p.getWatchedIds();
    expect(ids).toEqual(new Set(["tt0111161", "tt0068646"]));
  });

  it("tolerates a stored set without manualExclusions (older writes)", async () => {
    const store = new MapStore();
    await store.set<StoredExclusions>("watched:csv:k", {
      excludedImdbIds: ["tt0111161"],
      ambiguous: [],
      updatedAt: "2025-01-01",
    });
    expect(await new ExclusionsProvider(store, "k").getWatchedIds()).toEqual(new Set(["tt0111161"]));
  });
});

describe("exclusions routes", () => {
  it("GET returns empty arrays when nothing is stored", async () => {
    const res = await handleRequest("GET", "/exclusions", null, deps());
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ excludedImdbIds: [], manualExclusions: [], updatedAt: null });
  });

  it("POST then GET round-trips both sets", async () => {
    const d = deps();
    await post(d, { storageKey: "k1", excludedImdbIds: ["tt0111161"], manualExclusions: ["tt0068646"], ambiguous: [] });
    const cfg = encodeConfig({ storageKey: "k1" });
    const res = await handleRequest("GET", `/${cfg}/exclusions`, null, d);
    const body = JSON.parse(res.body);
    expect(body.excludedImdbIds).toEqual(["tt0111161"]);
    expect(body.manualExclusions).toEqual(["tt0068646"]);
  });

  it("a manual-only update preserves the csv-matched set", async () => {
    const d = deps();
    await post(d, { storageKey: "k1", excludedImdbIds: ["tt0111161"], ambiguous: [] });
    await post(d, { storageKey: "k1", manualExclusions: ["tt0068646"] });
    const cfg = encodeConfig({ storageKey: "k1" });
    const res = await handleRequest("GET", `/${cfg}/exclusions`, null, d);
    expect(JSON.parse(res.body).excludedImdbIds).toEqual(["tt0111161"]);
  });

  it("a csv re-import preserves manual picks", async () => {
    const d = deps();
    await post(d, { storageKey: "k1", manualExclusions: ["tt0068646"] });
    await post(d, { storageKey: "k1", excludedImdbIds: ["tt0111161"], ambiguous: [] });
    const cfg = encodeConfig({ storageKey: "k1" });
    const res = await handleRequest("GET", `/${cfg}/exclusions`, null, d);
    const body = JSON.parse(res.body);
    expect(body.excludedImdbIds).toEqual(["tt0111161"]);
    expect(body.manualExclusions).toEqual(["tt0068646"]);
  });

  it("rejects malformed imdb ids", async () => {
    const res = await post(deps(), { storageKey: "k1", manualExclusions: ["not-an-id"] });
    expect(res.status).toBe(400);
  });

  it("requires a storageKey — anonymous writes can't land in the default scope", async () => {
    const res = await post(deps(), { excludedImdbIds: ["tt0111161"] });
    expect(res.status).toBe(400);
  });

  it("rejects a non-string storageKey", async () => {
    const res = await post(deps(), { storageKey: 42, excludedImdbIds: ["tt0111161"] });
    expect(res.status).toBe(400);
  });

  it("rejects a storageKey that mismatches the URL config", async () => {
    const cfg = encodeConfig({ storageKey: "k1" });
    const res = await post(deps(), { storageKey: "k2", excludedImdbIds: ["tt0111161"] }, `/${cfg}/exclusions`);
    expect(res.status).toBe(403);
  });

  it("rejects malformed ambiguous entries instead of persisting garbage", async () => {
    const res = await post(deps(), {
      storageKey: "k1",
      excludedImdbIds: ["tt0111161"],
      ambiguous: [{ name: 42, reason: "x", candidates: [] }],
    });
    expect(res.status).toBe(400);
  });

  it("normalizes ambiguous entries — drops malformed candidates and stray fields", async () => {
    const d = deps();
    const res = await post(d, {
      storageKey: "k1",
      excludedImdbIds: ["tt0111161"],
      ambiguous: [
        {
          name: "Kill Bill: Vol. 2",
          year: 2004,
          reason: "title-similar-but-year-mismatch",
          extraField: "ignored",
          candidates: [
            { imdbId: "tt0266697", title: "Kill Bill: Vol. 1", score: 0.93, junk: true },
            { imdbId: "not-an-id", title: "Bad", score: 0.5 },
          ],
        },
      ],
    });
    expect(res.status).toBe(200);
    const stored = (await new ExclusionsProvider(d.store, "k1").getStored())!;
    expect(stored.ambiguous).toEqual([
      {
        name: "Kill Bill: Vol. 2",
        year: 2004,
        reason: "title-similar-but-year-mismatch",
        candidates: [{ imdbId: "tt0266697", title: "Kill Bill: Vol. 1", score: 0.93 }],
      },
    ]);
  });

  it("rejects non-object bodies and oversized payloads", async () => {
    expect((await post(deps(), [1, 2, 3])).status).toBe(400);
    const huge = "x".repeat(300_000);
    const res = await handleRequest("POST", "/exclusions", huge, deps());
    expect(res.status).toBe(413);
  });
});
