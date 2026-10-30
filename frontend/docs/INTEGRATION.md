# Running the SETU apps against the backend

**No mock data at runtime.** Field (`:5173`) and Command (`:5174`) talk to the real backend over
HTTP only. `@setu/mock-backend` is kept for unit tests; apps never import it.

## Environment

| Var | Default | Meaning |
| --- | --- | --- |
| `VITE_API_MODE` | `http` | Adapter. Keep `http`. |
| `VITE_API_URL` | `http://localhost:8080` | Backend base URL (CORS must allow the app origin). |

```sh
cd frontend && npm install
VITE_API_URL=http://localhost:8080 npm run dev -w @setu/field     # :5173
VITE_API_URL=http://localhost:8080 npm run dev -w @setu/command   # :5174
```

## Endpoints used (contract: `coordination/integration-handoff`, wire shapes = `@setu/contract`)

`POST /api/v1/events:batch`, `POST /api/v1/events/status`, `GET /api/v1/projections?sinceVersion=`
(304 if unchanged), `GET /api/v1/events`, `GET /api/v1/stream` (SSE), `GET /api/v1/health`.

## What each state means

| State | Meaning |
| --- | --- |
| Backend unavailable (`api-unavailable`) | `/health` or `/projections` failed. No data is shown. Field reports stay in the offline queue. |
| No data yet | Backend is up but the snapshot has no features. Counts are not invented. |
| Connection: live / polling / offline / unavailable | SSE connected / SSE down, polling `/projections` every 5 s / device offline / backend unreachable. |
| Queued | Report saved on the device, not yet sent. Syncs automatically when the backend answers. |
| Accepted | Shown **only** once confirmed applied (`isConfirmedSynced`: status `applied`, or projection version >= `acceptedAtVersion`). An `accepted` ack alone is "sending/pending". |
| Duplicate | Same `clientEventId` already recorded; still one event. |
| Conflict / Rejected | Needs human review / validation failed; not retried automatically. |

## Testing without the backend

Tests use the in-memory fake contract server (`@setu/api-client/testing`, started for Playwright by
`packages/api-client/scripts/fake-server.mjs`). It implements only the 6 endpoints above, starts
empty and invents no flood/road logic. Run `cd e2e && npx playwright test`.

## Backend status (issue #22)

The real backend on `coordination/integration-handoff@67e7991` does not run (4 blocking bugs,
tracked in issue #22). Until fixed, the apps show the honest "Backend unavailable" state and reports
queue offline. Re-verify against the real server once #22 closes.
