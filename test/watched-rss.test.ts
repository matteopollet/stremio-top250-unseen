import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { MemoryCache } from "../src/core/cache.js";
import { IdResolver } from "../src/core/resolve.js";
import { LetterboxdRssProvider, parseLetterboxdRss, type KeyValueStore } from "../src/core/watched/letterboxd-rss.js";

const fixture = await readFile(new URL("./fixtures/letterboxd-rss.xml", import.meta.url), "utf8");

describe("parseLetterboxdRss", () => {
  it("keeps only watch/diary/review items with a tmdb id", () => {
    const items = parseLetterboxdRss(fixture);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ tmdbId: 278, title: "The Shawshank Redemption", watchedDate: "2025-09-20", rating: 5 });
    expect(items[1]!.tmdbId).toBe(129);
  });

  it("returns [] on garbage", () => {
    expect(parseLetterboxdRss("not xml")).toEqual([]);
  });

  it("strips CDATA wrappers around namespaced fields", () => {
    const xml = `<rss xmlns:letterboxd="https://letterboxd.com" xmlns:tmdb="https://themoviedb.org"><channel>
      <item><guid isPermaLink="false">letterboxd-watch-1</guid>
      <letterboxd:filmTitle><![CDATA[The Shawshank Redemption]]></letterboxd:filmTitle>
      <tmdb:movieId>278</tmdb:movieId></item></channel></rss>`;
    expect(parseLetterboxdRss(xml)[0]!.title).toBe("The Shawshank Redemption");
  });
});

class MapStore implements KeyValueStore {
  map = new Map<string, unknown>();
  async get<T>(k: string) { return this.map.get(k) as T | undefined; }
  async set<T>(k: string, v: T) { this.map.set(k, v); }
}

describe("IdResolver", () => {
  it("resolves via a single batched wikidata request and caches permanently", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: { bindings: [
            { tmdb: { value: "278" }, imdb: { value: "tt0111161" } },
            { tmdb: { value: "129" }, imdb: { value: "tt0245429" } },
          ] },
        }),
      };
    };
    const cache = new MemoryCache();
    const r = new IdResolver(cache, { fetchImpl: fetchImpl as never });
    const out = await r.resolveTmdbIds([278, 129]);
    expect(out.get(278)).toBe("tt0111161");
    expect(out.get(129)).toBe("tt0245429");
    expect(calls).toBe(1);

    // second call: fully cached, zero subrequests
    const out2 = await r.resolveTmdbIds([278, 129]);
    expect(out2.size).toBe(2);
    expect(calls).toBe(1);
  });
});

describe("LetterboxdRssProvider", () => {
  it("accumulates resolved ids in the persistent store", async () => {
    const store = new MapStore();
    const cache = new MemoryCache();
    const resolver = new IdResolver(cache, {
      fetchImpl: (async () => ({
        ok: true, status: 200,
        json: async () => ({ results: { bindings: [{ tmdb: { value: "278" }, imdb: { value: "tt0111161" } }] } }),
      })) as never,
    });
    const provider = new LetterboxdRssProvider("testuser", cache, store, resolver,
      (async () => ({ ok: true, text: async () => fixture })) as never);

    const ids = await provider.getWatchedIds();
    expect(ids.has("tt0111161")).toBe(true);

    // second call: feed is cached, accumulated set still returned
    const ids2 = await provider.getWatchedIds();
    expect(ids2.has("tt0111161")).toBe(true);
    expect(store.map.get("watched:rss:testuser")).toEqual(["tt0111161"]);
  });

  it("keeps serving accumulated ids when the feed is unreachable", async () => {
    const store = new MapStore();
    const resolver = new IdResolver(new MemoryCache(), {
      fetchImpl: (async () => ({
        ok: true, status: 200,
        json: async () => ({ results: { bindings: [{ tmdb: { value: "278" }, imdb: { value: "tt0111161" } }] } }),
      })) as never,
    });

    // prime the accumulated set with a healthy feed
    const ok = new LetterboxdRssProvider("testuser", new MemoryCache(), store, resolver,
      (async () => ({ ok: true, text: async () => fixture })) as never);
    await ok.getWatchedIds();

    // feed down: fresh cache forces a fetch, which fails — accumulated ids survive
    const failing = new LetterboxdRssProvider("testuser", new MemoryCache(), store, resolver,
      (async () => { throw new Error("letterboxd rss: HTTP 500"); }) as never);
    const ids = await failing.getWatchedIds();
    expect(ids.has("tt0111161")).toBe(true);
    expect(failing.lastError).toBe("letterboxd rss: HTTP 500");
  });
});
