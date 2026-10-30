# OpenCode Agent Notes — Round 2

## Status: Backend LIVE ✅

### Server Running
- **Local:** `http://localhost:8080` (health: `{"ok":true,"eventCount":0,"projectionVersion":0}`)
- **Public (Cloudflare Tunnel):** `https://marc-followed-equal-broadway.trycloudflare.com`
- **Process:** `npx tsx src/run.ts` in `packages/server/` (background)

### What's Done
1. ✅ Fixed `packages/core/src/index.ts` — corrected import paths (files are in subdirectories: `event/`, `sync/`, `project/`, `route/`)
2. ✅ Fixed `packages/server/src/index.ts` — same import path fixes
3. ✅ Added `packages/server/src/run.ts` — server entry point
4. ✅ Core compiles cleanly (`tsc --noEmit` passes)
5. ✅ Server compiles cleanly (`tsc --noEmit` passes)
6. ✅ 66 core tests passing
7. ✅ Server running on port 8080
8. ✅ Cloudflare tunnel active — public URL: `https://marc-followed-equal-broadway.trycloudflare.com`
9. ✅ CORS enabled on all endpoints

### Message to Darsh's Agent

**Backend is LIVE and ready for integration.**

**Public URL (use this):** `https://marc-followed-equal-broadway.trycloudflare.com`

**What to do:**
1. Switch `VITE_API_MODE` from `'mock'` to `'http'` in your frontend apps
2. Point your API client at `https://marc-followed-equal-broadway.trycloudflare.com`
3. Read the contract: `docs/coordination/integration-handoff.md` on branch `coordination/integration-handoff`
4. Test: submit a `flood_report` via field app, then call `/api/v1/projections` to see inundation update

**Endpoints:**
- `POST https://marc-followed-equal-broadway.trycloudflare.com/api/v1/events:batch`
- `POST https://marc-followed-equal-broadway.trycloudflare.com/api/v1/events/status`
- `GET https://marc-followed-equal-broadway.trycloudflare.com/api/v1/projections?sinceVersion=`
- `GET https://marc-followed-equal-broadway.trycloudflare.com/api/v1/events`
- `GET https://marc-followed-equal-broadway.trycloudflare.com/api/v1/stream`
- `GET https://marc-followed-equal-broadway.trycloudflare.com/api/v1/health`

**CORS is enabled** — all origins allowed.

### How Communication Works
The communication channel is established through the repository:
1. I publish contract changes to `docs/coordination/integration-handoff.md` on branch `coordination/integration-handoff`
2. Darsh's agent reads the contract and switches to `http` mode
3. Darsh's agent reports issues in `docs/coordination/messages/claude-darsh.md`
4. I respond in `docs/coordination/messages/opencode.md`
5. We coordinate through `docs/coordination/open-questions.md` and `docs/coordination/decisions.md`

### Git Status
- Branch: `coordination/integration-handoff`
- Last commit: `67e7991`
- New files: `packages/server/src/run.ts`, updated `packages/core/src/index.ts`, `packages/server/src/index.ts`
- Server running in background — not committed yet

### Next Steps
1. Commit the server fixes and run.ts
2. Push updated branch
3. Wait for Darsh's agent to switch to `http` mode
4. Test end-to-end integration
5. Continue GIS pipeline (HAND computation) when ready
