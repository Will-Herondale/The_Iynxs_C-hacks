# @setu/mock-backend

In-process **test double** for the SETU API. Not an event engine: projection changes come from a
scripted lookup table (`src/seed`) — e.g. `road_blockage` on R7 → R7 blocked, S3 `cut_off`,
EVAC-2 `unavailable`, EVAC-2b `recalculated` — and `road_cleared` reverts it. No fetch/URLs in the
`ApiClient` adapter.

```ts
import { createApiClient } from '@setu/api-client';
import { createApiClientWithMock } from '@setu/mock-backend';
const api = import.meta.env.VITE_API_MODE === 'http' ? createApiClient({ mode: 'http' }) : createApiClientWithMock();
```

Sync: `submitEvents` acks `accepted` immediately (`acceptedAtVersion` = the projection version the event
will have once applied). After `applyDelayMs` (default 1500) the event is `applied` and the projection
version advances; `subscribe` fires then. Duplicate `clientEventId` → `duplicate` with the same `eventId`.

## Failure toggles
`configureMock({latencyMs, failRate5xx, timeoutRate, conflictRule, rejectRule, offline, applyDelayMs})`,
or URL `?mock=offline` / `?mock=latency:800,5xx:0.3,timeout:0.2,conflict,reject,delay:3000`
(persisted in localStorage; `?mock=off` clears). `resetMock()` restores the seed.

## Cross-app sync (field ↔ command)
The apps run on different ports = different origins, so BroadcastChannel/localStorage do not cross.
**Chosen approach:** a dev relay (zero dependencies, `127.0.0.1:5199`, SSE + compare-and-set) hosted by a
Vite plugin used by both dev servers; the first dev server hosts it, the other reuses it. The plugin
injects `globalThis.__SETU_MOCK_RELAY__` into `index.html`, and `createApiClientWithMock()` connects
automatically (falls back to local-only if the relay is down). Same-origin tabs also use `BroadcastChannel('setu-mock')`.

```ts
// apps/field/vite.config.ts and apps/command/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { setuMockRelay } from '@setu/mock-backend/relay';
export default defineConfig({ plugins: [react(), setuMockRelay()] });
```
