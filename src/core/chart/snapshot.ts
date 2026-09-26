import type { ChartProvider, RankedFilm } from "../types.js";

export interface SnapshotFile {
  source: string;
  fetchedAt: string;
  films: RankedFilm[];
}

/**
 * Chart provider backed by a JSON snapshot — either the bundled one shipped
 * in this repository or a user-provided URL (TOP250_SNAPSHOT_URL), which makes
 * the chart source fully replaceable.
 */
export class SnapshotProvider implements ChartProvider {
  readonly name;

  constructor(
    private snapshot: SnapshotFile | null,
    private url: string | null = null,
    // never a bare `fetch` reference — detached fetch throws "Illegal invocation" on Workers
    private fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {
    this.name = url ? `snapshot:${url}` : "snapshot:bundled";
  }

  async getChart(): Promise<RankedFilm[]> {
    let snap = this.snapshot;
    if (this.url) {
      const res = await this.fetchImpl(this.url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`snapshot fetch: HTTP ${res.status}`);
      snap = (await res.json()) as SnapshotFile;
    }
    if (!snap?.films?.length) throw new Error("snapshot: empty or missing");
    return snap.films;
  }
}
