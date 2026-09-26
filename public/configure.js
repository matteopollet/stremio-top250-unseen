"use strict";
(() => {
  // src/core/config.ts
  function b64urlEncode(s) {
    const bytes = new TextEncoder().encode(s);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlDecode(s) {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  function encodeConfig(cfg) {
    return b64urlEncode(JSON.stringify(cfg));
  }
  var IMDB_ID = /^tt\d{4,10}$/;
  var STRING_FIELDS = ["letterboxdUsername", "tmdbApiKey", "storageKey", "catalogName"];
  function decodeConfig(raw) {
    try {
      const obj = JSON.parse(b64urlDecode(raw));
      if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return null;
      const o = obj;
      const cfg = {};
      for (const k of STRING_FIELDS) {
        const v = o[k];
        if (v === void 0) continue;
        if (typeof v !== "string") return null;
        cfg[k] = v;
      }
      if (o.overrides !== void 0) {
        const ov = o.overrides;
        if (typeof ov !== "object" || ov === null || Array.isArray(ov)) return null;
        const overrides = {};
        for (const k of ["forceInclude", "forceExclude"]) {
          const v = ov[k];
          if (v === void 0) continue;
          if (!Array.isArray(v) || !v.every((id) => typeof id === "string" && IMDB_ID.test(id))) return null;
          overrides[k] = v;
        }
        cfg.overrides = overrides;
      }
      return cfg;
    } catch {
      return null;
    }
  }

  // src/core/matcher.ts
  var ARTICLES = /* @__PURE__ */ new Set(["the", "a", "an", "le", "la", "les", "l", "un", "une", "des", "il", "lo", "i", "gli", "el", "los", "las", "der", "die", "das", "den"]);
  function normalizeTitle(s) {
    return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((t, i, arr) => !(i === 0 && ARTICLES.has(t)) && t !== "").join(" ");
  }
  function dice(a, b) {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
    const bigrams = /* @__PURE__ */ new Map();
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
    return 2 * overlap / (a.length - 1 + b.length - 1);
  }
  function contains(a, b) {
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
  var EXACT_SCORE = 0.98;
  var STRONG_SCORE = 0.86;
  var REPORT_FLOOR = 0.45;
  function yearsCompatible(entryYear, filmYear, tolerance) {
    if (entryYear === null || filmYear === null) return tolerance === Infinity;
    return Math.abs(entryYear - filmYear) <= tolerance;
  }
  function scoreAgainst(entry, film) {
    const n = normalizeTitle(entry.name);
    let best = { film, score: 0, exact: false, containment: false };
    for (const t of [film.title, film.originalTitle].filter((x) => x !== null)) {
      const nt = normalizeTitle(t);
      const exact = nt === n;
      const cont = !exact && contains(n, nt);
      const score = exact ? 1 : cont ? Math.max(EXACT_SCORE, dice(n, nt)) : dice(n, nt);
      if (score > best.score) best = { film, score, exact, containment: cont };
    }
    return best;
  }
  function matchWatched(entries, chart, opts = {}) {
    const chartById = new Map(chart.map((f) => [f.imdbId, f]));
    const aliases = opts.aliases ?? {};
    const report = { excludedIds: /* @__PURE__ */ new Set(), matched: [], ambiguous: [], ignoredCount: 0 };
    for (const entry of entries) {
      const norm = normalizeTitle(entry.name);
      const aliasHit = aliases[`${norm}|${entry.year ?? "*"}`] ?? aliases[`${norm}|*`];
      if (aliasHit && chartById.has(aliasHit)) {
        const film = chartById.get(aliasHit);
        report.excludedIds.add(aliasHit);
        report.matched.push({ entry, imdbId: aliasHit, title: film.title, how: "alias", score: 1 });
        continue;
      }
      let best = null;
      let second = null;
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
      if (best.exact && yearsCompatible(entry.year, best.film.year, 0)) {
        report.excludedIds.add(best.film.imdbId);
        report.matched.push({ entry, imdbId: best.film.imdbId, title: best.film.title, how: "exact-title", score: 1 });
        continue;
      }
      if ((best.exact || best.containment) && yearsCompatible(entry.year, best.film.year, 1)) {
        report.excludedIds.add(best.film.imdbId);
        report.matched.push({ entry, imdbId: best.film.imdbId, title: best.film.title, how: "strong-title", score: best.score });
        continue;
      }
      if (best.score >= STRONG_SCORE && yearsCompatible(entry.year, best.film.year, 0) && (!second || best.score - second.score >= 0.1)) {
        report.excludedIds.add(best.film.imdbId);
        report.matched.push({ entry, imdbId: best.film.imdbId, title: best.film.title, how: "strong-title", score: best.score });
        continue;
      }
      if (best.score >= REPORT_FLOOR) {
        const candidates = chart.map((f) => scoreAgainst(entry, f)).filter((c) => c.score >= REPORT_FLOOR).sort((a, b) => b.score - a.score).slice(0, 3).map((c) => ({ imdbId: c.film.imdbId, title: c.film.title, score: Math.round(c.score * 100) / 100 }));
        report.ambiguous.push({
          entry,
          reason: ambiguityReason(best, entry),
          candidates
        });
      } else {
        report.ignoredCount++;
      }
    }
    return report;
  }
  function ambiguityReason(best, entry) {
    if (best.score >= STRONG_SCORE) return "title-similar-but-year-mismatch";
    if (best.containment) return "title-contained-but-year-mismatch";
    return "weak-title-similarity";
  }

  // src/core/watched/letterboxd-csv.ts
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    let i = 0;
    if (text.charCodeAt(0) === 65279) i = 1;
    for (; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
        continue;
      }
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else {
        field += c;
      }
    }
    if (field !== "" || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }
  var NAME_COL = "name";
  var YEAR_COL = "year";
  var URI_COL = "letterboxd uri";
  function parseLetterboxdCsv(text) {
    const rows = parseCsv(text);
    if (rows.length < 2) return [];
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const nameIdx = header.indexOf(NAME_COL);
    const yearIdx = header.indexOf(YEAR_COL);
    const uriIdx = header.indexOf(URI_COL);
    if (nameIdx === -1) return [];
    const entries = [];
    for (const row of rows.slice(1)) {
      const name = row[nameIdx]?.trim();
      if (!name) continue;
      const yearRaw = yearIdx >= 0 ? row[yearIdx]?.trim() : void 0;
      const year = yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;
      const uri = uriIdx >= 0 ? row[uriIdx]?.trim() ?? null : null;
      entries.push({ name, year, letterboxdUri: uri || null });
    }
    return entries;
  }
  function parseLetterboxdExports(texts) {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const text of texts) {
      for (const e of parseLetterboxdCsv(text)) {
        const key = `${e.name.toLowerCase()}|${e.year ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(e);
      }
    }
    return out;
  }

  // src/configure-page/main.ts
  var $ = (id) => document.getElementById(id);
  var state = null;
  var filmById = /* @__PURE__ */ new Map();
  function urlCfgSegment() {
    const seg = location.pathname.split("/").filter(Boolean)[0];
    return seg && seg !== "configure" ? decodeURIComponent(seg) : null;
  }
  var urlSegment = urlCfgSegment();
  var urlCfg = urlSegment ? decodeConfig(urlSegment) : null;
  if (urlCfg) {
    if (urlCfg.letterboxdUsername) $("username").value = urlCfg.letterboxdUsername;
    if (urlCfg.tmdbApiKey) $("tmdbKey").value = urlCfg.tmdbApiKey;
    $("reconfig").hidden = false;
  }
  var REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function esc(s) {
    return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }
  function showNotice(msg) {
    const n = $("notice");
    n.textContent = msg;
    n.hidden = false;
    n.scrollIntoView({ block: "nearest" });
  }
  function hideNotice() {
    $("notice").hidden = true;
  }
  function setOpen(plate, open) {
    plate.classList.toggle("open", open);
    const body = plate.querySelector(".plate-body");
    if (body) body.hidden = !open;
    plate.querySelector(".plate-head")?.setAttribute("aria-expanded", String(open));
  }
  for (const head of Array.from(document.querySelectorAll(".plate-head"))) {
    head.addEventListener("click", () => {
      const plate = head.closest(".plate");
      setOpen(plate, !plate.classList.contains("open"));
    });
  }
  var TICK_MARKS = [1, 50, 100, 150, 200, 250];
  var railView = $("railView");
  var railTrack = $("railTrack");
  var scanEl = $("scan");
  var lineById = /* @__PURE__ */ new Map();
  var lineCount = 250;
  function buildRail(n) {
    let html = '<div class="scan" id="scan"></div>';
    for (let i = 0; i < n; i++) {
      html += `<i class="ln" style="left:${((i + 0.5) / n * 100).toFixed(3)}%"></i>`;
    }
    for (const t of TICK_MARKS) {
      if (t > n) continue;
      const p = ((t - 0.5) / n * 100).toFixed(3);
      const cls = t === 1 ? " first" : t === n ? " last" : "";
      html += `<i class="tk" style="left:${p}%"></i><span class="tl${cls}" style="left:${p}%">${t}</span>`;
    }
    railTrack.innerHTML = html;
    scanEl = $("scan");
  }
  buildRail(lineCount);
  var ambChecked = /* @__PURE__ */ new Set();
  var manualChecked = /* @__PURE__ */ new Set();
  var contestedIds = /* @__PURE__ */ new Set();
  var nextId = null;
  function excludedNow() {
    const s = new Set(state?.csvExcluded ?? []);
    for (const id of ambChecked) s.add(id);
    for (const id of manualChecked) s.add(id);
    return s;
  }
  function paintLine(id) {
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
  function repaintAll() {
    for (const id of lineById.keys()) paintLine(id);
  }
  function updateCounts() {
    const ex = excludedNow().size;
    const live = lineCount - ex;
    const unruled = state?.report?.ambiguous.filter(
      (a) => !a.candidates.some((c) => ambChecked.has(c.imdbId))
    ).length ?? 0;
    $("ctLive").textContent = String(live);
    $("ctStruck").textContent = String(ex);
    $("ctContest").textContent = String(unruled);
    $("railStatus").textContent = `${ex} of ${lineCount} struck, ${unruled} contested, ${live} remain.`;
    $("tally").innerHTML = `<b>${ex}</b> of ${lineCount} struck \xB7 <b>${live}</b> remain`;
  }
  async function runScan() {
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
      if (el) el.style.transitionDelay = `${(f.rank - 1) / n * 900}ms`;
    }
    repaintAll();
    await new Promise((r) => setTimeout(r, 1350));
    scanEl.classList.remove("on");
    for (const el of lineById.values()) el.style.transitionDelay = "";
  }
  var chartPromise = null;
  function getChart() {
    if (!chartPromise) {
      chartPromise = fetch("/chart.json").then((r) => {
        if (!r.ok) throw new Error(`chart fetch failed (${r.status})`);
        return r.json();
      });
      chartPromise.catch(() => {
        chartPromise = null;
      });
    }
    return chartPromise;
  }
  var storedAtLoad = null;
  getChart().then((chart) => {
    lineCount = chart.films.length;
    for (const f of chart.films) filmById.set(f.imdbId, f);
    buildRail(lineCount);
    chart.films.forEach((f, i) => {
      const el = railTrack.querySelectorAll(".ln")[f.rank - 1] ?? railTrack.querySelectorAll(".ln")[i];
      if (el) lineById.set(f.imdbId, el);
    });
    updateCounts();
    if (urlSegment) {
      fetch(`/${encodeURIComponent(urlSegment)}/exclusions`).then((r) => r.ok ? r.json() : null).then((stored) => {
        if (!stored) return;
        storedAtLoad = stored;
        state = { cfg: urlCfg ?? { storageKey: "" }, films: chart.films, report: null, csvExcluded: new Set(stored.excludedImdbIds) };
        for (const id of stored.manualExclusions) manualChecked.add(id);
        repaintAll();
        updateCounts();
        const total = stored.excludedImdbIds.length + stored.manualExclusions.length;
        $("reconfig").innerHTML = `This addon is already configured \u2014 <strong>${total} films currently struck.</strong> Update the strike list and confirm to keep the same install URL.`;
      }).catch(() => void 0);
    }
  }).catch(() => void 0);
  var WATCHED_FILE = /^(watched|ratings|diary|reviews)([\s_\-([].*)?\.csv$/i;
  function watchedCsvFiles(input) {
    return Array.from(input.files ?? []).filter((f) => WATCHED_FILE.test(f.name));
  }
  async function readFiles(input) {
    const out = [];
    for (const f of watchedCsvFiles(input)) out.push(await f.text());
    return out;
  }
  var csvInput = $("csvFiles");
  var drop = $("drop");
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
  async function renderFileStubs() {
    const files = Array.from(csvInput.files ?? []);
    const box = $("fileStubs");
    if (!files.length) {
      box.innerHTML = "";
      $("importResidue").textContent = "";
      return;
    }
    const texts = await Promise.all(files.map((f) => f.text()));
    const usedTexts = [];
    const stubs = files.map((f, i) => {
      if (!WATCHED_FILE.test(f.name)) {
        return `<span class="fstub bad">${esc(f.name)}<span class="n">skipped \u2014 not a watched-data file</span></span>`;
      }
      usedTexts.push(texts[i]);
      const n = parseLetterboxdCsv(texts[i] ?? "").length;
      return n > 0 ? `<span class="fstub">${esc(f.name)}<span class="n">${n} entries</span></span>` : `<span class="fstub bad">${esc(f.name)}<span class="n">unrecognized</span></span>`;
    });
    box.innerHTML = stubs.join("");
    const total = parseLetterboxdExports(usedTexts).length;
    $("importResidue").textContent = `${usedTexts.length} of ${files.length} file${files.length > 1 ? "s" : ""} \xB7 ${total} entries`;
  }
  var REASON_LABELS = {
    "title-similar-but-year-mismatch": "same title \u2014 different year",
    "title-contained-but-year-mismatch": "title fits \u2014 different year",
    "weak-title-similarity": "similar title only"
  };
  $("go").addEventListener("click", async () => {
    const btn = $("go");
    const stage = $("stage");
    btn.disabled = true;
    hideNotice();
    stage.textContent = "Fetching chart\u2026";
    try {
      const chart = await getChart();
      stage.textContent = "Reading exports\u2026";
      let stored = storedAtLoad ?? { excludedImdbIds: [], manualExclusions: [] };
      if (urlSegment && !storedAtLoad) {
        const res = await fetch(`/${encodeURIComponent(urlSegment)}/exclusions`);
        if (res.ok) stored = await res.json();
      }
      const texts = await readFiles(csvInput);
      let report = null;
      let csvExcluded = new Set(stored.excludedImdbIds);
      if (texts.length) {
        stage.textContent = "Matching\u2026";
        const entries = parseLetterboxdExports(texts);
        report = matchWatched(entries, chart.films, { aliases: chart.aliases ?? {} });
        csvExcluded = new Set(report.excludedIds);
      }
      const cfg = { ...urlCfg, storageKey: urlCfg?.storageKey ?? crypto.randomUUID() };
      const username = $("username").value.trim();
      const tmdbKey = $("tmdbKey").value.trim();
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
      $("matchResidue").textContent = texts.length ? `${r.matched.length} struck \xB7 ${r.ambiguous.length} contested` : "kept stored set";
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
      showNotice(`${e.message} \u2014 check the server and run again.`);
    } finally {
      btn.disabled = false;
    }
  });
  function renderReport(report, stored) {
    if (!report) {
      const kept = stored.excludedImdbIds.length;
      $("summary").innerHTML = kept ? `No CSV files selected \u2014 keeping the <strong>${kept} previously struck</strong> films.` : `No CSV files selected \u2014 the rail is unchanged.`;
      $("countline").innerHTML = "";
      $("ambiguous").innerHTML = "";
      $("reviewResidue").textContent = `${kept} struck`;
      return;
    }
    $("summary").textContent = `${report.matched.length} of your entries are Top 250 films \u2014 their lines collapsed.`;
    const live = lineCount - excludedNow().size;
    $("countline").innerHTML = `<span class="c"><b>${report.matched.length}</b><span class="k">struck</span></span><span class="c contest"><b>${report.ambiguous.length}</b><span class="k">contested</span></span><span class="c"><b>${report.ignoredCount}</b><span class="k">not on the chart</span></span><span class="c"><b>${live}</b><span class="k">remain</span></span>`;
    $("reviewResidue").textContent = `${excludedNow().size} struck`;
    const box = $("ambiguous");
    if (!report.ambiguous.length) {
      box.innerHTML = "";
      return;
    }
    const rows = report.ambiguous.map((a) => {
      const cands = a.candidates.map((c) => {
        const yr = filmById.get(c.imdbId)?.year;
        return `<label class="cand" title="match confidence ${(c.score * 100).toFixed(0)}%"><input type="checkbox" class="sr x" data-amb data-imdb="${c.imdbId}"><span class="mk"></span><span class="ct">${esc(c.title)}</span>${yr ? `<span class="cy">${yr}</span>` : ""}</label>`;
      }).join("");
      return `<div class="ctrow"><div class="entry"><span class="n">${esc(a.entry.name)}<span class="y">${a.entry.year ? ` ${a.entry.year}` : ""}</span></span><span class="rs">${REASON_LABELS[a.reason] ?? a.reason}</span></div><div class="cands">${cands}</div></div>`;
    }).join("");
    box.innerHTML = `<h3 class="subhead">Needs your ruling<span class="dim">\u2014 strike each film that counts as seen</span></h3>` + rows;
  }
  function renderSeenList(manual) {
    if (!state) return;
    const visible = state.films.filter((f) => !state.csvExcluded.has(f.imdbId));
    $("seenList").innerHTML = visible.map(
      (f) => `<label class="seenrow${manual.has(f.imdbId) ? " struck" : ""}" data-line="${f.imdbId}"><input type="checkbox" class="sr" data-manual="${f.imdbId}"${manual.has(f.imdbId) ? " checked" : ""}><span class="mk"></span><span class="rk">#${f.rank}</span><span><span class="tt">${esc(f.title)}</span><span class="yr">${f.year ? ` ${f.year}` : ""}</span></span></label>`
    ).join("");
  }
  $("seenFilter").addEventListener("input", () => {
    const q = $("seenFilter").value.trim().toLowerCase();
    for (const row of Array.from(document.querySelectorAll("#seenList .seenrow"))) {
      row.style.display = !q || row.textContent.toLowerCase().includes(q) ? "" : "none";
    }
  });
  document.addEventListener("change", (e) => {
    const el = e.target;
    const amb = el.dataset?.amb !== void 0;
    const man = el.dataset?.manual !== void 0;
    if (!amb && !man) return;
    const id = el.dataset.imdb || el.dataset.manual;
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
    const row = e.target.closest?.(".seenrow");
    const id = row?.dataset.line;
    for (const el of Array.from(document.querySelectorAll(".ln.focus"))) el.classList.remove("focus");
    if (id) lineById.get(id)?.classList.add("focus");
  });
  document.addEventListener("focusin", (e) => {
    const row = e.target.closest?.(".seenrow");
    if (row?.dataset.line) lineById.get(row.dataset.line)?.classList.add("focus");
  });
  document.addEventListener("focusout", () => {
    for (const el of Array.from(document.querySelectorAll(".ln.focus"))) el.classList.remove("focus");
  });
  $("confirm").addEventListener("click", async () => {
    if (!state) return;
    const { cfg, report, csvExcluded } = state;
    const stage2 = $("stage2");
    hideNotice();
    const extraIds = Array.from(document.querySelectorAll("input[data-amb]:checked")).map(
      (el) => el.dataset.imdb
    );
    const manualExclusions = Array.from(document.querySelectorAll("input[data-manual]:checked")).map(
      (el) => el.dataset.manual
    );
    const excludedImdbIds = [.../* @__PURE__ */ new Set([...csvExcluded, ...extraIds])];
    stage2.textContent = "Saving\u2026";
    const res = await fetch(`/exclusions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storageKey: cfg.storageKey,
        excludedImdbIds,
        manualExclusions,
        ambiguous: (report?.ambiguous ?? []).map((a) => ({
          name: a.entry.name,
          year: a.entry.year,
          reason: a.reason,
          candidates: a.candidates
        }))
      })
    });
    stage2.textContent = "";
    if (!res.ok) {
      showNotice(`Failed to save exclusions (${res.status}) \u2014 nothing was written. Confirm again to retry.`);
      return;
    }
    const encoded = encodeConfig(cfg);
    const manifestUrl = `${location.origin}/${encoded}/manifest.json`;
    $("manifestUrl").textContent = manifestUrl;
    $("stremioLink").href = `stremio://${location.host}/${encoded}/manifest.json`;
    $("configureLink").href = `${location.origin}/${encoded}/configure`;
    const excluded = excludedNow();
    const next = state.films.find((f) => !excluded.has(f.imdbId)) ?? null;
    nextId = next?.imdbId ?? null;
    repaintAll();
    updateCounts();
    const remain = lineCount - excluded.size;
    $("survive").innerHTML = `Your catalog is ready \u2014 <b>${remain} film${remain === 1 ? "" : "s"}</b> remain on the rail.`;
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
      await navigator.clipboard.writeText($("manifestUrl").textContent ?? "");
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Select & copy";
    }
    setTimeout(() => {
      btn.textContent = "Copy";
    }, 1600);
  });
})();
