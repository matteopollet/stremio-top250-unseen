import type { WatchedEntry } from "../types.js";

/**
 * Minimal RFC-4180 CSV parser. Letterboxd exports are simple CSVs whose only
 * complication is quoted fields (titles containing commas) and a header row.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  // strip BOM
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  for (; i < text.length; i++) {
    const c = text[i]!;
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

const NAME_COL = "name";
const YEAR_COL = "year";
const URI_COL = "letterboxd uri";

/**
 * Parses one Letterboxd export CSV (watched.csv, ratings.csv or diary.csv —
 * they all share the Date,Name,Year,Letterboxd URI prefix) into entries.
 */
export function parseLetterboxdCsv(text: string): WatchedEntry[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];

  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf(NAME_COL);
  const yearIdx = header.indexOf(YEAR_COL);
  const uriIdx = header.indexOf(URI_COL);
  if (nameIdx === -1) return [];

  const entries: WatchedEntry[] = [];
  for (const row of rows.slice(1)) {
    const name = row[nameIdx]?.trim();
    if (!name) continue;
    const yearRaw = yearIdx >= 0 ? row[yearIdx]?.trim() : undefined;
    const year = yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;
    const uri = uriIdx >= 0 ? (row[uriIdx]?.trim() ?? null) : null;
    entries.push({ name, year, letterboxdUri: uri || null });
  }
  return entries;
}

/** Merges several export files (watched + ratings + diary) into deduplicated entries. */
export function parseLetterboxdExports(texts: string[]): WatchedEntry[] {
  const seen = new Set<string>();
  const out: WatchedEntry[] = [];
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
