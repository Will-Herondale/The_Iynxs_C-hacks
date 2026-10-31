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

**Language and tooling**
- TypeScript (strict)
- Node.js (v22 LTS)
- tsx (TypeScript execution without separate build step)
- npm

**Server**
- Native Node.js `http` server (no Express)
- SSE (Server-Sent Events) for live projection updates to frontend
- HTTP REST API: `GET /api/v1/projections`, `GET /api/v1/events`, `GET /api/v1/health`, `POST /api/v1/events:batch`
- Append-only JSONL event log
- Invalid UUID-v4 client IDs rejected before append
- Idempotent submissions (same clientEventId returns same eventId)
- Omission metadata for unsupported record types (e.g., `person.register`)

**Projection engine**
- Flood projection from obs.water events with depth > 0
- Road status projection: blocked when flood event occurs at road location
- Settlement cut-off projection: settlement is cut off when blocked roads surround it
- Route refusal projection: route unavailable when any edge is blocked
- Route refusal explanation: naming blocking roads/features with source event IDs
- Settlement cut-off reason: naming blocking road features with source event IDs

**Data model**
- `clientEventId` (UUID v4): idempotency key for deduplication
- `eventId` (ULID): server-assigned event identifier
- `sourceEventIds`: provenance mapping from road/settlement/route back to originating events
- Field events: `flood_report`, `road_blockage`, `road_cleared`, `water_level`, `household_registration`
- Legacy `person.register` records: omitted from response with `omitted` metadata

**Contract types (shared with frontend via `@setu/contract`)**
- `ProjectionSnapshot`: roads, settlements, routes, shelters, flood extent as GeoJSON FeatureCollections
- `EventRecord`: event with server state (applied/conflict/rejected) and applied version
- `RouteRefusal`: summary, blockingFeatureIds, sourceEventIds
- `SettlementCutOff`: summary, blockingFeatureIds, sourceEventIds

**Testing**
- Vitest (unit tests)
- Server restart/persistence/provenance/refusal regression tests
- Route edge-ID regression tests

**Development tools**
- Git and GitHub (branches, pull requests, issues)
- GitHub CLI (`gh`)
- Claude Code (AI-assisted development)
- Orca (runs parallel agents, one worktree each)

# Cloud Infrastructure

**Azure (Production)**
- Resource Group: `setu-demo-rg`
- App Service Plan: `setu-demo-plan` (Linux, B1 tier)
- Web App: `setu-backend-demo` (Node.js 22 LTS, Linux)
- Region: East US
- Deployment: Zip deploy via `az webapp deploy`
- Tunnel: `cloudflared tunnel --url http://localhost:18080` (ephemeral trycloudflare.com URL for demo)
