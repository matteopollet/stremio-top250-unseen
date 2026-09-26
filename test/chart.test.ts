import { describe, expect, it } from "vitest";
import { MemoryCache } from "../src/core/cache.js";
import { ChartService } from "../src/core/chart/index.js";
import { ImdbGraphqlProvider } from "../src/core/chart/imdb-graphql.js";
import { SnapshotProvider, type SnapshotFile } from "../src/core/chart/snapshot.js";
import type { RankedFilm } from "../src/core/types.js";

const film: RankedFilm = {
  rank: 1, imdbId: "tt0111161", title: "The Shawshank Redemption",
  originalTitle: null, year: 1994, posterUrl: null, imdbRating: 9.3,
};

const SNAPSHOT: SnapshotFile = { source: "test", fetchedAt: "2026-01-01", films: [film] };

const gqlBody = {
  data: {
    chartTitles: {
      total: 1,
      edges: [{
        node: {
          id: "tt0111161",
          titleText: { text: "The Shawshank Redemption" },
          originalTitleText: { text: "The Shawshank Redemption" },
          releaseYear: { year: 1994 },
          primaryImage: { url: "https://img/p.jpg" },
          ratingsSummary: { aggregateRating: 9.3 },
        },
      }],
    },
  },
};

function fakeFetch(body: unknown, status = 200) {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as never;
}

describe("ImdbGraphqlProvider", () => {
  it("maps graphql edges to ranked films", async () => {
    const p = new ImdbGraphqlProvider(fakeFetch(gqlBody));
    const films = await p.getChart();
    expect(films).toHaveLength(1);
    expect(films[0]).toMatchObject({ rank: 1, imdbId: "tt0111161", year: 1994, imdbRating: 9.3 });
  });

  it("throws on graphql errors", async () => {
    const p = new ImdbGraphqlProvider(fakeFetch({ errors: [{ message: "boom" }] }));
    await expect(p.getChart()).rejects.toThrow("boom");
  });

  it("throws on http failure", async () => {
    const p = new ImdbGraphqlProvider(fakeFetch({}, 403));
    await expect(p.getChart()).rejects.toThrow("403");
  });
});

describe("SnapshotProvider", () => {
  it("returns bundled snapshot films", async () => {
    const p = new SnapshotProvider(SNAPSHOT);
    expect((await p.getChart())[0]!.imdbId).toBe("tt0111161");
  });

  it("fetches snapshot from url when configured", async () => {
    const p = new SnapshotProvider(null, "https://example.com/snap.json", (async () => ({
      ok: true, status: 200, json: async () => SNAPSHOT,
    })) as typeof fetch);
    expect((await p.getChart())[0]!.imdbId).toBe("tt0111161");
  });

  it("falls back to the bundled snapshot when the configured URL fails", async () => {
    const failing = (async () => { throw new Error("cdn down"); }) as typeof fetch;
    const p = new SnapshotProvider(SNAPSHOT, "https://example.com/snap.json", failing);
    expect((await p.getChart())[0]!.imdbId).toBe("tt0111161");
    expect(p.name).toBe("snapshot:bundled"); // reports what actually served
  });

  it("still throws when the URL fails and nothing is bundled", async () => {
    const failing = (async () => { throw new Error("cdn down"); }) as typeof fetch;
    const p = new SnapshotProvider(null, "https://example.com/snap.json", failing);
    await expect(p.getChart()).rejects.toThrow("cdn down");
  });
});

describe("ChartService", () => {
  it("uses the first healthy provider and caches", async () => {
    const cache = new MemoryCache();
    const svc = new ChartService([
      new ImdbGraphqlProvider(fakeFetch(gqlBody)),
      new SnapshotProvider(SNAPSHOT),
    ], cache);
    const r = await svc.getChart();
    expect(r.source).toBe("imdb-graphql");
    expect(r.stale).toBe(false);
  });

  it("falls back to snapshot when graphql fails", async () => {
    const cache = new MemoryCache();
    const svc = new ChartService([
      new ImdbGraphqlProvider(fakeFetch({}, 403)),
      new SnapshotProvider(SNAPSHOT),
    ], cache);
    const r = await svc.getChart();
    expect(r.source).toBe("snapshot:bundled");
    expect(r.films[0]!.imdbId).toBe("tt0111161");
  });

  it("serves last-good when everything fails", async () => {
    const cache = new MemoryCache();
    // prime the last-good cache
    const ok = new ChartService([new SnapshotProvider(SNAPSHOT)], cache);
    await ok.getChart();

    const broken = new ChartService([new ImdbGraphqlProvider(fakeFetch({}, 500))], cache);
    // first call still cached from priming → clear current but keep last-good
    await cache.delete("chart:current");
    const r = await broken.getChart();
    expect(r.stale).toBe(true);
    expect(r.films[0]!.imdbId).toBe("tt0111161");
  });

  it("throws when nothing has ever worked", async () => {
    const svc = new ChartService([new ImdbGraphqlProvider(fakeFetch({}, 500))], new MemoryCache());
    await expect(svc.getChart()).rejects.toThrow("all chart providers failed");
  });
});
