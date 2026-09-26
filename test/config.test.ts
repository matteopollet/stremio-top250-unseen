import { describe, expect, it } from "vitest";
import { configFromEnv, decodeConfig, encodeConfig, type AddonConfig } from "../src/core/config.js";

const b64 = (v: unknown) => encodeConfig(v as AddonConfig);

describe("config encoding", () => {
  it("round-trips through base64url", () => {
    const cfg = { letterboxdUsername: "testuser", tmdbApiKey: "abc", storageKey: "k1" };
    const encoded = encodeConfig(cfg);
    expect(encoded).not.toContain("+");
    expect(decodeConfig(encoded)).toEqual(cfg);
  });

  it("rejects malformed configs", () => {
    expect(decodeConfig("not-base64!!")).toBeNull();
    expect(decodeConfig(btoa('"str"'))).toBeNull();
    expect(decodeConfig(btoa('[1,2]'))).toBeNull();
  });

  it("rejects known fields with the wrong type", () => {
    expect(decodeConfig(b64({ letterboxdUsername: 42 }))).toBeNull();
    expect(decodeConfig(b64({ overrides: "forceExclude" }))).toBeNull();
    expect(decodeConfig(b64({ overrides: { forceExclude: "tt0111161" } }))).toBeNull();
    expect(decodeConfig(b64({ overrides: { forceExclude: ["not-an-id"] } }))).toBeNull();
  });

  it("drops unknown keys and keeps valid overrides", () => {
    const cfg = decodeConfig(
      b64({ storageKey: "k1", someUnknownField: { x: 1 }, overrides: { forceInclude: ["tt0111161"] } }),
    );
    expect(cfg).toEqual({ storageKey: "k1", overrides: { forceInclude: ["tt0111161"] } });
  });

  it("reads env config (storageKey is URL-only — never from env)", () => {
    expect(configFromEnv({ LETTERBOXD_USERNAME: "u", TMDB_API_KEY: "k" })).toEqual({
      letterboxdUsername: "u", tmdbApiKey: "k",
    });
    expect(configFromEnv({ STORAGE_KEY: "nope" })).toEqual({});
    expect(configFromEnv({})).toEqual({});
  });
});
