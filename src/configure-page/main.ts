/**
 * Browser-side logic for /configure. Bundled to public/configure.js.
 * The Letterboxd CSV export is parsed and matched entirely client-side —
 * only the resulting list of excluded IMDb ids is POSTed to the server.
 */
import { decodeConfig, encodeConfig, type AddonConfig } from "../core/config.js";
import { matchWatched, type MatchReport } from "../core/matcher.js";
import type { RankedFilm } from "../core/types.js";
import { parseLetterboxdCsv, parseLetterboxdExports } from "../core/watched/letterboxd-csv.js";

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
const filmById = new Map<string, RankedFilm>();

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
  $("reconfig").hidden = false;
}

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function showNotice(msg: string): void {
  const n = $("notice");
  n.textContent = msg;
  n.hidden = false;
  n.scrollIntoView({ block: "nearest" });
}

function hideNotice(): void {
  $("notice").hidden = true;
}

/* ---------- plates ---------- */

function setOpen(plate: HTMLElement, open: boolean): void {
  plate.classList.toggle("open", open);
  const body = plate.querySelector<HTMLElement>(".plate-body");
  if (body) body.hidden = !open;
  plate.querySelector(".plate-head")?.setAttribute("aria-expanded", String(open));
}

for (const head of Array.from(document.querySelectorAll<HTMLElement>(".plate-head"))) {
  head.addEventListener("click", () => {
    const plate = head.closest(".plate") as HTMLElement;
    setOpen(plate, !plate.classList.contains("open"));
  });
}

/* ---------- rail ---------- */

const TICK_MARKS = [1, 50, 100, 150, 200, 250];
const railView = $("railView");
let railTrack = $("railTrack");
let scanEl = $("scan");
/** imdbId → rail line element; populated once the chart arrives */
const lineById = new Map<string, HTMLElement>();
let lineCount = 250;

function buildRail(n: number): void {
  let html = '<div class="scan" id="scan"></div>';
  for (let i = 0; i < n; i++) {
    html += `<i class="ln" style="left:${(((i + 0.5) / n) * 100).toFixed(3)}%"></i>`;
  }
  for (const t of TICK_MARKS) {
    if (t > n) continue;
    const p = (((t - 0.5) / n) * 100).toFixed(3);
    const cls = t === 1 ? " first" : t === n ? " last" : "";
    html += `<i class="tk" style="left:${p}%"></i><span class="tl${cls}" style="left:${p}%">${t}</span>`;
  }
  railTrack.innerHTML = html;
  scanEl = $("scan");
}

buildRail(lineCount);

/** effective exclusion set = csv/stored + ruled contested + manually struck */
const ambChecked = new Set<string>();
const manualChecked = new Set<string>();
const contestedIds = new Set<string>();
let nextId: string | null = null;

function excludedNow(): Set<string> {
  const s = new Set(state?.csvExcluded ?? []);
  for (const id of ambChecked) s.add(id);
  for (const id of manualChecked) s.add(id);
  return s;
}

function paintLine(id: string): void {
  const el = lineById.get(id);
  if (!el) return;
  el.classList.remove("out", "contested", "manual", "next");
  if (excludedNow().has(id)) {
    el.classList.add("out");
    if (manualChecked.has(id)) el.classList.add("manual");
  } else if (contestedIds.has(id)) {
    el.classList.add("contested");
  }
  if (id === nextId) el.classList.add("next");
}

function repaintAll(): void {
  for (const id of lineById.keys()) paintLine(id);
}

function updateCounts(): void {
  const ex = excludedNow().size;
  const live = lineCount - ex;
  const unruled = state?.report?.ambiguous.filter(
    (a) => !a.candidates.some((c) => ambChecked.has(c.imdbId)),
  ).length ?? 0;
  ($("ctLive") as HTMLElement).textContent = String(live);
  ($("ctStruck") as HTMLElement).textContent = String(ex);
  ($("ctContest") as HTMLElement).textContent = String(unruled);
  ($("railStatus") as HTMLElement).textContent =
    `${ex} of ${lineCount} struck, ${unruled} contested, ${live} remain.`;
  ($("tally") as HTMLElement).innerHTML = `<b>${ex}</b> of ${lineCount} struck · <b>${live}</b> remain`;
}

/** Scan sweep: the line travels the rail; struck films collapse as it passes. */
async function runScan(): Promise<void> {
  if (REDUCED) {
    repaintAll();
    return;
  }
  const w = railTrack.scrollWidth;
  scanEl.style.transition = "none";
  scanEl.style.transform = "translateX(0)";
  scanEl.classList.add("on");
  void scanEl.offsetWidth;
  scanEl.style.transition = "transform 1.15s cubic-bezier(.16,.84,.24,1)";
  scanEl.style.transform = `translateX(${w}px)`;

  const n = state?.films.length ?? lineCount;
  for (const id of excludedNow()) {
    const f = state?.films.find((x) => x.imdbId === id);
    if (!f) continue;
    const el = lineById.get(id);
    if (el) el.style.transitionDelay = `${((f.rank - 1) / n) * 900}ms`;
  }
  repaintAll();
  await new Promise((r) => setTimeout(r, 1350));
  scanEl.classList.remove("on");
  for (const el of lineById.values()) el.style.transitionDelay = "";
}

/* ---------- data ---------- */

let chartPromise: Promise<ChartResponse> | null = null;
function getChart(): Promise<ChartResponse> {
  if (!chartPromise) {
    chartPromise = fetch("/chart.json").then((r) => {
      if (!r.ok) throw new Error(`chart fetch failed (${r.status})`);
      return r.json() as Promise<ChartResponse>;
    });
    chartPromise.catch(() => {
      chartPromise = null;
    });
  }
  return chartPromise;
}

// Warm the chart at load so rail lines bind to real films (and reconfigure
// state can pre-collapse); failures surface on RUN instead.
let storedAtLoad: StoredExclusionsResponse | null = null;
getChart()
  .then((chart) => {
    lineCount = chart.films.length;
    for (const f of chart.films) filmById.set(f.imdbId, f);
    buildRail(lineCount);
    chart.films.forEach((f, i) => {
      const el = railTrack.querySelectorAll<HTMLElement>(".ln")[f.rank - 1] ?? railTrack.querySelectorAll<HTMLElement>(".ln")[i];
      if (el) lineById.set(f.imdbId, el);
    });
    updateCounts();
    if (urlSegment) {
      fetch(`/${encodeURIComponent(urlSegment)}/exclusions`)
        .then((r) => (r.ok ? (r.json() as Promise<StoredExclusionsResponse>) : null))
        .then((stored) => {
          if (!stored) return;
          storedAtLoad = stored;
          state = { cfg: urlCfg ?? { storageKey: "" }, films: chart.films, report: null, csvExcluded: new Set(stored.excludedImdbIds) };
          for (const id of stored.manualExclusions) manualChecked.add(id);
          repaintAll();
          updateCounts();
          const total = stored.excludedImdbIds.length + stored.manualExclusions.length;
          $("reconfig").innerHTML =
            `This addon is already configured — <strong>${total} films currently struck.</strong> ` +
            `Update the strike list and confirm to keep the same install URL.`;
        })
        .catch(() => undefined);
    }
  })
  .catch(() => undefined);

/**
 * Only these export files are a "seen" signal. watchlist.csv shares the exact
 * same header shape (Date,Name,Year,Letterboxd URI) but lists films the user
 * has NOT seen — dropping a whole export folder must never mark them watched.
 * Suffixes tolerated: "watched (1).csv" style download renames.
 */
const WATCHED_FILE = /^(watched|ratings|diary|reviews)([\s_\-([].*)?\.csv$/i;

function watchedCsvFiles(input: HTMLInputElement): File[] {
  return Array.from(input.files ?? []).filter((f) => WATCHED_FILE.test(f.name));
}

async function readFiles(input: HTMLInputElement): Promise<string[]> {
  const out: string[] = [];
  for (const f of watchedCsvFiles(input)) out.push(await f.text());
  return out;
}

/* ---------- import plate ---------- */

const csvInput = $("csvFiles") as HTMLInputElement;
const drop = $("drop");

csvInput.addEventListener("change", renderFileStubs);
drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.classList.add("over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  if (e.dataTransfer?.files?.length) {
    csvInput.files = e.dataTransfer.files;
    renderFileStubs();
  }
});

async function renderFileStubs(): Promise<void> {
  const files = Array.from(csvInput.files ?? []);
  const box = $("fileStubs");
  if (!files.length) {
    box.innerHTML = "";
    $("importResidue").textContent = "";
    return;
  }
  const texts = await Promise.all(files.map((f) => f.text()));
  const usedTexts: string[] = [];
  const stubs = files.map((f, i) => {
    if (!WATCHED_FILE.test(f.name)) {
      return `<span class="fstub bad">${esc(f.name)}<span class="n">skipped — not a watched-data file</span></span>`;
    }
    usedTexts.push(texts[i]!);
    const n = parseLetterboxdCsv(texts[i] ?? "").length;
    return n > 0
      ? `<span class="fstub">${esc(f.name)}<span class="n">${n} entries</span></span>`
      : `<span class="fstub bad">${esc(f.name)}<span class="n">unrecognized</span></span>`;
  });
  box.innerHTML = stubs.join("");
  const total = parseLetterboxdExports(usedTexts).length;
  $("importResidue").textContent = `${usedTexts.length} of ${files.length} file${files.length > 1 ? "s" : ""} · ${total} entries`;
}

/* ---------- match ---------- */

const REASON_LABELS: Record<string, string> = {
  "title-similar-but-year-mismatch": "same title — different year",
  "title-contained-but-year-mismatch": "title fits — different year",
  "weak-title-similarity": "similar title only",
};

$("go").addEventListener("click", async () => {
  const btn = $("go") as HTMLButtonElement;
  const stage = $("stage");
  btn.disabled = true;
  hideNotice();
  stage.textContent = "Fetching chart…";
  try {
    const chart = await getChart();
    stage.textContent = "Reading exports…";

    // previously stored exclusions (reconfigure flow) — preserved if no CSV
    let stored: StoredExclusionsResponse = storedAtLoad ?? { excludedImdbIds: [], manualExclusions: [] };
    if (urlSegment && !storedAtLoad) {
      const res = await fetch(`/${encodeURIComponent(urlSegment)}/exclusions`);
      if (res.ok) stored = (await res.json()) as StoredExclusionsResponse;
    }

    const texts = await readFiles(csvInput);
    let report: MatchReport | null = null;
    let csvExcluded = new Set(stored.excludedImdbIds);
    if (texts.length) {
      stage.textContent = "Matching…";
      const entries = parseLetterboxdExports(texts);
      report = matchWatched(entries, chart.films, { aliases: chart.aliases ?? {} });
      csvExcluded = new Set(report.excludedIds);
    }

    // spread urlCfg so hand-set fields (catalogName, overrides) survive a reconfigure
    const cfg: AddonConfig = { ...urlCfg, storageKey: urlCfg?.storageKey ?? crypto.randomUUID() };
    const username = ($("username") as HTMLInputElement).value.trim();
    const tmdbKey = ($("tmdbKey") as HTMLInputElement).value.trim();
    if (username) cfg.letterboxdUsername = username;
    if (tmdbKey) cfg.tmdbApiKey = tmdbKey;

    ambChecked.clear();
    manualChecked.clear();
    contestedIds.clear();
    nextId = null;
    for (const id of stored.manualExclusions) manualChecked.add(id);
    for (const a of report?.ambiguous ?? []) for (const c of a.candidates) contestedIds.add(c.imdbId);

    state = { cfg, films: chart.films, report, csvExcluded };

    if (texts.length) {
      await runScan();
    } else {
      repaintAll();
    }

    renderReport(report, stored);
    renderSeenList(manualChecked);
    updateCounts();

    const r = report;
    $("matchResidue").textContent = texts.length
      ? `${r!.matched.length} struck · ${r!.ambiguous.length} contested`
      : "kept stored set";
    $("optionsResidue").textContent = username ? `@${username}` : "";
    setOpen($("plateImport"), false);
    setOpen($("plateOptions"), false);
    setOpen($("plateMatch"), false);
    const review = $("results");
    review.hidden = false;
    setOpen(review, true);
    stage.textContent = "";
    review.scrollIntoView({ block: "start", behavior: REDUCED ? "auto" : "smooth" });
  } catch (e) {
    stage.textContent = "";
    showNotice(`${(e as Error).message} — check the server and run again.`);
  } finally {
    btn.disabled = false;
  }
});

function renderReport(report: MatchReport | null, stored: StoredExclusionsResponse): void {
  if (!report) {
    const kept = stored.excludedImdbIds.length;
    $("summary").innerHTML = kept
      ? `No CSV files selected — keeping the <strong>${kept} previously struck</strong> films.`
      : `No CSV files selected — the rail is unchanged.`;
    $("countline").innerHTML = "";
    $("ambiguous").innerHTML = "";
    $("reviewResidue").textContent = `${kept} struck`;
    return;
  }
  $("summary").textContent =
    `${report.matched.length} of your entries are Top 250 films — their lines collapsed.`;
  const live = lineCount - excludedNow().size;
  $("countline").innerHTML =
    `<span class="c"><b>${report.matched.length}</b><span class="k">struck</span></span>` +
    `<span class="c contest"><b>${report.ambiguous.length}</b><span class="k">contested</span></span>` +
    `<span class="c"><b>${report.ignoredCount}</b><span class="k">not on the chart</span></span>` +
    `<span class="c"><b>${live}</b><span class="k">remain</span></span>`;
  $("reviewResidue").textContent = `${excludedNow().size} struck`;

  const box = $("ambiguous");
  if (!report.ambiguous.length) {
    box.innerHTML = "";
    return;
  }
  const rows = report.ambiguous
    .map((a) => {
      const cands = a.candidates
        .map((c) => {
          const yr = filmById.get(c.imdbId)?.year;
          return (
            `<label class="cand" title="match confidence ${(c.score * 100).toFixed(0)}%">` +
            `<input type="checkbox" class="sr x" data-amb data-imdb="${c.imdbId}">` +
            `<span class="mk"></span><span class="ct">${esc(c.title)}</span>` +
            `${yr ? `<span class="cy">${yr}</span>` : ""}</label>`
          );
        })
        .join("");
      return (
        `<div class="ctrow"><div class="entry">` +
        `<span class="n">${esc(a.entry.name)}<span class="y">${a.entry.year ? ` ${a.entry.year}` : ""}</span></span>` +
        `<span class="rs">${REASON_LABELS[a.reason] ?? a.reason}</span></div>` +
        `<div class="cands">${cands}</div></div>`
      );
    })
    .join("");
  box.innerHTML =
    `<h3 class="subhead">Needs your ruling<span class="dim">— strike each film that counts as seen</span></h3>` +
    rows;
}

function renderSeenList(manual: Set<string>): void {
  if (!state) return;
  const visible = state.films.filter((f) => !state!.csvExcluded.has(f.imdbId));
  $("seenList").innerHTML = visible
    .map(
      (f) =>
        `<label class="seenrow${manual.has(f.imdbId) ? " struck" : ""}" data-line="${f.imdbId}">` +
        `<input type="checkbox" class="sr" data-manual="${f.imdbId}"${manual.has(f.imdbId) ? " checked" : ""}>` +
        `<span class="mk"></span><span class="rk">#${f.rank}</span>` +
        `<span><span class="tt">${esc(f.title)}</span><span class="yr">${f.year ? ` ${f.year}` : ""}</span></span></label>`,
    )
    .join("");
}

$("seenFilter").addEventListener("input", () => {
  const q = ($("seenFilter") as HTMLInputElement).value.trim().toLowerCase();
  for (const row of Array.from(document.querySelectorAll<HTMLElement>("#seenList .seenrow"))) {
    row.style.display = !q || row.textContent!.toLowerCase().includes(q) ? "" : "none";
  }
});

// strike/restore lines as checkboxes move, and brighten a line while its row is hovered
document.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement;
  const amb = el.dataset?.amb !== undefined;
  const man = el.dataset?.manual !== undefined;
  if (!amb && !man) return;
  const id = (el.dataset.imdb || el.dataset.manual)!;
  if (amb) {
    if (el.checked) ambChecked.add(id);
    else ambChecked.delete(id);
  }
  if (man) {
    if (el.checked) manualChecked.add(id);
    else manualChecked.delete(id);
    el.closest(".seenrow")?.classList.toggle("struck", el.checked);
  }
  paintLine(id);
  updateCounts();
  $("reviewResidue").textContent = `${excludedNow().size} struck`;
});

document.addEventListener("mouseover", (e) => {
  const row = (e.target as HTMLElement).closest?.(".seenrow") as HTMLElement | null;
  const id = row?.dataset.line;
  for (const el of Array.from(document.querySelectorAll(".ln.focus"))) el.classList.remove("focus");
  if (id) lineById.get(id)?.classList.add("focus");
});
document.addEventListener("focusin", (e) => {
  const row = (e.target as HTMLElement).closest?.(".seenrow") as HTMLElement | null;
  if (row?.dataset.line) lineById.get(row.dataset.line)?.classList.add("focus");
});
document.addEventListener("focusout", () => {
  for (const el of Array.from(document.querySelectorAll(".ln.focus"))) el.classList.remove("focus");
});

/* ---------- confirm & install ---------- */

$("confirm").addEventListener("click", async () => {
  if (!state) return;
  const { cfg, report, csvExcluded } = state;
  const stage2 = $("stage2");
  hideNotice();

  // user-validated ambiguous candidates become exclusions too
  const extraIds = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-amb]:checked")).map(
    (el) => el.dataset.imdb!,
  );
  const manualExclusions = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-manual]:checked")).map(
    (el) => el.dataset.manual!,
  );
  const excludedImdbIds = [...new Set([...csvExcluded, ...extraIds])];

  stage2.textContent = "Saving…";
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
  stage2.textContent = "";
  if (!res.ok) {
    showNotice(`Failed to save exclusions (${res.status}) — nothing was written. Confirm again to retry.`);
    return;
  }

  const encoded = encodeConfig(cfg);
  const manifestUrl = `${location.origin}/${encoded}/manifest.json`;
  ($("manifestUrl") as HTMLElement).textContent = manifestUrl;
  ($("stremioLink") as HTMLAnchorElement).href = `stremio://${location.host}/${encoded}/manifest.json`;
  ($("configureLink") as HTMLAnchorElement).href = `${location.origin}/${encoded}/configure`;

  // contested lines left unruled return to live; the next film outranks all
  const excluded = excludedNow();
  const next = state.films.find((f) => !excluded.has(f.imdbId)) ?? null;
  nextId = next?.imdbId ?? null;
  repaintAll();
  updateCounts();

  const remain = lineCount - excluded.size;
  $("survive").innerHTML = `Your catalog is ready — <b>${remain} film${remain === 1 ? "" : "s"}</b> remain on the rail.`;
  const nl = $("nextline");
  if (next) {
    nl.hidden = false;
    $("nlR").textContent = `#${next.rank}`;
    $("nlT").textContent = next.title;
    $("nlY").textContent = next.year ? `${next.year}` : "";
  } else {
    nl.hidden = true;
  }
  $("installResidue").textContent = `${remain} remain`;
  $("reviewResidue").textContent = `${excluded.size} struck`;

  const install = $("install");
  install.hidden = false;
  setOpen(install, true);
  install.scrollIntoView({ block: "start", behavior: REDUCED ? "auto" : "smooth" });
  const nextEl = nextId ? lineById.get(nextId) : null;
  if (nextEl) {
    railView.scrollTo({ left: nextEl.offsetLeft - railView.clientWidth / 2, behavior: REDUCED ? "auto" : "smooth" });
  }
});

$("copyBtn").addEventListener("click", async () => {
  const btn = $("copyBtn");
  try {
    await navigator.clipboard.writeText(($("manifestUrl") as HTMLElement).textContent ?? "");
    btn.textContent = "Copied";
  } catch {
    btn.textContent = "Select & copy";
  }
  setTimeout(() => {
    btn.textContent = "Copy";
  }, 1600);
});
