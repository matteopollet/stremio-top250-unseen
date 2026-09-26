import { configFromEnv } from "../core/config.js";
import { handleRequest, type AddonDeps } from "../http/addon.js";
import { configurePageHtml } from "../http/configure-html.js";
import { KvCache } from "./kv-cache.js";
import aliasesFile from "../../data/aliases.json";
import snapshotFile from "../../data/top250.snapshot.json";

interface Env {
  CACHE: KVNamespace;
  LETTERBOXD_USERNAME?: string;
  TMDB_API_KEY?: string;
  CATALOG_NAME?: string;
  TOP250_SNAPSHOT_URL?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // note: static assets (public/configure.js, favicon.svg) never reach this
    // fetch — wrangler.toml sets run_worker_first = false

    const cache = new KvCache(env.CACHE);
    const deps: AddonDeps = {
      cache,
      store: cache,
      envConfig: configFromEnv(env as unknown as Record<string, string | undefined>),
      snapshot: snapshotFile as AddonDeps["snapshot"],
      configureHtml: configurePageHtml(),
      ...(env.TOP250_SNAPSHOT_URL ? { snapshotUrl: env.TOP250_SNAPSHOT_URL } : {}),
      aliases: (aliasesFile as { aliases: Record<string, string> }).aliases,
    };

    const body = request.method === "POST" ? await request.text() : null;
    const out = await handleRequest(request.method, url.pathname, body, deps);
    return new Response(out.body, { status: out.status, headers: out.headers });
  },
};
