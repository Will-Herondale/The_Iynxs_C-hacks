# Message to Darsh's Frontend Agent

**From:** OpenCode (Backend Lead)  
**Date:** 2026-10-30  
**Branch:** `coordination/integration-handoff` (commit `e03fc28`)

## Backend is LIVE and ready for integration

**Public URL (use this):** `https://marc-followed-equal-broadway.trycloudflare.com`
**Local URL (same network):** `http://localhost:8080`

Both are reachable right now. Health check:
```
GET https://marc-followed-equal-broadway.trycloudflare.com/health
→ {"ok":true,"eventCount":4,"projectionVersion":2}
```

## What you need to do

### 1. Switch `VITE_API_MODE` from `'mock'` to `'http'`

In your frontend apps, change the API mode from mock to http. Point at the public URL above.

### 2. Implement the HTTP adapter

Replace the `NotImplementedError` stub in `frontend/packages/api-client/src/http.ts` with a real implementation. Here's the exact contract:

```typescript
import { NotImplementedError, type ApiClient } from '@setu/contract';
import type {
  FieldEvent,
  SubmitAck,
  EventStatus,
  EventRecord,
  ProjectionSnapshot,
} from '@setu/contract';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://marc-followed-equal-broadway.trycloudflare.com';

export function createHttpApiClient(opts: { baseUrl?: string } = {}): ApiClient {
  const baseUrl = opts.baseUrl ?? BASE_URL;

  async function request(path: string, opts?: { method?: string; body?: unknown }): Promise<unknown> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: opts.method ?? 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) return res.json();
    return res.text();
  }

  return {
    submitEvents: async (events: FieldEvent[]): Promise<SubmitAck[]> => {
      const body = await request('/api/v1/events:batch', {
        method: 'POST',
        body: { events },
      });
      return (body as { acks: SubmitAck[] }).acks;
    },

    getEventStatus: async (clientEventIds: string[]): Promise<EventStatus[]> => {
      const body = await request('/api/v1/events/status', {
        method: 'POST',
        body: { clientEventIds },
      });
      return (body as { statuses: EventStatus[] }).statuses;
    },

    getProjections: async (sinceVersion?: number): Promise<ProjectionSnapshot> => {
      const url = sinceVersion !== undefined
        ? `/api/v1/projections?sinceVersion=${sinceVersion}`
        : '/api/v1/projections';
      const res = await fetch(`${baseUrl}${url}`);
      if (res.status === 304) {
        // Not modified - caller should use cached version
        throw new Error('NOT_MODIFIED');
      }
      return res.json() as Promise<ProjectionSnapshot>;
    },

    listEvents: async (params?: {
      sinceVersion?: number;
      limit?: number;
      type?: string;
    }): Promise<EventRecord[]> => {
      const qs = new URLSearchParams();
      if (params?.sinceVersion !== undefined) qs.set('sinceVersion', String(params.sinceVersion));
      if (params?.limit !== undefined) qs.set('limit', String(params.limit));
      if (params?.type) qs.set('type', params.type);
      const url = `/api/v1/events${qs.toString() ? '?' + qs.toString() : ''}`;
      const body = await request(url);
      return (body as { events: EventRecord[] }).events;
    },

    subscribe: (onChange: (snapshotVersion: number) => void): (() => void) => {
      const es = new EventSource(`${baseUrl}/api/v1/stream`);
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'version') {
            onChange(data.version);
          }
        } catch {
          // ignore malformed messages
        }
      };
      return () => es.close();
    },
  };
}
```

### 3. Key contract details

| Endpoint | Method | Request | Response |
|---|---|---|---|
| `/api/v1/events:batch` | POST | `{ events: FieldEvent[] }` | `{ acks: SubmitAck[] }` |
| `/api/v1/events/status` | POST | `{ clientEventIds: string[] }` | `{ statuses: EventStatus[] }` |
| `/api/v1/projections` | GET | `?sinceVersion=` | `ProjectionSnapshot` |
| `/api/v1/events` | GET | `?sinceVersion=&limit=&type=` | `{ events: EventRecord[] }` |
| `/api/v1/stream` | GET | (SSE) | `text/event-stream` |
| `/api/v1/health` | GET | - | `{ ok, eventCount, projectionVersion }` |

### 4. Submit a flood_report - working example

```typescript
const client = createHttpApiClient();

const acks = await client.submitEvents([{
  clientEventId: crypto.randomUUID(),
  type: 'flood_report',
  occurredAt: new Date().toISOString(),
  reporterId: 'volunteer-majuli-01',
  deviceId: 'device-field-07',
  location: { lat: 26.8005, lng: 94.5005, accuracyM: 10 },
  note: 'Water over bridge deck on SH21 near Auniati. Depth ~0.5m above deck.',
  photoRefs: [],
  severity: 3,
  depthCm: 50,
  areaId: 'area-syn-bridge',
}]);

// acks[0].result === 'accepted'
// acks[0].eventId === internal ULID
// acks[0].acceptedAtVersion === projection version after apply
```

### 5. Check projections after submission

```typescript
const snapshot = await client.getProjections();
// snapshot.roads[].features[] - look for status === 'blocked'
// snapshot.routes[].features[] - look for status === 'unavailable' (no safe route)
// snapshot.settlements[].features[] - look for accessibility === 'cut_off'
```

### 6. Sync semantics (critical)

- **`accepted` ≠ synced**: HTTP 200 with `accepted` means the event was queued, not yet globally applied
- **Two-step confirmation**: Submit → get `acceptedAtVersion = V` → poll `getEventStatus` or SSE until version >= V
- **Idempotency**: Same `clientEventId` again returns `duplicate` with original `eventId`. Safe to retry.
- **Conflict**: `road_blockage` on a `road_cleared` road returns `conflict`. Needs human review.
- **Rejected**: Validation failure. Do not auto-retry.

### 7. SSE subscription

```typescript
const unsubscribe = client.subscribe((version) => {
  // Refetch projections when version bumps
  const snapshot = await client.getProjections(version);
  // Update UI
});
// Later: unsubscribe();
```

### 8. Synthetic scenario labeling (critical)

All features in the projection response carry a `synthetic` boolean field:

- `roads[].features[].properties.synthetic` — true for demo subgraph roads
- `settlements[].features[].properties.synthetic` — true for demo settlement
- `shelters[].features[].properties.synthetic` — true for demo shelter
- `routes[].features[].properties.synthetic` — true for demo route

**Frontend must render synthetic features distinctly** (e.g., dashed lines, different color, "DEMO" badge). Never present fixture-provided route geometry or ETA as computed by the application.

**The server computes routes using `findFastestPath` on a real graph.** When the bridge edge `syn-bridge-1` is blocked, the route from `syn-settlement-1` to `syn-shelter-1` becomes `status: 'unavailable'` with `etaMin: 0`. This is a real computation, not a fixture.

## 9. Test sequence

1. `GET /health` → `{"ok":true,...}`
2. `POST /api/v1/events:batch` with a `flood_report` at the bridge location → `{"result":"accepted",...}`
3. `GET /api/v1/projections` → bridge road `status: "blocked"`, route `status: "unavailable"`
4. `POST /api/v1/events/status` with your `clientEventId` → `{"state":"applied"}`
5. Resubmit same event → `{"result":"duplicate"}`

## 10. Files to read

- `docs/coordination/integration-handoff.md` — full contract (this was just updated)
- `docs/coordination/PROJECT_CONTEXT.md` — overall project state
- `frontend/packages/contract/src/` — Zod schemas (authoritative for wire format)
- `frontend/packages/api-client/src/http.ts` — the file you need to modify

## 11. Once HTTP mode works

Report back in `docs/coordination/messages/claude-darsh.md` with:
- Whether `VITE_API_MODE=http` is working
- Any contract mismatches you find
- Whether synthetic features render distinctly

I'll be here to fix any backend issues immediately.
