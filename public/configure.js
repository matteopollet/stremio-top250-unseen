"use strict";
(() => {
  // src/core/config.ts
  function b64urlEncode(s) {
    const bytes = new TextEncoder().encode(s);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function encodeConfig(cfg) {
    return b64urlEncode(JSON.stringify(cfg));
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
  var pending = null;
  async function readFiles(input) {
    const out = [];
    for (const f of Array.from(input.files ?? [])) out.push(await f.text());
    return out;
  }
  function esc(s) {
    return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }
  $("go").addEventListener("click", async () => {
    const btn = $("go");
    btn.disabled = true;
    try {
      const chartRes = await fetch("/chart.json");
      if (!chartRes.ok) throw new Error(`chart fetch failed (${chartRes.status})`);
      const chart = await chartRes.json();
      const texts = await readFiles($("csvFiles"));
      const entries = parseLetterboxdExports(texts);
      const report = matchWatched(entries, chart.films, { aliases: chart.aliases ?? {} });
      const cfg = { storageKey: crypto.randomUUID() };
      const username = $("username").value.trim();
      const tmdbKey = $("tmdbKey").value.trim();
      if (username) cfg.letterboxdUsername = username;
      if (tmdbKey) cfg.tmdbApiKey = tmdbKey;
      pending = { report, cfg };
      renderReport(report, entries.length);
      $("results").style.display = "block";
    } catch (e) {
      alert(e.message);
    } finally {
      btn.disabled = false;
    }
  });
  function renderReport(report, totalEntries) {
    $("summary").innerHTML = `${totalEntries} watched entries in your export \u2014 <strong>${report.matched.length} matched a Top 250 film</strong> and will be hidden.`;
    const box = $("ambiguous");
    if (!report.ambiguous.length) {
      box.innerHTML = `<p class="muted">No ambiguous entries.</p>`;
      return;
    }
    const rows = report.ambiguous.map((a, i) => {
      const cands = a.candidates.map((c, j) => `<label style="font-weight:400"><input type="checkbox" data-amb="${i}" data-imdb="${c.imdbId}"> ${esc(c.title)} <span class="muted">(${(c.score * 100).toFixed(0)}%)</span></label>`).join(" ");
      return `<tr><td>${esc(a.entry.name)}${a.entry.year ? ` (${a.entry.year})` : ""}<br><span class="muted">${a.reason}</span></td><td>${cands}</td></tr>`;
    }).join("");
    box.innerHTML = `<p class="muted">These look like Top 250 films but didn't match confidently \u2014 tick any that should count as seen:</p><table>${rows}</table>`;
  }
  $("confirm").addEventListener("click", async () => {
    if (!pending) return;
    const { report, cfg } = pending;
    const extraIds = Array.from(document.querySelectorAll("input[data-amb]:checked")).map(
      (el) => el.dataset.imdb
    );
    const excludedImdbIds = [.../* @__PURE__ */ new Set([...report.excludedIds, ...extraIds])];
    const res = await fetch(`/exclusions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storageKey: cfg.storageKey,
        excludedImdbIds,
        ambiguous: report.ambiguous.map((a) => ({
          name: a.entry.name,
          year: a.entry.year,
          reason: a.reason,
          candidates: a.candidates
        }))
      })
    });
    if (!res.ok) {
      alert(`failed to save exclusions (${res.status})`);
      return;
    }
    const manifestUrl = `${location.origin}/${encodeConfig(cfg)}/manifest.json`;
    $("manifestUrl").textContent = manifestUrl;
    $("stremioLink").href = `stremio://${location.host}${location.pathname.replace(/\/configure.*$/, "")}/${encodeConfig(cfg)}/manifest.json`;
    $("install").style.display = "block";
  });
})();
