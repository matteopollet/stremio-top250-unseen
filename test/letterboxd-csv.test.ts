import { describe, expect, it } from "vitest";
import { parseCsv, parseLetterboxdCsv, parseLetterboxdExports } from "../src/core/watched/letterboxd-csv.js";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    expect(parseCsv('"a,b","say ""hi"""\n')).toEqual([["a,b", 'say "hi"']]);
  });

  it("handles CRLF and BOM", () => {
    expect(parseCsv("﻿a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("skips empty trailing lines", () => {
    expect(parseCsv("a,b\n1,2\n\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("parseLetterboxdCsv", () => {
  const watched = `Date,Name,Year,Letterboxd URI
2025-11-15,Flushed Away,2006,https://boxd.it/1Tpm
2025-12-11,"The Social Network",2010,https://boxd.it/17ue
2026-01-02,"TRON: Ares",2025,https://boxd.it/jqdM
`;

  it("parses watched.csv rows", () => {
    const entries = parseLetterboxdCsv(watched);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({
      name: "Flushed Away",
      year: 2006,
      letterboxdUri: "https://boxd.it/1Tpm",
    });
  });

  it("handles titles containing commas", () => {
    const csv = `Date,Name,Year,Letterboxd URI
2024-01-01,"The Good, the Bad and the Ugly",1966,https://boxd.it/abc
`;
    expect(parseLetterboxdCsv(csv)[0]!.name).toBe("The Good, the Bad and the Ugly");
  });

  it("tolerates missing year", () => {
    const csv = `Date,Name,Year,Letterboxd URI
2024-01-01,Some Film,,https://boxd.it/abc
`;
    expect(parseLetterboxdCsv(csv)[0]!.year).toBeNull();
  });

  it("returns [] for unrelated csv", () => {
    expect(parseLetterboxdCsv("foo,bar\n1,2\n")).toEqual([]);
    expect(parseLetterboxdCsv("")).toEqual([]);
  });
});

describe("parseLetterboxdExports", () => {
  it("unions and deduplicates watched + ratings + diary", () => {
    const watched = `Date,Name,Year,Letterboxd URI
2025-01-01,Alien,1979,https://boxd.it/a
2025-01-02,Heat,1995,https://boxd.it/b
`;
    const ratings = `Date,Name,Year,Letterboxd URI,Rating
2025-01-03,Heat,1995,https://boxd.it/b,4.5
2025-01-03,Amelie,2001,https://boxd.it/c,4
`;
    const diary = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
2025-01-04,Alien,1979,https://boxd.it/a,,No,,2025-01-04
2025-01-05,Parasite,2019,https://boxd.it/d,5,No,,2025-01-05
`;
    const entries = parseLetterboxdExports([watched, ratings, diary]);
    expect(entries.map((e) => e.name).sort()).toEqual(["Alien", "Amelie", "Heat", "Parasite"]);
  });
});
