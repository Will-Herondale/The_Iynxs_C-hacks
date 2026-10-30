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
  (`#/report`, `#/household`, `#/queue`), `ApiProvider` (`api.tsx`), reporter/device ids (`identity.ts`, localStorage).
- `src/sync/`: queue + sync engine (Dexie, backoff, Web Locks). Public API in `src/sync/index.ts`.
- `src/features/report`, `household`: forms (react-hook-form + zod from `@setu/contract`); submit = `enqueue()`.
- `src/features/queue`: queue screen, conflict panel, header widgets.

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
