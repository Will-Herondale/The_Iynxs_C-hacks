# @setu/mock-backend

In-process **test double** for the SETU API. Not an event engine: projection changes come from a
scripted lookup table (`src/seed`) over a **Majuli** seed — e.g. a report at the S1 bridge → bridge impassable, crossing routes
`unavailable`, precomputed alternates `recalculated` — and `road_cleared` reverts it (see "Majuli seed" below). No fetch/URLs in the
`ApiClient` adapter.

```ts
import { createApiClient } from '@setu/api-client';
import { createApiClientWithMock } from '@setu/mock-backend';
const api = import.meta.env.VITE_API_MODE === 'http' ? createApiClient({ mode: 'http' }) : createApiClientWithMock();
```

Sync: `submitEvents` acks `accepted` immediately (`acceptedAtVersion` = the projection version the event
will have once applied). After `applyDelayMs` (default 1500) the event is `applied` and the projection
version advances; `subscribe` fires then. Duplicate `clientEventId` → `duplicate` with the same `eventId`.

## Failure toggles
`configureMock({latencyMs, failRate5xx, timeoutRate, conflictRule, rejectRule, offline, applyDelayMs})`,
or URL `?mock=offline` / `?mock=latency:800,5xx:0.3,timeout:0.2,conflict,reject,delay:3000`
(persisted in localStorage; `?mock=off` clears). `resetMock()` restores the seed.

## Cross-app sync (field ↔ command)
The apps run on different ports = different origins, so BroadcastChannel/localStorage do not cross.
**Chosen approach:** a dev relay (zero dependencies, `127.0.0.1:5199`, SSE + compare-and-set) hosted by a
Vite plugin used by both dev servers; the first dev server hosts it, the other reuses it. The plugin
injects `globalThis.__SETU_MOCK_RELAY__` into `index.html`, and `createApiClientWithMock()` connects
automatically (falls back to local-only if the relay is down). Same-origin tabs also use `BroadcastChannel('setu-mock')`.

```ts
// apps/field/vite.config.ts and apps/command/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { setuMockRelay } from '@setu/mock-backend/relay';
export default defineConfig({ plugins: [react(), setuMockRelay()] });
```

## Majuli seed (SYNTHETIC)
`src/seed/fixtures/*.json` are generated at **build time** by `scripts/build-fixtures.mjs` from the bundled `@setu/geo` data
(Karthik's OSM/DDMA layers, branch `data/karthik`). Never run in the browser; no routing, flooding or accessibility is computed at runtime.

| Fixture | Content |
|---|---|
| `roads.json` | curated network: trunk/primary/secondary/tertiary + bridges ≥ 30 m on them (`roadId` = `String(osm_id)`, `kind` road\|bridge) |
| `settlements.json` | village/hamlet/town on the island (`settlementId` = `String(osm_id)`); population is published for ~1 of 62 places, `0` = *not published* |
| `shelters.json` | the 23 DDMA camps (`shelterId` = `MJ-SH-0xx`); `capacity 0 / occupancy 0 / open false` = *not published* |
| `flood-83.8.json`, `flood-85.3.json` | interim **synthetic DEM-threshold** polygons (`DEM ≤ level`, island-clipped), `confidence: modelled`. Not a hydraulic simulation; pending Karthik/OpenCode |
| `routes.json` | evacuation routes precomputed by a build-time Dijkstra (static geometry, `etaMin` from length and class speed) plus S1/S2 alternates |

Baseline snapshot: no flood extent; all roads open; all baseline routes `active`. Scripted rules (`src/seed/rules.ts`), all SYNTHETIC:

- **S1** bridge `284824410` (deck ≈ 84.8 m, level 85.3 m). `road_blockage` (full) or any `water_level` within 300 m of it: bridge `blocked`/`impassable`, `reason` "Submerged — water level 85.3 m above deck ≈84.8 m (synthetic S1)" + report time; routes crossing it `unavailable` with a `refusal`, alternates added as `recalculated`; far-side settlements `limited` with a `cutOffReason`; flood switches to the 85.3 m polygons.
- **S2** road `1074461062` (200 m closure near camp `MJ-SH-009`). `road_blockage` (full): road `blocked`, the route to `MJ-SH-009` refused, alternate added.
- **S4** Auniati `10692764768` (DEM 82.3 m, level 83.8 m). `water_level` within 1.5 km with `levelCm ≥ 150`. Mapping: `levelCm` is water depth above local ground, so scenario level = 82.3 m + `levelCm`/100 (150 cm → 83.8 m). Flood → 83.8 m polygons; Auniati `cut_off` with `cutOffReason`, `evacuationDeadline` (event time + 3 h), priority `critical`; every route from Auniati `unavailable`, no alternate (the "no safe route" state). A lower reading reverts it.
- `road_cleared` reverts the road, its settlements and routes; the flood falls back to whichever scenario still holds it (S1 outranks S4).
- Flood area ids are `flood-s4-<nnn>` (83.8 m) and `flood-s1-<nnn>` (85.3 m). `depthCm`/`severity` come from the fixture builder (level minus DEM terrain): synthetic, `confidence: modelled`, not hydraulic modelling.
- An alternate that itself crosses a blocked road is not offered (e.g. the S2 alternate also uses the S1 bridge); the refusal then stands with no replacement.

Regenerate fixtures with `node packages/mock-backend/scripts/build-fixtures.mjs` (needs `@setu/geo` data and the DEM from `origin/data/karthik`).
Still a lookup table, not an engine: unknown patterns change nothing.
