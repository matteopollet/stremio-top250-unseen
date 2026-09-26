import { describe, expect, it } from "vitest";
import { matchWatched, normalizeTitle } from "../src/core/matcher.js";
import type { RankedFilm } from "../src/core/types.js";

// Subset of the real IMDb Top 250 (see data/top250.snapshot.json) covering the
// known-tricky cases: franchise prefixes, translated titles, abbreviations,
// same-prefix different films.
const CHART: RankedFilm[] = [
  { rank: 1, imdbId: "tt0111161", title: "The Shawshank Redemption", originalTitle: "The Shawshank Redemption", year: 1994, posterUrl: null, imdbRating: 9.3 },
  { rank: 2, imdbId: "tt0068646", title: "The Godfather", originalTitle: "The Godfather", year: 1972, posterUrl: null, imdbRating: 9.2 },
  { rank: 11, imdbId: "tt0060196", title: "The Good, the Bad and the Ugly", originalTitle: "Il buono, il brutto, il cattivo", year: 1966, posterUrl: null, imdbRating: 8.8 },
  { rank: 15, imdbId: "tt0080684", title: "Star Wars: Episode V - The Empire Strikes Back", originalTitle: "Star Wars: Episode V - The Empire Strikes Back", year: 1980, posterUrl: null, imdbRating: 8.7 },
  { rank: 24, imdbId: "tt0047478", title: "Seven Samurai", originalTitle: "Shichinin no samurai", year: 1954, posterUrl: null, imdbRating: 8.6 },
  { rank: 60, imdbId: "tt15239678", title: "Dune: Part Two", originalTitle: "Dune: Part Two", year: 2024, posterUrl: null, imdbRating: 8.5 },
  { rank: 90, imdbId: "tt0087843", title: "Once Upon a Time in America", originalTitle: "C'era una volta in America", year: 1984, posterUrl: null, imdbRating: 8.3 },
  { rank: 164, imdbId: "tt0055630", title: "Yojimbo", originalTitle: "Yôjinbô", year: 1961, posterUrl: null, imdbRating: 8.2 },
  { rank: 221, imdbId: "tt0046438", title: "Tokyo Story", originalTitle: "Tôkyô monogatari", year: 1953, posterUrl: null, imdbRating: 8.2 },
];

function entry(name: string, year: number | null = null) {
  return { name, year, letterboxdUri: null };
}

describe("normalizeTitle", () => {
  it("strips diacritics, punctuation, articles", () => {
    expect(normalizeTitle("Tôkyô monogatari")).toBe("tokyo monogatari");
    expect(normalizeTitle("The Godfather")).toBe("godfather");
    expect(normalizeTitle("Léon: The Professional")).toBe("leon the professional");
    expect(normalizeTitle("C'era una volta il West")).toBe("cera una volta il west");
  });
});

describe("matchWatched — confident exclusions", () => {
  it("exact title + year", () => {
    const r = matchWatched([entry("The Shawshank Redemption", 1994)], CHART);
    expect(r.excludedIds.has("tt0111161")).toBe(true);
  });

  it("franchise prefix containment: Letterboxd short title vs IMDb full title", () => {
    const r = matchWatched([entry("The Empire Strikes Back", 1980)], CHART);
    expect(r.excludedIds.has("tt0080684")).toBe(true);
  });

  it("translated title matched via originalTitle (fuzzy + exact year)", () => {
    const r = matchWatched([entry("Shichinin no samurai", 1954)], CHART);
    expect(r.excludedIds.has("tt0047478")).toBe(true);
  });

  it("exact title tolerates ±1 year difference", () => {
    const r = matchWatched([entry("Yojimbo", 1962)], CHART);
    expect(r.excludedIds.has("tt0055630")).toBe(true);
  });

  it("alias overrides apply", () => {
    const r = matchWatched([entry("Whatever Title", 2000)], CHART, {
      aliases: { "whatever title|2000": "tt0111161" },
    });
    expect(r.excludedIds.has("tt0111161")).toBe(true);
    expect(r.matched[0]!.how).toBe("alias");
  });
});

describe("matchWatched — doubt means keep", () => {
  it("exact title with wildly different year is ambiguous, not excluded", () => {
    const r = matchWatched([entry("The Godfather", 1990)], CHART);
    expect(r.excludedIds.size).toBe(0);
    expect(r.ambiguous[0]!.entry.name).toBe("The Godfather");
  });

  it("a different film never excludes (Dune 2021 vs Dune: Part Two 2024)", () => {
    const r = matchWatched([entry("Dune", 2021)], CHART);
    expect(r.excludedIds.size).toBe(0);
    // surfaced for review or ignored entirely — but never excluded
  });

  it("weak similarity is reported as ambiguous, never excluded", () => {
    const r = matchWatched([entry("The Ugly Truth", 1966)], CHART);
    expect(r.excludedIds.size).toBe(0);
    expect(r.ambiguous.length + r.ignoredCount).toBe(1);
  });

  it("unrelated entries are ignored silently (not chart films anyway)", () => {
    const r = matchWatched([entry("Space Jam", 1996), entry("Morbius", 2022)], CHART);
    expect(r.excludedIds.size).toBe(0);
    expect(r.ignoredCount).toBe(2);
    expect(r.ambiguous.length).toBe(0);
  });

  it("regression: substrings are not containment — 'Her' must not match 'Godfat-her'", () => {
    const r = matchWatched([entry("Her", 2013), entry("Monsieur Aznavour", 2024)], CHART);
    expect(r.excludedIds.size).toBe(0);
    // "her" inside "the godfather" must not even surface as a 98% candidate
    expect(r.ambiguous.flatMap((a) => a.candidates).map((c) => c.imdbId)).not.toContain("tt0068646");
  });
});
