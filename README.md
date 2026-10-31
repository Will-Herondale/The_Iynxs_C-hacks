# SETU: offline-first flood response (The_Iynxs_C-hacks)

SETU helps volunteers and coordinators respond to floods. The demo district is **Majuli, Assam**.

- **Field app**: volunteers file reports from a phone, offline-capable, synced when a connection returns.
- **Command Centre**: coordinators see the live district situation: flood areas, roads, settlements, routes and the event log.

## Repository map

Some of these folders arrive on `main` when their PRs merge: `frontend/` with PR #14 and `data/` with PR #16. Until then, find them on the `frontend/main` and `data/karthik` branches.

| Path | What | Owner |
|---|---|---|
| `frontend/` | Field app, Command Centre and shared packages (React, TypeScript, Vite) | Frontend |
| `data/` | Majuli geospatial data foundation | GIS / data |
| `docs/` | Coordination notes between the frontend, backend and GIS work | all |
| `TECH_STACK.md` | Tech stack: frontend and backend sections | Frontend, backend |
| `techstack.md` | GIS and data tech stack | GIS / data |

The backend lives in its own directories and is documented by its owner.

## Frontend

- Run and demo: `frontend/docs/DEMO.md`
- Connect to a backend: `frontend/docs/INTEGRATION.md`
- Final delivery notes and known limits: `frontend/docs/FINAL_DELIVERY.md`
- Package layout and scripts: `frontend/README.md`

Build the apps with `VITE_API_URL=<backend URL>`. The URL is baked in at build time and is never hard-coded.

## Principles

- No mock data at runtime. The apps render only what the backend returns.
- Data honesty: every layer is tagged REAL, SYNTHETIC or EXPERIMENTAL. Shelters are "pre-identified, not confirmed" and routes are "not verified" unless the backend says otherwise.
- "Synced" means the server confirmed the event was applied, not just that a request succeeded.

## Branches

- `main`: the integrated branch.
- `frontend/main`: the frontend line; PR #14 merges it into `main`.
- `data/karthik`, `coordination/*`: GIS and coordination work.

## Not built yet

Chat, photo upload, household and resource features, JSONL export and import, device-to-device sync.
