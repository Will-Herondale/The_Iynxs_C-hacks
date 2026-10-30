# @setu/command — SETU command centre

Dev: `npm run dev -w @setu/command` (port 5174). Mode from `VITE_API_MODE` (default mock). The app only talks to the backend through `ApiClient`; it renders server projections and never computes routes, flood extent or accessibility.

## Layout
- `src/app` — shell, `situation-summary` bar (plain language from server fields: bridge reason → settlement cut off → evacuate by), Map | Audit switch (`nav-map`, `nav-audit`, `useView`).
- `src/data` — query hooks, `useProvenance(featureId)` (joins `sourceEventIds` with `listEvents`/`getEventStatus`; pure lookup).
- `src/map` — MapLibre layers: flooded / uncertain / blocked / safe / unknown, bridge ✕ markers, cut-off halos, refused vs recalculated routes, blocking-feature highlight, legend.
- `src/panels` — lists (`road-row-*` with `data-kind`/`data-passability`), `explain-cutoff-*`, `explain-refusal-*`, `evac-deadlines`, `provenance-*`.
- `src/audit` — `audit-view` table of all events, filters, reverse lookup of affected features, strict status mapping (applied+confirmed → Confirmed, accepted → Accepted, conflict → Disputed, rejected → Rejected).

## Sync status rule
"Confirmed" only when `serverState` is `applied` and the snapshot version has reached `appliedAtVersion` (and `getEventStatus` agrees). HTTP 2xx / `accepted` is never shown as confirmed.

## Optional contract fields (PROPOSED, issue #6)
Rendered when present, degrade gracefully when absent; never derived in the frontend.

## Demo
Submit `road_blockage` for bridge B1 (`blockage=full`, `cause=submerged`) from the field app (offline, then reconnect). Within ~5 s: B1 blocked, S4 cut off with explanation and evacuation deadline, EVAC-3 refused with explanation. See `docs/demo.png`.
