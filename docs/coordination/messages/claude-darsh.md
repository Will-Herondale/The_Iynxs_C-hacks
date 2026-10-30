# SETU — Agent Message: Claude-Darsh (frontend agent)

**This replaces the stale copy on this branch.** Yes — the frontend agent received your handoff and has replied, but only on the frontend's own branches and GitHub issues, which your agent isn't checking. Please read these from now on:

| Where | What |
|---|---|
| Branch `frontend/main` (head via `git fetch origin frontend/main`) | Full status in `docs/coordination/messages/claude-darsh.md` (update 5) |
| Issues #2, #5, #6, #15, #22, #23, #26 | The frontend's requests and findings (all open) |
| PRs #24 (http integration), #25 (offline PWA), #27 (data honesty) | Merged into `frontend/main` |

## Status (2026-10-30)
- **http mode is live in the code.** Both apps default to `createApiClient({mode:'http'})` with `VITE_API_URL` (the tunnel URL is not hard-coded). The mock relay is removed from the apps, and the apps show only real data. Mock data stays for unit tests.
- `@setu/contract` zod schemas validate every response. SSE `/api/v1/stream` is `subscribe`, falling back to polling `/projections?sinceVersion=` every 5 s.
- Offline-first PWA is merged: installable, IndexedDB queue, retries that never change `clientEventId`, stale-data warnings.
- Data honesty (after Karthik's findings): shelters are shown as 'Pre-identified · not confirmed', and fixture ETAs/routes as 'not verified'.

## Findings against the live tunnel (read-only, plus ONE tagged test event)
1. **Rejected valid events.** `POST /api/v1/events:batch` with a valid `flood_report` (no `areaId`) returns `rejected`: `Append failed: contentHash: payload contains floats at area_id`. The same bug class as before (`passable_by` for a `road_blockage` without `passableBy`). Omitted **optional** fields seem to reach the content hash as non-integers. Then `/events/status` returns `unknown`.
2. **`GET /api/v1/events` returns the internal envelope** (`{"type":"obs.water","point_id":…,"depth_dm":…}`) in `event`. The contract says `event` is a wire `FieldEvent` and the record is `{eventId, event, serverState, receivedAt, appliedAtVersion}`. Our zod validation will reject these.
3. **Health path.** `GET /health` returns 200, but the doc §3.6 says `/api/v1/health` (404). Please align the doc, or add the route. The frontend doesn't depend on it.
4. `GET /api/v1/stream` sends nothing until the first bump (no initial `version` event), so clients can't tell a live stream from a dead one. Please send an initial `data: {"type":"version","version":N}`.
5. Karthik found that routes and ETAs in the fixtures are not computed. The frontend now shows every route as 'not verified'. Issue #26 asks for a per-route provenance signal.

## Requests
- Fix 1 and 2 first; they block end-to-end sync. Tell us the commit.
- Answer #15 (contract needs), #23 (JSONL export/import schema) and #26 (route provenance).

## Test event
I submitted exactly one test event: `clientEventId cd708dda-d663-4da1-8c19-60102ade085f`, reporter `frontend-contract-test`, note 'CONTRACT TEST … not a real observation'. It was rejected (see 1), so nothing was written.
