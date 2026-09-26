import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { MemoryCache } from "../src/core/cache.js";
import { FileCache } from "../src/runtime/file-cache.js";

describe("MemoryCache", () => {
  it("round-trips values", async () => {
    const c = new MemoryCache();
    await c.set("a", { x: 1 });
    expect(await c.get("a")).toEqual({ x: 1 });
  });

  it("expires entries", async () => {
    const c = new MemoryCache();
    await c.set("a", 1, -1);
    expect(await c.get("a")).toBeUndefined();
  });

  it("keeps entries without ttl forever", async () => {
    const c = new MemoryCache();
    await c.set("a", 1);
    expect(await c.get("a")).toBe(1);
  });
});

const dirs: string[] = [];
afterAll(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});

describe("FileCache", () => {
  it("round-trips and persists across instances", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fc-"));
    dirs.push(dir);
    const path = join(dir, "cache.json");

    const a = new FileCache(path);
    await a.set("k", { v: 42 });
    await a.flush();

    const b = new FileCache(path);
    expect(await b.get("k")).toEqual({ v: 42 });
  });

  it("expires entries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fc-"));
    dirs.push(dir);
    const c = new FileCache(join(dir, "c.json"));
    await c.set("x", 1, -1);
    expect(await c.get("x")).toBeUndefined();
  });

  it("tolerates a missing file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fc-"));
    dirs.push(dir);
    const c = new FileCache(join(dir, "nope.json"));
    expect(await c.get("x")).toBeUndefined();
  });

  it("concurrent calls during the first load share one read — no false miss", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fc-"));
    dirs.push(dir);
    const path = join(dir, "c.json");
    await writeFile(path, JSON.stringify({ a: { value: "old" } }));
    const c = new FileCache(path);
    // regression: a get() racing the initial load used to see an empty store
    const [, v] = await Promise.all([c.set("b", "x"), c.get<string>("a")]);
    expect(v).toBe("old");
  });
});
