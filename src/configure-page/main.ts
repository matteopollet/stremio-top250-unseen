/**
 * Browser-side logic for /configure. Bundled to public/configure.js.
 * The Letterboxd CSV export is parsed and matched entirely client-side —
 * only the resulting list of excluded IMDb ids is POSTed to the server.
 */
import { encodeConfig, type AddonConfig } from "../core/config.js";
import { matchWatched, type MatchReport } from "../core/matcher.js";
import type { RankedFilm } from "../core/types.js";
import { parseLetterboxdExports } from "../core/watched/letterboxd-csv.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

interface ChartResponse {
  films: RankedFilm[];
  aliases?: Record<string, string>;
}

let pending: { report: MatchReport; cfg: AddonConfig } | null = null;

async function readFiles(input: HTMLInputElement): Promise<string[]> {
  const out: string[] = [];
  for (const f of Array.from(input.files ?? [])) out.push(await f.text());
  return out;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

$("go").addEventListener("click", async () => {
  const btn = $("go") as HTMLButtonElement;
  btn.disabled = true;
  try {
    const chartRes = await fetch("/chart.json");
    if (!chartRes.ok) throw new Error(`chart fetch failed (${chartRes.status})`);
    const chart = (await chartRes.json()) as ChartResponse;

    const texts = await readFiles($("csvFiles") as HTMLInputElement);
    const entries = parseLetterboxdExports(texts);
    const report = matchWatched(entries, chart.films, { aliases: chart.aliases ?? {} });

    const cfg: AddonConfig = { storageKey: crypto.randomUUID() };
    const username = ($("username") as HTMLInputElement).value.trim();
    const tmdbKey = ($("tmdbKey") as HTMLInputElement).value.trim();
    if (username) cfg.letterboxdUsername = username;
    if (tmdbKey) cfg.tmdbApiKey = tmdbKey;

    pending = { report, cfg };
    renderReport(report, entries.length);
    ($("results") as HTMLElement).style.display = "block";
  } catch (e) {
    alert((e as Error).message);
  } finally {
    btn.disabled = false;
  }
});

function renderReport(report: MatchReport, totalEntries: number): void {
  $("summary").innerHTML =
    `${totalEntries} watched entries in your export — ` +
    `<strong>${report.matched.length} matched a Top 250 film</strong> and will be hidden.`;

  const box = $("ambiguous");
  if (!report.ambiguous.length) {
    box.innerHTML = `<p class="muted">No ambiguous entries.</p>`;
    return;
  }
  const rows = report.ambiguous
    .map((a, i) => {
      const cands = a.candidates
        .map((c, j) => `<label style="font-weight:400"><input type="checkbox" data-amb="${i}" data-imdb="${c.imdbId}"> ${esc(c.title)} <span class="muted">(${(c.score * 100).toFixed(0)}%)</span></label>`)
        .join(" ");
      return `<tr><td>${esc(a.entry.name)}${a.entry.year ? ` (${a.entry.year})` : ""}<br><span class="muted">${a.reason}</span></td><td>${cands}</td></tr>`;
    })
    .join("");
  box.innerHTML =
    `<p class="muted">These look like Top 250 films but didn't match confidently — tick any that should count as seen:</p>` +
    `<table>${rows}</table>`;
}

$("confirm").addEventListener("click", async () => {
  if (!pending) return;
  const { report, cfg } = pending;

  // user-validated ambiguous candidates become exclusions too
  const extraIds = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-amb]:checked")).map(
    (el) => el.dataset.imdb!,
  );
  const excludedImdbIds = [...new Set([...report.excludedIds, ...extraIds])];

  const res = await fetch(`/exclusions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storageKey: cfg.storageKey,
      excludedImdbIds,
      ambiguous: report.ambiguous.map((a) => ({
        name: a.entry.name, year: a.entry.year, reason: a.reason, candidates: a.candidates,
      })),
    }),
  });
  if (!res.ok) {
    alert(`failed to save exclusions (${res.status})`);
    return;
  }

  const manifestUrl = `${location.origin}/${encodeConfig(cfg)}/manifest.json`;
  ($("manifestUrl") as HTMLElement).textContent = manifestUrl;
  ($("stremioLink") as HTMLAnchorElement).href = `stremio://${location.host}${location.pathname.replace(/\/configure.*$/, "")}/${encodeConfig(cfg)}/manifest.json`;
  ($("install") as HTMLElement).style.display = "block";
});
