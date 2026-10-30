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
3. `GET /api/v1/events` (backend frozen at `28296b6`): 21 of 28 records have an internal ULID `clientEventId` and fail contract validation (issue #22). The http client now validates record by record, so the Events and Audit views show the 7 valid records and a visible notice, "21 of 28 server records are not shown", instead of failing entirely.
4. Backend `28296b6` now flags the demo roads `synthetic` (2 road features), and the map highlights them. Bridge `284824410` still appears twice in the road layer.
5. Phase 2 of the device exchange (local projections via `@setu/core`) is blocked on OpenCode (issue #23).
6. Not done: an embankments layer.

## Polish round (2026-10-31)
- **Open demo scenario** (Command → Live Map): zooms to the backend-flagged synthetic subgraph; **Majuli overview** zooms back. Real data is untouched. Screenshots `10`–`11`.
- **Offline honesty** (Field): a notice on every screen whenever the device is offline or the backend is unreachable: this device only knows what is saved on it and is *not* the district-wide situation. Reports read **Local (this device)** or **District (synced)**. Screenshot `12`.
- **Connectivity probe fixed:** it now calls the backend's `GET /health` (base URL from `VITE_API_URL`). Before, it fetched a relative path on the app's own origin and only ran when a `VITE_API_MODE` variable (no longer set) was `http`, so "backend unreachable" could never be detected. Reachability = any HTTP response; `no-cors` so a missing CORS header cannot look like an outage.
- **Two-app demo:** `VITE_API_URL=… npm run demo` starts both apps (see `docs/DEMO.md`).
- **Flaky mock-relay test fixed, not hidden:** the 6 s poll budget exceeded vitest's 5 s default, so load made the *test* time out. It now polls up to 20 s with a 30 s test timeout and a longer connect wait; a broken relay still fails.
- Still blocked: the before/after closure view needs a clean backend state from OpenCode.
