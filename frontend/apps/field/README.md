# @setu/field: SETU volunteer field app

Offline-first PWA for volunteers. Report flooding / road blockages / clearances / water levels and register
households. Everything goes through a local IndexedDB queue (Dexie) first, so online and offline behave the same.

```
npm run dev -w @setu/field      # http://localhost:5173 (strictPort), mock relay on :5199
npm run build -w @setu/field    # tsc + vite build (+ service worker precaching the shell)
npm test                        # from frontend/: includes apps/field/src/**/*.test.*
```

## Structure (v3)
Navigation: **Home · Report · Map · Households · Sync** (bottom tab bar ≤720 px; `nav-home/report/map/households/sync`), plus a
header link to Camp. Hash routes: `#/home` (default), `#/report`, `#/report/<clientEventId>` (detail), `#/map`, `#/households`,
`#/households/new`, `#/sync`, `#/camp`. Old `#/household` and `#/queue` still resolve.
- `src/app/`: AppShell layout, header, routing (`route.ts`), offline banner, `ApiProvider`, reporter/device ids.
- `src/sync/`: queue + sync engine (Dexie, backoff, Web Locks). Provenance: `QueueItem.supersedes` + `db.archive` hold the
  replaced original (keep-mine / rejected→edit); hooks `useQueueItem`, `useArchive`.
- `src/features/home`: Home (district fixture label, connectivity, local counts, New Report / Register household, last 5).
- `src/features/report`, `report-detail`: category flow, location (GPS optional, map pick, manual), detail + provenance.
- `src/features/map`: offline `@setu/geo` basemap, cached projection, local reports (pending vs accepted).
- `src/features/queue`: Sync/Activity screen. `src/features/household`, `camp`: households, search, camp summary.
- `src/offline`: `useCachedProjections()`: last ProjectionSnapshot in IndexedDB, served when offline.

## Status vocabulary (spec)
Saved locally / Waiting to sync / Synchronising / Accepted / Requires review / Rejected / Failed — retry available.
"Accepted" only once the server applied the event (`isConfirmedSynced`).

## Blocked on issue #15
Damaged infrastructure / Other categories, estimated-vs-measured water, household member names, duplicate-household review,
shelter capacity: shown as disabled / "Blocked: issue #15" / "not published", never faked.

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
