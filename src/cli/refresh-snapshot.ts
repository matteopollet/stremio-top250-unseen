/**
 * Refreshes data/top250.snapshot.json from the live IMDb GraphQL chart.
 * Used by CI (weekly) and locally: `npm run refresh-snapshot`.
 * Best-effort: exits 0 with a warning when IMDb is unreachable (e.g. WAF on
 * CI runners), leaving the existing snapshot in place.
 */
import { writeFile } from "node:fs/promises";
import { ImdbGraphqlProvider } from "../core/chart/imdb-graphql.js";
import type { SnapshotFile } from "../core/chart/snapshot.js";

const OUT = new URL("../../data/top250.snapshot.json", import.meta.url);

try {
  const films = await new ImdbGraphqlProvider().getChart();
  const snapshot: SnapshotFile = {
    source: "https://api.graphql.imdb.com chartTitles TOP_RATED_MOVIES",
    fetchedAt: new Date().toISOString(),
    films,
  };
  await writeFile(OUT, JSON.stringify(snapshot, null, 1) + "\n");
  console.log(`snapshot refreshed: ${films.length} films, #1 = ${films[0]!.title}`);
} catch (e) {
  // the ::warning annotation makes a permanently broken endpoint visible in
  // the weekly workflow's run summary — "no diff" must not be confused with
  // "refresh failed" while the bundled snapshot silently goes stale
  console.warn(`::warning file=data/top250.snapshot.json::snapshot refresh skipped: ${(e as Error).message}`);
}
