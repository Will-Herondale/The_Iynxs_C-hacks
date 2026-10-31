# SETU: Tech Stack

# Frontend

**Language and tooling**
- TypeScript (strict) across all packages
- npm workspaces monorepo
- Vite (dev server and builds)
- ESLint

**UI**
- React 19 (Field app and Command Centre)
- `@setu/ui`: in-house design system (React components, CSS tokens, sync-status badges)
- Plain CSS, no UI framework

**Maps**
- MapLibre GL
- `@setu/geo`: bundled Majuli data, offline map style and terrain hillshade (no tile-server calls)

**Data and API**
- `@setu/contract`: zod schemas, inferred types and the `ApiClient` interface; every backend response is validated
- `@setu/api-client`: HTTP adapter against `VITE_API_URL`; SSE for live updates with polling fallback
- TanStack Query (fetching and caching in Command)
- The frontend renders what the backend returns; it computes no routes, flood extents or accessibility

**Offline (Field app)**
- PWA via `vite-plugin-pwa` (service worker and manifest; production builds only, HTTPS required)
- Dexie (IndexedDB) for the report queue and cached projections
- Idempotent `clientEventId`, retries with backoff, tab lock, `/health` connectivity probe

**Testing**
- Vitest (unit tests)
- Playwright (browser tests, including offline flows) and axe-core (accessibility)
- `@setu/api-client/testing` fake contract server and `mock-backend` test double (tests only, never used at runtime)

**Apps**
- `frontend/apps/field` (port 5173) and `frontend/apps/command` (port 5174)

**Development tools**
- Git and GitHub (branches, pull requests, issues)
- GitHub CLI (`gh`)
- Claude Code (AI-assisted development)
- Orca (runs parallel agents, one worktree each)

# Backend

_To be added by the backend owner._
