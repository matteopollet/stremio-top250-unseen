import { describe, expect, it } from "vitest";
import { buildCatalog, PAGE_SIZE } from "../src/core/catalog.js";
import type { RankedFilm } from "../src/core/types.js";

const chart: RankedFilm[] = Array.from({ length: 5 }, (_, i) => ({
  rank: i + 1, imdbId: `tt${i}`, title: `Film ${i}`, originalTitle: null,
  year: 2000 + i, posterUrl: "https://img/p.jpg", imdbRating: 8,
}));

describe("buildCatalog", () => {
  it("removes watched films and preserves rank order", () => {
    const metas = buildCatalog(chart, new Set(["tt0", "tt2"]));
    expect(metas.map((m) => m.id)).toEqual(["tt1", "tt3", "tt4"]);
    expect(metas[0]!.description).toBe("#2 · IMDb Top 250");
  });

  it("produces valid metaPreviews", () => {
    const [m] = buildCatalog(chart, new Set());
    expect(m).toMatchObject({
      id: "tt0", type: "movie", name: "Film 0",
      poster: "https://img/p.jpg", imdbRating: "8", releaseInfo: "2000",
    });
  });

  it("applies forceExclude / forceInclude overrides", () => {
    const metas = buildCatalog(chart, new Set(["tt0"]), {
      forceExclude: ["tt1"],
      forceInclude: ["tt0"],
    });
    expect(metas.map((m) => m.id)).toEqual(["tt0", "tt2", "tt3", "tt4"]);
  });

  it("paginates with skip", () => {
    const big = Array.from({ length: 250 }, (_, i) => ({ ...chart[0]!, rank: i + 1, imdbId: `tt${i}`, title: `F${i}` }));
    expect(buildCatalog(big, new Set(), {}, 0)).toHaveLength(PAGE_SIZE);
    expect(buildCatalog(big, new Set(), {}, 200)).toHaveLength(50);
    expect(buildCatalog(big, new Set(), {}, 999)).toHaveLength(0);
  });
});
