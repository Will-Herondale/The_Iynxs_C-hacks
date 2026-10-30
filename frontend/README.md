# SETU Frontend

Offline-capable field app and command centre for SETU disaster response.

## Layout

```
frontend/
  apps/field        volunteer field app (Team Field)
  apps/command      command centre (Team Command)
  e2e/              end-to-end tests
  packages/
    contract/       @setu/contract    zod schemas, inferred types, ApiClient interface, typed errors
    api-client/     @setu/api-client  createApiClient({mode:'mock'|'http'}); http adapter is a stub
    mock-backend/   @setu/mock-backend in-process test double + dev relay (NOT an event engine)
    ui/             @setu/ui          React 19 components + CSS tokens (react is a peer dep)
  docs/API_CONTRACT.md  DRAFT contract for backend review (endpoints are PROPOSED only)
```

Apps talk to the backend **only** through the `ApiClient` interface. Choose the adapter with
`createApiClientWithMock(import.meta.env.VITE_API_MODE)` (default `mock`; `http` throws
`NotImplementedError("pending API contract sign-off")` until the contract is signed off).
The frontend never computes projections, routes or accessibility; it renders what the API returns.

## Scripts (run in `frontend/`)

| Script | What |
| --- | --- |
| `npm install` | install all workspaces (apps/e2e globs may be empty) |
| `npm run build` | `tsc -b` every package into `dist/` |
| `npm run typecheck` | build, then typecheck sources and tests |
| `npm test` | Vitest (workspace packages resolve to source) |
| `npm run lint` | ESLint |

## Sync semantics

HTTP success is not global sync. `submitEvents` returns per-item acks (`accepted`, `duplicate`,
`conflict`, `rejected`). An `accepted` event is `synced` only once the projection/event feed reaches
`version >= acceptedAtVersion` (use `getEventStatus` / `subscribe`). `@setu/ui`'s `<SyncStatusBadge>`
shows every state with its own colour, icon and text.

## Mock failures and sync delay

The mock acks as `accepted` immediately and applies the event to the feed/projections after
`applyDelayMs` (default 1500). Flip failure modes at runtime:

- URL: `?mock=offline,latency=800,fail5xx=0.3,timeout=0.1,conflict=blockage_on_cleared_road,reject=always,delay=3000`
  (saved to localStorage; `?mock=reset` clears it)
- Code/console: `configureMock({ latencyMs, failRate5xx, timeoutRate, conflictRule, rejectRule, offline, applyDelayMs })`
- `resetMock()` restores the seed scenario.

## Cross-app mock sync (field tab -> command tab)

The two Vite apps run on different ports, i.e. different origins, so `BroadcastChannel` and
`localStorage` do not cross between them. **Choice: a zero-dependency dev relay** started by a Vite
plugin that both dev servers use (the first to start owns it, the other reuses it). See
`packages/mock-backend/README.md` for the exact snippet:

```ts
// apps/*/vite.config.ts
import { setuMockRelay } from '@setu/mock-backend/relay';
export default defineConfig({ plugins: [react(), setuMockRelay()] });
```

Same-origin tabs also sync over `BroadcastChannel('setu-mock')`.
