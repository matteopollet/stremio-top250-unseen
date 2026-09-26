import type { ChartProvider, RankedFilm } from "../types.js";

const ENDPOINT = "https://api.graphql.imdb.com/";

const QUERY = `query Top250 {
  chartTitles(chart: { chartType: TOP_RATED_MOVIES }, first: 250) {
    edges {
      node {
        id
        titleText { text }
        originalTitleText { text }
        releaseYear { year }
        primaryImage { url }
        ratingsSummary { aggregateRating }
      }
    }
    total
  }
}`;

interface GqlNode {
  id: string;
  titleText?: { text: string };
  originalTitleText?: { text: string };
  releaseYear?: { year: number };
  primaryImage?: { url: string };
  ratingsSummary?: { aggregateRating: number };
}

interface GqlResponse {
  data?: { chartTitles?: { edges: { node: GqlNode }[]; total?: number } };
  errors?: { message: string }[];
}

export type FetchLike = (url: string, init?: unknown) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * Live IMDb Top 250 via IMDb's internal GraphQL endpoint.
 *
 * EXPERIMENTAL / unofficial: this is the endpoint IMDb's own apps use. It is
 * undocumented, may break without notice, and IMDb's conditions of use
 * restrict automated access (non-commercial use only — see README §ToS).
 * Always pair it with a SnapshotProvider fallback via chainChartProviders().
 */
export class ImdbGraphqlProvider implements ChartProvider {
  readonly name = "imdb-graphql";

  constructor(private fetchImpl: FetchLike = fetch as unknown as FetchLike) {}

  async getChart(): Promise<RankedFilm[]> {
    const res = await this.fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // the endpoint 403s without browser-ish headers
        Origin: "https://www.imdb.com",
        Referer: "https://www.imdb.com/",
        "User-Agent": "Mozilla/5.0 (compatible; stremio-top250-unseen)",
      },
      body: JSON.stringify({ query: QUERY }),
    });
    if (!res.ok) throw new Error(`imdb graphql: HTTP ${res.status}`);
    const body = (await res.json()) as GqlResponse;
    if (body.errors?.length) throw new Error(`imdb graphql: ${body.errors[0]!.message}`);
    const edges = body.data?.chartTitles?.edges;
    if (!edges?.length) throw new Error("imdb graphql: empty chart");

    return edges.map((e, i) => ({
      rank: i + 1,
      imdbId: e.node.id,
      title: e.node.titleText?.text ?? e.node.id,
      originalTitle: e.node.originalTitleText?.text ?? null,
      year: e.node.releaseYear?.year ?? null,
      posterUrl: e.node.primaryImage?.url ?? null,
      imdbRating: e.node.ratingsSummary?.aggregateRating ?? null,
    }));
  }
}
