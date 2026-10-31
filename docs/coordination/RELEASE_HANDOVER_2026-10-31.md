# SETU release handover — 2026-10-31

## Release position

SETU is a working local, offline-first disaster-response prototype and a
repeatable synthetic demo. It is **not production-ready**: the connected demo
route and the runtime flood extent are synthetic/approximate, and the
real-backend browser demonstration still needs its final evidence captured.

## Current trees and architecture

| Worktree | Branch / revision | Responsibility |
|---|---|---|
| `C:\Users\Ashwath M\setu-backend` | `coordination/integration-handoff` / `6168013` plus working changes | core, server, GIS loader, coordination |
| `C:\Users\Ashwath M\The_Iynxs_C-hacks` | `frontend/main` / `7a14660` plus working changes | Field and Command apps |

Both trees are dirty; do not reset or clean them. The layers are:

- `packages/core/`: internal event envelope (ULID/HLC/vector clock/hash), sync
  ingest, flood/network/people projections, and time-expanded DAG routing.
- `packages/server/`: HTTP/SSE API, wire translation, append-only JSONL log,
  GIS artifact loading, and the projection fold.
- `frontend/packages/contract/`: Zod wire schemas and API types.
- `frontend/packages/api-client/`: HTTP client, SSE with polling fallback, and
  response validation.
- `frontend/apps/field/`: React/PWA volunteer reporting, Dexie queue, cached
  projections, households/camp, and offline map.
- `frontend/apps/command/`: projection-driven map, situation summary, routes,
  settlements, event feed, audit, provenance, and refusal explanations.
- `frontend/packages/geo/`: bundled offline GeoJSON/style assets.

The frontend renders server projections; it does not compute flood extent,
accessibility, or routes.

## Flood lifecycle: one report

1. Field `ReportForm` creates a UUID `FieldEvent`; `FieldEventSchema` validates
   it and `sync/queue.ts:enqueue` writes it to IndexedDB before networking.
2. `api-client/src/http.ts` submits it to `POST /api/v1/events:batch`.
3. `server.ts:handleEventsBatch` maps the wire event through
   `translation.ts:translateEvent`: ISO time → epoch ms, coordinates → integer
   microdegrees, centimetres → integer decimetres, and `flood_report` →
   internal `obs.water`.
4. The server assigns a per-device sequence, appends the envelope to
   `packages/server/data/log.jsonl`, and returns `acceptedAtVersion`. Reusing
   the same `clientEventId` returns `duplicate` and the original event ID.
5. `projection.ts:projectSnapshot` total-orders events, selects water
   observations, matches a positive bridge-deck observation within about 50 m,
   synthesises an `obs.road` blockage, and rebuilds flood, road, settlement,
   shelter, and route collections.
6. The synthetic demo therefore shows `syn-bridge-1` blocked,
   `syn-settlement-1` cut off, and `syn-evac-1` unavailable with a refusal
   naming `syn-bridge-1`.
7. Command receives an SSE version notification (or polls) and refetches the
   full snapshot. Field confirms an accepted queue item through
   `POST /api/v1/events/status`, not from the ACK alone.

Important honesty point: the current server has no delayed apply queue;
existing events are reported as `applied` immediately after append. The
frontend still uses the safer accepted → status/version confirmation flow.

## Offline and synchronization

The active browser path is `frontend/apps/field/src/sync/`:

- `queue.ts:enqueue` validates and atomically persists reports in Dexie;
  retries retain the same `clientEventId`.
- `engine.ts:runPass` sends batches of up to 20, handles retry/backoff,
  conflict/rejection/failure, and `confirmAccepted` requires server `applied`
  plus a reached projection version before marking `synced`.
- `engine.ts:recoverSending` returns an interrupted send to `queued`.
- `offline/cacheDb.ts` stores the last snapshot and remote event records;
  `useCachedProjections` serves the last known snapshot offline.
- The Field PWA service worker is production-build only; API and SSE routes are
  network-only. The dev server does not install a service worker.

The root `setu-backend/offline/*.js` modules are an older standalone design and
are not the active React/Dexie runtime. Core version-vector/hole-healing code
exists, but the current HTTP server does not expose a complete peer-replica
`/sync` exchange endpoint.

## Event sourcing, projections, GIS, and routing

- `EventLog` stores immutable canonical envelopes as JSONL and rebuilds indices
  on startup. `projectSnapshot(events, artifacts, asOf, version)` is the fold
  boundary used by the server.
- `packages/core/src/project/flood.ts` can project a HAND grid, and
  `data/majuli/build_hand.py`/`offline/majuli_hand_bundle.json` provide offline
  artifacts. **Current server runtime passes an empty grid** and falls back to
  one synthetic observation-centred flood cell (`projection.ts:704-731`).
- `geo-artifacts.ts` loads the current demo road graph, settlements, shelters,
  and scenario bridge reference when present; it always appends the explicitly
  labelled synthetic settlement → bridge → shelter subgraph.
- `project/network.ts` selects valid-time road observations, exposes source
  events, and marks concurrent disagreement as disputed. Positive bridge-deck
  water observations also infer a blockage.
- `route/dag.ts` implements time-expanded graph routing with waiting. The
  server uses `findFastestPath` for route status/ETA over a 10-minute,
  one-minute-slot horizon. Returned route geometry remains the authored route
  definition; the selected path is not emitted as a reconstructed polyline.
- `latest-departure.ts` and `cutoff.ts` are implemented core algorithms but are
  not the server snapshot path. Current settlement `cut_off` output is based on
  proximity to wet cells (`projection.ts:computeCutOff`), not full graph
  reachability or a validated evacuation deadline.

### Implemented versus simulated/future

**Implemented:** local API (`events:batch`, `events/status`, `projections`,
`events`, `stream`, `health`), JSONL persistence, wire translation, synthetic
demo fold, real-source GIS loading where artifacts are available, graph-based
route status/ETA, Field IndexedDB queue/cache, Command audit/provenance UI,
offline map bundle, and automated unit/browser test harnesses.

**Synthetic or approximate:** every `syn-*` feature, the runtime flood cell,
the authored route geometry, the scenario bridge reference, and the
observation-to-bridge inference. Real OSM/DDMA inputs are not the same as a
validated operational evacuation network; shelters are pre-identified rather
than confirmed operational.

**Future/out of scope:** validated runtime HAND inundation, hydrodynamic or
live CWC feeds, route-path geometry/alternate routes, server-wired latest-safe
departure deadlines, auth/roster enforcement, photo upload, strict server-side
Zod request validation, durable multi-instance storage, and full peer-to-peer
replica sync.

## Verification ledger

These are the current known checkpoint facts; rerun health/tests before a
release presentation:

- Frontend unit tests: **371/371 passed**.
- Full isolated Chromium run: **65 passed, 2 skipped**. The normal E2E harness
  uses an in-process fake API; skipped live-smoke checks are not real-backend
  evidence.
- Backend: **17 tests**; core: **70 tests**.
- Known backend checkpoint: local service on `http://localhost:8080` with the
  preserved 9-event log below; process liveness is ephemeral, so run the health
  check before the UI demo.
- The preserved live log has 9 JSONL events. SHA-256 of
  `packages/server/data/log.jsonl`:
  `261781282D9C27562C0C5C5F2DF3EA4C1D6EC443463778C23D13E9B626C046D1`.
- The isolated `scripts/demo.ps1` path verifies the synthetic chain and
  duplicate idempotency without modifying the live log.

**[PENDING — REAL-BACKEND UI EVIDENCE]** Capture and retain evidence for the
Field browser going offline → saving locally → reconnecting → confirmed, and
the Command browser receiving the resulting live projection from an isolated
real backend. Do not use the fake-API Chromium pass or stale screenshots as
proof of this step.

## Operations and demo

### Live local services

```powershell
cd 'C:\Users\Ashwath M\setu-backend'
cd packages\server
npx tsx src/run.ts

cd 'C:\Users\Ashwath M\The_Iynxs_C-hacks\frontend'
npm run dev -w @setu/field -- --port 5173
npm run dev -w @setu/command -- --port 5174
```

Current app `.env` files use `VITE_API_MODE=http` and
`VITE_API_URL=http://localhost:8080`.

- Field: `http://localhost:5173/#/home`
- Command: `http://localhost:5174/`
- Health: `http://localhost:8080/api/v1/health`
- API base: `http://localhost:8080`

The previously documented Cloudflare URL is ephemeral and is not a current
release dependency; verify any tunnel separately.

### Isolated synthetic demo

Run from the backend tree; this uses `packages/server/data/demo`, not the live
8080 log:

```powershell
cd 'C:\Users\Ashwath M\setu-backend'
.\scripts\demo.ps1 -Action reset -Port 18080
.\scripts\demo.ps1 -Action seed  -Port 18080
.\scripts\demo.ps1 -Action status -Port 18080
```

For a real-backend UI run, start Field and Command on unused ports (for
example 6173/6174) with `VITE_API_URL=http://localhost:18080`, submit the
synthetic bridge report at `lat=26.8005,lng=94.5005`, then verify the ACK,
`/api/v1/events/status`, and projection before narrating the UI. Never point an
isolated run at the 8080 log.

## Known bugs and release risks

1. Both worktrees are dirty and no single clean revision represents the full
   integrated state; preserve working changes.
2. Backend request parsing is not full runtime contract validation; CORS is
   wildcard and there is no authentication/authorization.
3. JSONL append uses `appendFile` rather than an explicit fsync; malformed log
   lines are skipped on load. Per-origin sequence assignment is not protected
   by a request mutex.
4. The backend immediately equates accepted events with applied projection
   versions; delayed-apply behavior is a client/mock concern, not a server
   guarantee.
5. Some older coordination/technical docs still describe the HTTP adapter as a
   stub or the apps as mock-only. Prefer current source and this handover.
6. Real road connectivity is fragmented; unknown/synthetic data and closed or
   unconfirmed shelters must be visibly labelled in any operational narrative.
7. Current Command layout is intended for a desktop demo; verify narrow/mobile
   layout separately.

## Important pointers

| Concern | Files / functions |
|---|---|
| API lifecycle | `packages/server/src/server.ts`: `handleEventsBatch`, `handleEventsStatus`, `handleProjections`, `handleListEvents`, `handleStream`, `startServer` |
| Translation | `packages/server/src/translation.ts`: `translateEvent`, `locationToMicrodegrees` |
| Persistence | `packages/server/src/event-log.ts`: `EventLog.load`, `append`, `getEventsSince` |
| Fold | `packages/server/src/projection.ts`: `projectSnapshot`, `extractBridgeBlockages`, `buildRoutes`, `computeCutOff` |
| GIS | `packages/server/src/geo-artifacts.ts`: `loadGeoArtifacts`, `buildRouteEdges`, `nearestNode` |
| Core event/sync | `packages/core/src/event/envelope.ts`, `packages/core/src/sync/ingest.ts` |
| Core flood/network/routes | `packages/core/src/project/flood.ts`, `project/network.ts`, `route/dag.ts`, `route/latest-departure.ts`, `route/cutoff.ts` |
| Field HTTP/offline | `frontend/apps/field/src/app/api.tsx`, `src/sync/{queue,engine,db}.ts`, `src/offline/cacheDb.ts` |
| Command HTTP/data | `frontend/apps/command/src/data/client.ts`, `useProjections.ts`, `src/audit/`, `src/map/` |
| Contracts | `frontend/packages/contract/src/events.ts`, `packages/server/src/contract-types.ts` |
| Demo | `scripts/demo.ps1`, `packages/server/data/demo/demo-verification.json` |

## Judge-safe wording

> “SETU is an offline-first, deterministic event-to-impact prototype. The
> connected route used in this demonstration is synthetic and clearly labelled.”

Do not claim that HAND is validated flood prediction, that the real Majuli
graph validates the demo evacuation route, or that the browser demo is
real-backend verified until the pending evidence is captured.
