/**
 * Self-hosted import: `npm run import-watched -- path/to/watched.csv [ratings.csv diary.csv]`
 * Matches the export against the Top 250 and stores the excluded imdbIds
 * under the env-mode storage key ("default").
 */
import { readFile } from "node:fs/promises";
import { ChartService } from "../core/chart/index.js";
import { ImdbGraphqlProvider } from "../core/chart/imdb-graphql.js";
import { SnapshotProvider, type SnapshotFile } from "../core/chart/snapshot.js";
import { DEFAULT_STORAGE_KEY } from "../core/config.js";
import { matchWatched } from "../core/matcher.js";
import { ExclusionsProvider } from "../core/watched/exclusions.js";
import { parseLetterboxdExports } from "../core/watched/letterboxd-csv.js";
import { FileCache } from "../runtime/file-cache.js";

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error("usage: npm run import-watched -- <csv> [<csv>...]");
  process.exit(1);
}

const DATA_DIR = process.env.DATA_DIR ?? "data/local";
const BUNDLED_DATA = new URL("../../data/", import.meta.url);
const snapshot = JSON.parse(await readFile(new URL("top250.snapshot.json", BUNDLED_DATA), "utf8")) as SnapshotFile;
const aliases = (JSON.parse(await readFile(new URL("aliases.json", BUNDLED_DATA), "utf8")) as { aliases: Record<string, string> }).aliases;

const cache = new FileCache(`${DATA_DIR}/cache.json`);
const store = new FileCache(`${DATA_DIR}/store.json`);

const chart = await new ChartService(
  [
    new ImdbGraphqlProvider(),
    new SnapshotProvider(snapshot, process.env.TOP250_SNAPSHOT_URL ?? null),
  ],
  cache,
).getChart();
console.log(`chart: ${chart.films.length} films (source: ${chart.source}${chart.stale ? ", stale" : ""})`);

const texts = await Promise.all(paths.map((p) => readFile(p, "utf8")));
const entries = parseLetterboxdExports(texts);
console.log(`export: ${entries.length} watched entries`);

const report = matchWatched(entries, chart.films, { aliases });
console.log(`matched: ${report.matched.length} Top 250 films will be hidden`);
for (const m of report.matched) console.log(`  ✓ ${m.entry.name} → ${m.title} [${m.imdbId}] (${m.how})`);
if (report.ambiguous.length) {
  console.log(`ambiguous: ${report.ambiguous.length} entries need review (not excluded):`);
  for (const a of report.ambiguous) {
    console.log(`  ? ${a.entry.name} (${a.entry.year ?? "?"}) — ${a.reason} — candidates: ${a.candidates.map((c) => `${c.title} [${c.imdbId}]`).join(", ")}`);
  }
}

await new ExclusionsProvider(store, DEFAULT_STORAGE_KEY).put({
  excludedImdbIds: [...report.excludedIds],
  ambiguous: report.ambiguous.map((a) => ({
    name: a.entry.name, year: a.entry.year, reason: a.reason, candidates: a.candidates,
  })),
  updatedAt: new Date().toISOString(),
});
await Promise.all([cache.flush(), store.flush()]);
console.log(`saved exclusions to ${DATA_DIR}/store.json`);
