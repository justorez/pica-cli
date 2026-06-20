# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Run the main CLI in dev mode (tsx src/index.ts)
pnpm dev:zip          # Run the zip tool in dev mode (tsx src/zip.ts)
pnpm build            # Build both entry points via rollup → dist/
pnpm start            # Run built main CLI (node dist/index.js)
pnpm start:zip        # Run built zip tool (node dist/zip.js)
pnpm test             # Run tests with vitest
pnpm type:check       # TypeScript type checking (tsc --noEmit)
pnpm lint             # ESLint check
pnpm lint:fix         # ESLint auto-fix
pnpm format           # Prettier format
pnpm format:check     # Prettier check
```

## Architecture

This is a CLI tool (ES modules, Node ≥18, TypeScript) to download comics from picacomic.com. It has two entry points:

- **`src/index.ts`** → `pica-cli` — Interactive downloader: login, search/favorites/leaderboard, chapter selection, concurrent image download
- **`src/zip.ts`** → `pica-zip` — Post-download tool that compresses each chapter into a zip file

### Core modules

- **`src/sdk.ts`** — `Pica` class. Wraps the pica API with axios. Request interceptor signs every request with HMAC-SHA256 using a hardcoded `PICA_SECRET_KEY` (overridable via env). Response interceptor handles retries (max 3 per URL, tracked in a `retryMap`). All "get all pages" methods follow the same pattern: fetch page 1, read `pages`/`total`, loop pages 2..n. The `download()` method uses a **separate axios instance call** (not `this.request`) because some pica file servers have broken HTTPS certs — it rewrites URLs from `https://` to `http://` and manually handles redirects.
- **`src/utils.ts`** — File/dir name normalization (replaces OS-illegal chars, caps at 85 chars to avoid Linux path-too-long errors), resume tracking (`comics/done.txt` marking completed chapters), env loading (`.env.local` takes precedence over process env), chapter selection parsing (`"1,3,5-20"` or `"all"`).
- **`src/types.ts`** — TypeScript types. Key pattern: `Page<T>` generic with `docs: T[]` for paginated API responses.

### Configuration

All config via environment variables. Copy `.env.template` to `.env.local` for local dev — `loadEnv()` in utils loads it. Key vars: `PICA_ACCOUNT`, `PICA_PASSWORD`, `PICA_PROXY`, `PICA_DL_CONTENT`, `PICA_DL_SEARCH_KEYWORDS`, `PICA_DL_CHAPTER`, `PICA_DL_CONCURRENCY` (default 5), `PICA_SECRET_KEY` (has a hardcoded fallback).

### API signing

`src/data/headers.json` contains static headers (api-key, nonce, app-version, etc.). The request interceptor computes: `HMAC-SHA256(url + timestamp + nonce + method + api-key)` using `PICA_SECRET_KEY`, then sets `signature` and `time` headers.

### GitHub Actions

- **`task.yml`** — Manual workflow (`workflow_dispatch`) to run the downloader on GitHub's servers. Sets `PICA_IN_GITHUB=true` which skips interactive prompts. Can upload artifacts to GitHub or file.io.
- **`publish.yml`** — Triggered by `v*.*.*` tags. Builds and publishes to npm, then creates a GitHub release draft via `changelogithub`.

### Tests

Vitest with 99s timeout. Tests in `test/` are integration tests that require real credentials (loaded from `.env.local`). They call the real API and save responses as JSON to `tmp/` for reference. Run with: `pnpm test`

### Build

Rollup bundles both `src/index.ts` and `src/zip.ts` into `dist/`. Plugins: JSON import, esbuild (minify, Node platform), node-resolve, commonjs. Dependencies and Node builtins are external. The published npm package only includes `dist/`.
