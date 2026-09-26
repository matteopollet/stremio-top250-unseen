import type { Cache } from "../cache.js";
import type { ChartProvider, RankedFilm } from "../types.js";

const CHART_KEY = "chart:current";
const LAST_GOOD_KEY = "chart:last-good";
const CHART_TTL = 24 * 3600; // 24h — the Top 250 moves slowly

export interface ChartResult {
  films: RankedFilm[];
  source: string;
  stale: boolean;
}

/**
 * Chains chart providers in order (graphql → snapshot url → bundled snapshot),
 * with a 24h cache and a permanent "last good" copy so a transient failure
 * never empties the catalog.
 */
export class ChartService {
  constructor(
    private providers: ChartProvider[],
    private cache: Cache,
  ) {}

  async getChart(): Promise<ChartResult> {
    const cached = await this.cache.get<{ films: RankedFilm[]; source: string }>(CHART_KEY);
    if (cached) return { ...cached, stale: false };

    const errors: string[] = [];
    for (const p of this.providers) {
      try {
        const films = await p.getChart();
        if (!films.length) throw new Error("empty chart");
        await this.cache.set(CHART_KEY, { films, source: p.name }, CHART_TTL);
        await this.cache.set(LAST_GOOD_KEY, { films, source: p.name });
        return { films, source: p.name, stale: false };
      } catch (e) {
        errors.push(`${p.name}: ${(e as Error).message}`);
      }
    }

    const lastGood = await this.cache.get<{ films: RankedFilm[]; source: string }>(LAST_GOOD_KEY);
    if (lastGood) return { ...lastGood, stale: true };

    throw new Error(`all chart providers failed — ${errors.join(" | ")}`);
  }
}
