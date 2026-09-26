/** A film in the ranked chart (e.g. IMDb Top 250), 1-indexed. */
export interface RankedFilm {
  rank: number;
  imdbId: string;
  title: string;
  originalTitle: string | null;
  year: number | null;
  posterUrl: string | null;
  imdbRating: number | null;
}

/** A single watched entry parsed from a Letterboxd CSV export. */
export interface WatchedEntry {
  name: string;
  year: number | null;
  letterboxdUri: string | null;
}

/** Provides the set of IMDb IDs the user has already seen. */
export interface WatchedProvider {
  readonly name: string;
  getWatchedIds(): Promise<Set<string>>;
}

/** Provides the current ranked chart. */
export interface ChartProvider {
  readonly name: string;
  getChart(): Promise<RankedFilm[]>;
}

/** Stremio meta preview object (catalog items). */
export interface MetaPreview {
  id: string;
  type: "movie";
  name: string;
  poster?: string;
  posterShape?: "poster" | "square" | "landscape";
  imdbRating?: string;
  releaseInfo?: string;
  description?: string;
  genres?: string[];
}
