import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { configFromEnv } from "../core/config.js";
import { handleRequest, type AddonDeps } from "../http/addon.js";
import { configurePageHtml } from "../http/configure-html.js";
import { FileCache } from "./file-cache.js";

const PORT = Number(process.env.PORT ?? 7146);
// DATA_DIR = writable state (cache + exclusions). Bundled reference data
// (top250 snapshot, aliases) is always read from the repo, relative to this file.
const DATA_DIR = process.env.DATA_DIR ?? "data/local";
const BUNDLED_DATA = new URL("../../data/", import.meta.url);

const cache = new FileCache(`${DATA_DIR}/cache.json`);
const store = new FileCache(`${DATA_DIR}/store.json`);

const [snapshot, aliases, configureJs] = await Promise.all([
  readFile(new URL("top250.snapshot.json", BUNDLED_DATA), "utf8").then(JSON.parse),
  readFile(new URL("aliases.json", BUNDLED_DATA), "utf8").then((t) => JSON.parse(t).aliases as Record<string, string>),
  readFile(new URL("../../public/configure.js", import.meta.url), "utf8").catch(() => null),
]);

const deps: AddonDeps = {
  cache,
  store,
  envConfig: configFromEnv(process.env),
  snapshot,
  configureHtml: configurePageHtml(),
  ...(process.env.TOP250_SNAPSHOT_URL ? { snapshotUrl: process.env.TOP250_SNAPSHOT_URL } : {}),
  ...(aliases ? { aliases } : {}),
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    // static asset for the configure page
    if (url.pathname === "/configure.js") {
      if (!configureJs) {
        res.writeHead(404).end("run `npm run build:configure` first");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/javascript" }).end(configureJs);
      return;
    }

    let body: string | null = null;
    if (req.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      body = Buffer.concat(chunks).toString("utf8");
    }

    const out = await handleRequest(req.method ?? "GET", url.pathname, body, deps);
    res.writeHead(out.status, out.headers).end(out.body);
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
      .end(JSON.stringify({ err: (e as Error).message }));
  }
});

// flush the file-backed caches periodically and on shutdown
const flush = () => Promise.all([cache.flush(), store.flush()]);
setInterval(() => void flush(), 30_000).unref();
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => void flush().finally(() => process.exit(0)));
}

server.listen(PORT, () => {
  console.log(`stremio-top250-unseen listening on http://localhost:${PORT}`);
  console.log(`configure: http://localhost:${PORT}/configure`);
  console.log(`manifest:  http://localhost:${PORT}/manifest.json`);
});
