# 07 — API Contract

This contract is the boundary between Karthik's artifacts, the core fold, Darsh's frontend, and the sync hub. Darsh's frontend may be built against a **mock** of this contract; the mock returns committed JSON fixtures. That is the entire dependency between frontend and backend work — no shared running service is required.

Base URL: `http://localhost:8080` (dev). Content-Type: `application/json`. All timestamps epoch ms.

## 1. Sync — the only write-able endpoint

```
POST /sync
Request:  SyncRequest  { proto, replica_id, vv, push[], limit? }
Response: SyncResponse { proto, from, vv, events[], more, rejected[] }
```

Full schema and behaviour in [04-sync-protocol.md](./04-sync-protocol.md). Idempotent, resumable, supports file export/import (sneakernet) by serialising `SyncResponse` to a gzipped file.

## 2. Read-only projection endpoints

Each returns canonical JSON plus a `revision` header: `sha256(canonicalJson(body))`.

```
GET /projection/flood?as_of=<ms>
-> { stage_h0_dm: number, wet_mask_hash: string,
     inundated_area_m2: number, wet_cells: number,
     disputed_points: [ { point_id, reason } ],
     revision: string }

GET /projection/network?as_of=<ms>&slot=<index>
-> { edges: [ { edge_id, state: "passable"|"impassable"|"restricted"|"disputed",
                depth_dm, pass_slot, blocked_intervals, revision } ],
     nodes: [ { node_id, pass_slot, flooded } ],
     revision: string }

GET /projection/people?as_of=<ms>
-> { clusters: [ { id, members: [person_id], person_count, fields: {...} } ],
     proposals: [ { proposal_id, a, b, score_bp, evidence[], status: pending|accepted|rejected } ],
     disputed: [person_id], revision: string }

GET /projection/reachability?as_of=<ms>&depart_at=<ms>&deadline=<ms>
-> { settlements: [ { settlement_id, shelters: [ { shelter_id,
        reachable: boolean, arrival_slot, t_latest_slot, wait_schedule } ] } ],
     cut_off: [settlement_id], revision: string }

GET /projection/route?from=<node>&to=<node>&depart_at=<ms>
-> { path: [edge_id], eta_seconds, depart_at, waits: [ { node_id, hold_seconds } ],
     replay_passed: boolean, revision: string }

GET /projection/cutoff?as_of=<ms>
-> { settlements: [ { settlement_id, cut_off: boolean, first_submerge_edge, deadline_minutes } ],
     revision: string }
```

## 3. Admin / scenario endpoints (demo driver only)

```
POST /scenario/stage
body: { scenario_id, t_sim_ms, observations: [ { point_id, depth_dm, at } ] }
-> appends scenario.stage + obs.water events; returns event ids

GET /audit/log?from=<offset>&limit=<n>
-> raw event lines (read-only audit view)

GET /health
-> { ok: true, replica_id, vv, event_count, revision }
```

## 4. Mock contract (what Darsh builds against)

`packages/web/mock-api.ts` exposes the same shape as the read-only endpoints, returning `data/fixtures/scenario-a.json` (a committed deterministic Majuli scenario). Switching from mock to live backend is one import swap in `packages/web/src/api.ts`.

Mock behaviour contract:
- deterministic given `as_of` — advancing `as_of` through fixture stages changes inundation, road states, reachability.
- route endpoint returns a path with `replay_passed: true`.
- `/sync` mock stores pushed events and returns them on subsequent pull — enough to demonstrate convergence locally without a server.

## 5. Frontend/backend boundary rules

- Frontend never computes depth, routing, or matching. It renders projections.
- Frontend appends user actions as events via `/sync` (or via the mock, which appends to local storage).
- No float leaves the server in `payload`; coordinates are integer microdegrees.
- All `as_of` values come from the client (a slider or the demo clock) — never from `Date.now()` in the fold.

## 6. Versioning

Contract version `v1` is pinned in `packages/core/src/contract-version.ts`. Breaking changes require a new major version and both sides updated in the same PR.
