# SETU frontend — final delivery check (2026-10-30)

Run against OpenCode's live backend (`VITE_API_URL`, not hard-coded) with the bundled Majuli data. Screenshots: `docs/final/`.

## Workflow verified (headless, production build of Field, live backend)
| Step | Result |
|---|---|
| Field loads online, service worker installs | ✅ status `online` |
| Go offline, reload | ✅ app shell loads from cache, status `offline` |
| File a flood report offline | ✅ "Saved locally" |
| Reload while offline | ✅ report still pending (`queued`) |
| Reconnect | ✅ report reaches the live backend and shows `synced` (Accepted); last-synced shown |
| Command centre | ✅ connection `live`; the situation bar and the Settlements, Routes and Events views render from the live projection |
| External network requests | ✅ none (only localhost and the backend) |

## REAL / SYNTHETIC
- Layer toggles and the legend carry REAL / SYNTHETIC / EXPERIMENTAL tags.
- **New:** features the backend flags `synthetic: true` (the demo settlement, route and shelter) show a `DEMO · SYNTHETIC` tag and `data-class="synthetic"` in the Settlements and Routes sections and the lists, plus a purple halo on the map. `synthetic` is an optional `@setu/contract` field, documented in OpenCode's integration handoff §8; the live server now sends it.

## Not demonstrable / blockers
1. **Route before closure vs after closure.** The backend's event log is persistent and the demo closure was already applied by earlier test events, so the live data is permanently in the "after" state. A "before" view needs a reset or a scenario namespace from OpenCode.
2. **"No route after closure" shows as "No safe route"**, not "destination unreachable": all 9 routes are `unavailable` with `etaMin: 0`, including 8 real-network routes. The backend gives no per-route reason (issue #26).
3. `GET /api/v1/events`: records whose `clientEventId` is an internal ULID (non-wire events) fail contract validation, so the Events view can't list them (issue #22).
4. The demo road `syn-bridge-1` is not flagged `synthetic`, and bridge `284824410` appears twice in the road layer.
5. Phase 2 of the device exchange (local projections via `@setu/core`) is blocked on OpenCode (issue #23).
6. Not done: a "local view is not the district-wide picture" notice; an embankments layer; the `/health` path in the connectivity probe.
