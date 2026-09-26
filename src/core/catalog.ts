import type { MetaPreview, RankedFilm } from "./types.js";

export interface CatalogOverrides {
  forceInclude?: string[];
  forceExclude?: string[];
}

export const PAGE_SIZE = 100;

/** chart − watched, rank order preserved. Pure and testable. */
export function buildCatalog(
  films: RankedFilm[],
  watchedIds: Set<string>,
  overrides: CatalogOverrides = {},
  skip = 0,
): MetaPreview[] {
  const excluded = new Set(watchedIds);
  for (const id of overrides.forceExclude ?? []) excluded.add(id);
  for (const id of overrides.forceInclude ?? []) excluded.delete(id);

  const remaining = films.filter((f) => !excluded.has(f.imdbId));
  return remaining.slice(skip, skip + PAGE_SIZE).map((f) => toMetaPreview(f));
}

function toMetaPreview(f: RankedFilm): MetaPreview {
  return {
    id: f.imdbId,
    type: "movie",
    name: f.title,
    ...(f.posterUrl ? { poster: f.posterUrl } : {}),
    posterShape: "poster",
    ...(f.imdbRating !== null ? { imdbRating: String(f.imdbRating) } : {}),
    ...(f.year !== null ? { releaseInfo: String(f.year) } : {}),
    description: `#${f.rank} · IMDb Top 250`,
  };
}
