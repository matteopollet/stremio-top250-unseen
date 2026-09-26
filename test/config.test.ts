import { describe, expect, it } from "vitest";
import { configFromEnv, decodeConfig, encodeConfig } from "../src/core/config.js";

describe("config encoding", () => {
  it("round-trips through base64url", () => {
    const cfg = { letterboxdUsername: "polletm", tmdbApiKey: "abc", storageKey: "k1" };
    const encoded = encodeConfig(cfg);
    expect(encoded).not.toContain("+");
    expect(decodeConfig(encoded)).toEqual(cfg);
  });

  it("rejects malformed configs", () => {
    expect(decodeConfig("not-base64!!")).toBeNull();
    expect(decodeConfig(btoa('"str"'))).toBeNull();
  });

  it("reads env config", () => {
    expect(configFromEnv({ LETTERBOXD_USERNAME: "u", TMDB_API_KEY: "k" })).toEqual({
      letterboxdUsername: "u", tmdbApiKey: "k",
    });
    expect(configFromEnv({})).toEqual({});
  });
});
