import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { configFromEnv } from "../core/config.js";
import { handleRequest, type AddonDeps } from "../http/addon.js";
import { configurePageHtml } from "../http/configure-html.js";
import { FileCache } from "./file-cache.js";

const PORT = Number(process.env.PORT ?? 7146);
// well above the app-level 256KB limit — this is the read-side backstop only
const MAX_REQUEST_BYTES = 1_000_000;
// DATA_DIR = writable state (cache + exclusions). Bundled reference data
// (top250 snapshot, aliases) is always read from the repo, relative to this file.
const DATA_DIR = process.env.DATA_DIR ?? "data/local";
const BUNDLED_DATA = new URL("../../data/", import.meta.url);

const cache = new FileCache(`${DATA_DIR}/cache.json`);
const store = new FileCache(`${DATA_DIR}/store.json`);

const [snapshot, aliases, configureJs, favicon] = await Promise.all([
  readFile(new URL("top250.snapshot.json", BUNDLED_DATA), "utf8").then(JSON.parse),
  readFile(new URL("aliases.json", BUNDLED_DATA), "utf8").then((t) => JSON.parse(t).aliases as Record<string, string>),
  readFile(new URL("../../public/configure.js", import.meta.url)).catch(() => null),
  readFile(new URL("../../public/favicon.svg", import.meta.url)).catch(() => null),
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

    // static assets for the configure page
    if (url.pathname === "/configure.js") {
      if (!configureJs) {
        res.writeHead(404).end("run `npm run build:configure` first");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/javascript" }).end(configureJs);
      return;
    }
    if (url.pathname === "/favicon.svg" && favicon) {
      res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" }).end(favicon);
      return;
    }

    let body: string | null = null;
    if (req.method === "POST") {
      // cap while reading — buffering an unbounded body before the app's own
      // 256KB check would let a huge POST exhaust memory on this host
      const chunks: Buffer[] = [];
      let size = 0;
      let oversized = false;
      for await (const c of req) {
        size += (c as Buffer).length;
        if (size > MAX_REQUEST_BYTES) {
          oversized = true;
          break;
        }
        chunks.push(c as Buffer);
      }
      if (oversized) {
        res
          .writeHead(413, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            Connection: "close",
          })
          .end(JSON.stringify({ err: "payload too large" }), () => req.destroy());
        return;
      }
      body = Buffer.concat(chunks).toString("utf8");
    }

    const out = await handleRequest(req.method ?? "GET", url.pathname, body, deps);
    res.writeHead(out.status, out.headers).end(req.method === "HEAD" ? undefined : out.body);
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
