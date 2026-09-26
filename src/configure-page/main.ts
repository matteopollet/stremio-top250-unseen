/**
 * Browser-side logic for /configure. Bundled to public/configure.js.
 * The Letterboxd CSV export is parsed and matched entirely client-side —
 * only the resulting list of excluded IMDb ids is POSTed to the server.
 */
import { decodeConfig, encodeConfig, type AddonConfig } from "../core/config.js";
import { matchWatched, type MatchReport } from "../core/matcher.js";
import type { RankedFilm } from "../core/types.js";
import { parseLetterboxdExports } from "../core/watched/letterboxd-csv.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

interface ChartResponse {
  films: RankedFilm[];
  aliases?: Record<string, string>;
}

interface StoredExclusionsResponse {
  excludedImdbIds: string[];
  manualExclusions: string[];
}

interface State {
  cfg: AddonConfig;
  films: RankedFilm[];
  report: MatchReport | null;
  /** ids hidden by the CSV match — or the previously stored set when no CSV was given */
  csvExcluded: Set<string>;
}

let state: State | null = null;

/** "/{cfg}/configure" → raw cfg segment, null on a fresh install page. */
function urlCfgSegment(): string | null {
  const seg = location.pathname.split("/").filter(Boolean)[0];
  return seg && seg !== "configure" ? decodeURIComponent(seg) : null;
}

// Reconfigure flow: prefill the form from the URL config, flag update mode.
const urlSegment = urlCfgSegment();
const urlCfg = urlSegment ? decodeConfig(urlSegment) : null;
if (urlCfg) {
  if (urlCfg.letterboxdUsername) ($("username") as HTMLInputElement).value = urlCfg.letterboxdUsername;
  if (urlCfg.tmdbApiKey) ($("tmdbKey") as HTMLInputElement).value = urlCfg.tmdbApiKey;
  $("reconfig").style.display = "block";
}

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

    // previously stored exclusions (reconfigure flow) — preserved if no CSV
    let stored: StoredExclusionsResponse = { excludedImdbIds: [], manualExclusions: [] };
    if (urlSegment) {
      const res = await fetch(`/${encodeURIComponent(urlSegment)}/exclusions`);
      if (res.ok) stored = (await res.json()) as StoredExclusionsResponse;
    }

    const texts = await readFiles($("csvFiles") as HTMLInputElement);
    let report: MatchReport | null = null;
    let csvExcluded = new Set(stored.excludedImdbIds);
    if (texts.length) {
      const entries = parseLetterboxdExports(texts);
      report = matchWatched(entries, chart.films, { aliases: chart.aliases ?? {} });
      csvExcluded = new Set(report.excludedIds);
    }

    const cfg: AddonConfig = { storageKey: urlCfg?.storageKey ?? crypto.randomUUID() };
    const username = ($("username") as HTMLInputElement).value.trim();
    const tmdbKey = ($("tmdbKey") as HTMLInputElement).value.trim();
    if (username) cfg.letterboxdUsername = username;
    if (tmdbKey) cfg.tmdbApiKey = tmdbKey;

    state = { cfg, films: chart.films, report, csvExcluded };
    renderReport(report, stored);
    renderSeenList(new Set(stored.manualExclusions));
    ($("results") as HTMLElement).style.display = "block";
  } catch (e) {
    alert((e as Error).message);
  } finally {
    btn.disabled = false;
  }
});

function renderReport(report: MatchReport | null, stored: StoredExclusionsResponse): void {
  if (!report) {
    $("summary").innerHTML = `No CSV files selected — keeping the <strong>${stored.excludedImdbIds.length} previously excluded</strong> films.`;
    $("ambiguous").innerHTML = "";
    return;
  }
  $("summary").innerHTML =
    `<strong>${report.matched.length} entries matched a Top 250 film</strong> and will be hidden.`;

  const box = $("ambiguous");
  if (!report.ambiguous.length) {
    box.innerHTML = `<p class="muted">No ambiguous entries.</p>`;
    return;
  }
  const rows = report.ambiguous
    .map((a, i) => {
      const cands = a.candidates
        .map((c) => `<label style="font-weight:400"><input type="checkbox" data-amb data-imdb="${c.imdbId}"> ${esc(c.title)} <span class="muted">(${(c.score * 100).toFixed(0)}%)</span></label>`)
        .join(" ");
      return `<tr><td>${esc(a.entry.name)}${a.entry.year ? ` (${a.entry.year})` : ""}<br><span class="muted">${a.reason}</span></td><td>${cands}</td></tr>`;
    })
    .join("");
  box.innerHTML =
    `<p class="muted">These look like Top 250 films but didn't match confidently — tick any that should count as seen:</p>` +
    `<table>${rows}</table>`;
}

function renderSeenList(manual: Set<string>): void {
  if (!state) return;
  const visible = state.films.filter((f) => !state!.csvExcluded.has(f.imdbId));
  $("seenList").innerHTML = visible
    .map(
      (f) =>
        `<label class="seenRow"><input type="checkbox" data-manual="${f.imdbId}"${manual.has(f.imdbId) ? " checked" : ""}>` +
        `<span class="r">#${f.rank}</span>${esc(f.title)}${f.year ? ` (${f.year})` : ""}</label>`,
    )
    .join("");
}

$("seenFilter").addEventListener("input", () => {
  const q = ($("seenFilter") as HTMLInputElement).value.trim().toLowerCase();
  for (const row of Array.from(document.querySelectorAll<HTMLElement>("#seenList .seenRow"))) {
    row.style.display = !q || row.textContent!.toLowerCase().includes(q) ? "" : "none";
  }
});

$("confirm").addEventListener("click", async () => {
  if (!state) return;
  const { cfg, report, csvExcluded } = state;

  // user-validated ambiguous candidates become exclusions too
  const extraIds = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-amb]:checked")).map(
    (el) => el.dataset.imdb!,
  );
  const manualExclusions = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-manual]:checked")).map(
    (el) => el.dataset.manual!,
  );
  const excludedImdbIds = [...new Set([...csvExcluded, ...extraIds])];

  const res = await fetch(`/exclusions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storageKey: cfg.storageKey,
      excludedImdbIds,
      manualExclusions,
      ambiguous: (report?.ambiguous ?? []).map((a) => ({
        name: a.entry.name, year: a.entry.year, reason: a.reason, candidates: a.candidates,
      })),
    }),
  });
  if (!res.ok) {
    alert(`failed to save exclusions (${res.status})`);
    return;
  }

  const encoded = encodeConfig(cfg);
  const manifestUrl = `${location.origin}/${encoded}/manifest.json`;
  ($("manifestUrl") as HTMLElement).textContent = manifestUrl;
  ($("stremioLink") as HTMLAnchorElement).href = `stremio://${location.host}${location.pathname.replace(/\/configure.*$/, "")}/${encoded}/manifest.json`;
  ($("configureLink") as HTMLAnchorElement).href = `${location.origin}/${encoded}/configure`;
  ($("install") as HTMLElement).style.display = "block";
});
