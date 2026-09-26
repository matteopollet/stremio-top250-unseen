import type { RankedFilm, WatchedEntry } from "./types.js";

/**
 * Conservative matcher: a watched entry only excludes a chart film when the
 * evidence is strong. Doubt NEVER excludes — a false positive silently hides a
 * film the user hasn't seen; a false negative just leaves it visible.
 */

export type MatchHow = "exact-title" | "strong-title" | "alias" | "tmdb";

export interface MatchedEntry {
  entry: WatchedEntry;
  imdbId: string;
  title: string;
  how: MatchHow;
  score: number;
}

export interface AmbiguousEntry {
  entry: WatchedEntry;
  reason: string;
  candidates: { imdbId: string; title: string; score: number }[];
}

export interface MatchReport {
  excludedIds: Set<string>;
  matched: MatchedEntry[];
  ambiguous: AmbiguousEntry[];
  /** entries that resemble nothing in the chart — excluded from ambiguity on purpose */
  ignoredCount: number;
}

const ARTICLES = new Set(["the", "a", "an", "le", "la", "les", "l", "un", "une", "des", "il", "lo", "i", "gli", "el", "los", "las", "der", "die", "das", "den"]);

export function normalizeTitle(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((t, i, arr) => !(i === 0 && ARTICLES.has(t)) && t !== "")
    .join(" ");
}

/** Sørensen–Dice coefficient on character bigrams of normalized titles. */
function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) bigrams.set(a.slice(i, i + 2), (bigrams.get(a.slice(i, i + 2)) ?? 0) + 1);
  let overlap = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const n = bigrams.get(g);
    if (n && n > 0) {
      overlap++;
      bigrams.set(g, n - 1);
    }
  }
  return (2 * overlap) / (a.length - 1 + b.length - 1);
}

/**
 * True when one normalized title's token sequence is a contiguous subsequence
 * of the other's ("empire strikes back" ⊂ "star wars episode v the empire
 * strikes back"). Token-level, not substring — "her" must NOT match inside
 * "godfather". Requires ≥2 tokens on the shorter side to avoid noise.
 */
function contains(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const s = short.split(" ");
  const l = long.split(" ");
  if (s.length < 2 || s.length > l.length) return false;
  outer: for (let i = 0; i + s.length <= l.length; i++) {
    for (let j = 0; j < s.length; j++) if (l[i + j] !== s[j]) continue outer;
    return true;
  }
  return false;
}

const EXACT_SCORE = 0.98; // normalized equality
const STRONG_SCORE = 0.86; // fuzzy threshold — requires exact year
const REPORT_FLOOR = 0.45; // below this, the entry is ignored entirely

function yearsCompatible(entryYear: number | null, filmYear: number | null, tolerance: number): boolean {
  if (entryYear === null || filmYear === null) return tolerance === Infinity;
  return Math.abs(entryYear - filmYear) <= tolerance;
}

interface Candidate {
  film: RankedFilm;
  /** best normalized-title similarity over title + originalTitle */
  score: number;
  exact: boolean;
  containment: boolean;
}

function scoreAgainst(entry: WatchedEntry, film: RankedFilm): Candidate {
  const n = normalizeTitle(entry.name);
  let best: Candidate = { film, score: 0, exact: false, containment: false };
  for (const t of [film.title, film.originalTitle].filter((x): x is string => x !== null)) {
    const nt = normalizeTitle(t);
    const exact = nt === n;
    const cont = !exact && contains(n, nt);
    const score = exact ? 1 : cont ? Math.max(EXACT_SCORE, dice(n, nt)) : dice(n, nt);
    if (score > best.score) best = { film, score, exact, containment: cont };
  }
  return best;
}

export interface MatcherOptions {
  /** normalized "title|year" or "title|*" -> imdbId, applied before everything */
  aliases?: Record<string, string>;
}

export function matchWatched(entries: WatchedEntry[], chart: RankedFilm[], opts: MatcherOptions = {}): MatchReport {
  const chartById = new Map(chart.map((f) => [f.imdbId, f]));
  const aliases = opts.aliases ?? {};

  const report: MatchReport = { excludedIds: new Set(), matched: [], ambiguous: [], ignoredCount: 0 };

  for (const entry of entries) {
    const norm = normalizeTitle(entry.name);
    const aliasHit = aliases[`${norm}|${entry.year ?? "*"}`] ?? aliases[`${norm}|*`];
    if (aliasHit && chartById.has(aliasHit)) {
      const film = chartById.get(aliasHit)!;
      report.excludedIds.add(aliasHit);
      report.matched.push({ entry, imdbId: aliasHit, title: film.title, how: "alias", score: 1 });
      continue;
    }

    // best candidate by title similarity
    let best: Candidate | null = null;
    let second: Candidate | null = null;
    for (const film of chart) {
      const c = scoreAgainst(entry, film);
      if (!best || c.score > best.score) {
        second = best;
        best = c;
      } else if (!second || c.score > second.score) {
        second = c;
      }
    }
    if (!best) break;

    // tier 1: exact normalized title + exact year (or entry has no year and candidate is unique)
    if (best.exact && yearsCompatible(entry.year, best.film.year, 0)) {
      report.excludedIds.add(best.film.imdbId);
      report.matched.push({ entry, imdbId: best.film.imdbId, title: best.film.title, how: "exact-title", score: 1 });
      continue;
    }
    // tier 2: exact/containment title with ±1 year (Letterboxd vs IMDb year conventions)
    if ((best.exact || best.containment) && yearsCompatible(entry.year, best.film.year, 1)) {
      report.excludedIds.add(best.film.imdbId);
      report.matched.push({ entry, imdbId: best.film.imdbId, title: best.film.title, how: "strong-title", score: best.score });
      continue;
    }
    // tier 3: fuzzy title, but ONLY with exact year and a clear margin over the runner-up
    if (
      best.score >= STRONG_SCORE &&
      yearsCompatible(entry.year, best.film.year, 0) &&
      (!second || best.score - second.score >= 0.1)
    ) {
      report.excludedIds.add(best.film.imdbId);
      report.matched.push({ entry, imdbId: best.film.imdbId, title: best.film.title, how: "strong-title", score: best.score });
      continue;
    }

    // everything else: report only if it plausibly IS a chart film we failed to identify
    if (best.score >= REPORT_FLOOR) {
      const candidates = chart
        .map((f) => scoreAgainst(entry, f))
        .filter((c) => c.score >= REPORT_FLOOR)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((c) => ({ imdbId: c.film.imdbId, title: c.film.title, score: Math.round(c.score * 100) / 100 }));
      report.ambiguous.push({
        entry,
        reason: ambiguityReason(best, entry),
        candidates,
      });
    } else {
      report.ignoredCount++;
    }
  }
  return report;
}

function ambiguityReason(best: Candidate, entry: WatchedEntry): string {
  if (best.score >= STRONG_SCORE) return "title-similar-but-year-mismatch";
  if (best.containment) return "title-contained-but-year-mismatch";
  return "weak-title-similarity";
}
