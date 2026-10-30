# @setu/field: SETU volunteer field app

Offline-first PWA for volunteers. Report flooding / road blockages / clearances / water levels and register
households. Everything goes through a local IndexedDB queue (Dexie) first, so online and offline behave the same.

```
npm run dev -w @setu/field      # http://localhost:5173 (strictPort), mock relay on :5199
npm run build -w @setu/field    # tsc + vite build (+ service worker precaching the shell)
npm test                        # from frontend/: includes apps/field/src/**/*.test.*
```

## Structure
- `src/app/`: AppShell layout, header (online-indicator, pending-count, last-synced, sync-now), hash routing
  (`#/report`, `#/household`, `#/camp`, `#/queue`), offline banner, `ApiProvider` (`api.tsx`), reporter/device ids (`identity.ts`, localStorage).
- `src/sync/`: queue + sync engine (Dexie, backoff, Web Locks). Public API in `src/sync/index.ts`.
- `src/features/report`, `household`: forms (react-hook-form + zod from `@setu/contract`); submit = `enqueue()`.
- `src/features/queue`: queue screen (status vocabulary + one-line explanations), conflict panel, header widgets.
- `src/features/camp` (`#/camp`, nav-camp): camp mode. Pick a shelter (SH1..SH3, remembered), see capacity/occupancy
  from the cached snapshot, register households with `shelterId` through the same offline queue, list them with sync status.
- `src/offline`: `useCachedProjections()`: last ProjectionSnapshot in IndexedDB (Dexie), served when offline
  ("data as of ..."). Feeds the road/bridge list (R1..R10 + B1 fallback when no cache) and camp info.

## Status vocabulary
Every `SyncStatusBadge` gets `online`: Saved on device (queued, offline) / Queued for sync / Submitted / Accepted — awaiting
confirmation / Confirmed / Disputed / Rejected / Retrying. Confirmed only once the server applied it (`isConfirmedSynced`).

## Rules it follows
- Backend access ONLY via `ApiClient` (`VITE_API_MODE`: `mock` default | `http`). No fetch to backend URLs.
- No projections/routes computed here. 'synced' only once `getEventStatus` is `applied` with
  `projectionVersion >= acceptedAtVersion` (`isConfirmedSynced`). An ack of `accepted` shows as pending.
- Statuses always rendered with `SyncStatusBadge` (colour + icon + text).

## Mock toggles
`?mock=offline`, `?mock=conflict`, `?mock=reject`, `?mock=5xx:1`, `?mock=delay:3000`, `?mock=off`
(see `frontend/README.md`).

## Offline
`vite-plugin-pwa` (Workbox generateSW) precaches the built shell; the service worker is registered in production
builds only (`npm run build && npm run preview -w @setu/field`). Dev server has no service worker.

Demo tip: the mock is fast, so "Submitted" may flash by. Use `?mock=latency:1500` (e.g. `http://localhost:5173/?mock=latency:1500`) to keep items in the real `sending` state for ~1.5 s. No artificial delay exists in app code.
