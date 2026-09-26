# Security Policy

## Reporting

Please report vulnerabilities privately via GitHub Security Advisories
(*Security → Report a vulnerability*). Non-sensitive bugs can go in the
regular issue tracker.

Only the latest commit on `main` / the currently deployed worker is supported.

## What this addon stores

On a hosted deployment (Cloudflare KV), per installation:

- `excludedImdbIds` / `manualExclusions` — the IMDb ids to hide, plus a small
  ambiguity report (entry title, year, match reason, candidate ids);
- accumulated Letterboxd RSS watched ids, keyed by Letterboxd username;
- a TMDB → IMDb id map (public data).

No credentials, no Letterboxd history beyond the Top 250 ids to hide. The CSV
export is parsed in the browser and never uploaded — see *Privacy* in the
README.

## Threat model

- **The addon URL is the credential.** The `storageKey` inside the config
  segment grants read and write access to that exclusion set (`GET`/`POST
  /{cfg}/exclusions`, `/{cfg}/status.json`). Keep install URLs private.
- `tmdbApiKey` (optional) travels inside the addon URL — only include it if
  you accept that exposure; prefer a self-hosted instance with a `wrangler
  secret` if you don't.
- `POST /exclusions` enforces payload size limits, IMDb id validation, and a
  minimum-entropy `storageKey` so the shared `default` scope and arbitrary
  KV keys can't be written from outside.
