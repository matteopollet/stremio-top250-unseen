# Contributing

Small project, happy to get issues and PRs.

## Setup

```bash
npm install
npm run build:configure   # generates public/configure.js (committed — keep it fresh)
npm test
```

## Ground rules

- **Core stays runtime-agnostic.** `src/core/` must not import `node:*` or
  Workers APIs — it is shared by the Node server, the Cloudflare Worker and
  the browser bundle. Runtime-specific code lives in `src/runtime/`.
- **Matching is conservative.** Never make the matcher drop a film on weak
  evidence: a wrong exclusion is invisible to the user. New ambiguous cases
  belong in `data/aliases.json` or the ambiguity report, not in a lower
  threshold.
- **No scraping.** Letterboxd and IMDb data come only from documented inputs:
  the user's own CSV export, the public RSS feed, and the GraphQL chart
  provider (behind `ChartProvider`, replaceable).
- Tests for matching/parsing live in `test/` with real-format fixtures. If you
  change `src/configure-page/main.ts`, run `npm run build:configure` and commit
  the regenerated `public/configure.js` (CI checks freshness).

## Useful commands

| command | purpose |
|---|---|
| `npm test` | vitest suite |
| `npm run typecheck` | typecheck the Node target |
| `npx tsc -p tsconfig.worker.json` | typecheck the Workers target |
| `npm run import-watched -- *.csv` | local CSV → exclusions |
| `npm run refresh-snapshot` | refresh the bundled Top 250 |
