# SETU — Data and Event Model

## Overview

SETU uses an **event-sourced architecture** where every observation is stored as an immutable event in an append-only JSONL log. Projections are computed deterministically from the event log, ensuring reproducibility and auditability.

## Event Envelope

Every event is stored as an internal `Envelope` with the following structure:

```typescript
interface Envelope {
  v: 1;                          // Schema version
  id: string;                    // ULID - identity only, never trusted for ordering
  origin: string;                // Device that CREATED the event
  seq: number;                   // Gap-free per-origin counter, starts at 1
  hlc: HLC;                      // Hybrid Logical Clock at creation
  vv: Record<string, number>;    // Version vector (causal frontier)
  type: string;                  // Event type (obs.water, obs.road, etc.)
  actor: { id: string; role: string };  // Who created the event
  subject: string | null;        // Canonical entity key (e.g., "edge:way/123456")
  at: number;                    // Epoch ms, observed time (untrusted)
  payload: unknown;              // No floats - integers, strings, booleans, null, arrays, objects
  hash: string;                  // SHA-256 of canonical JSON
  sig: string | null;            // ed25519 signature (optional in v1)
}
```

## Wire Format (FieldEvent)

The frontend submits `FieldEvent` objects via HTTP. These are translated to internal envelopes at the API boundary:

| Wire Format | Internal Format | Reason |
|-------------|-----------------|--------|
| `clientEventId` (UUID) | `client_event_id` in payload | Stable identity for idempotency |
| `occurredAt` (ISO datetime) | `at` (epoch ms integer) | No floats, deterministic sorting |
| `lat`/`lng` (floats degrees) | `lat`/`lng` (microdegrees integers) | No floats |
| `depthCm` (float cm) | `depth_dm` (decimetres integer) | No floats |
| `photoRefs` (string array) | Pass through | No conversion needed |

### Wire Format Schemas

**Flood Report:**
```typescript
{
  clientEventId: string (UUID),
  type: 'flood_report',
  occurredAt: string (ISO datetime),
  reporterId: string,
  deviceId: string,
  location: { lat: number, lng: number, accuracyM?: number },
  note?: string,
  photoRefs?: string[],
  severity: number (1-5),
  depthCm?: number,
  areaId?: string,
}
```

**Road Blockage:**
```typescript
{
  clientEventId: string (UUID),
  type: 'road_blockage',
  occurredAt: string,
  reporterId: string,
  deviceId: string,
  location: { lat, lng, accuracyM? },
  note?: string,
  photoRefs?: string[],
  roadId?: string,
  blockage: 'partial' | 'full',
  passableBy?: ('foot' | 'bike' | 'car' | 'truck')[],
  cause?: 'submerged' | 'debris' | 'collapse' | 'damage' | 'other',
}
```

## Event Lifecycle

1. **Creation**: Volunteer submits event via field app
2. **Validation**: Frontend validates against Zod schemas
3. **Translation**: Backend translates wire → internal envelope
4. **Append**: Event appended to JSONL log with content hash
5. **Projection**: Projection fold recomputes flood, roads, settlements, routes
6. **Broadcast**: SSE version bump notifies subscribers
7. **Retrieval**: Frontend fetches updated projections

## Sync Protocol

- **Version Vectors**: Track causality across devices
- **Hole Healing**: Missing events can be backfilled
- **Duplicate Delivery**: Same event delivered multiple times → idempotent
- **Collision Detection**: Same origin+seq → conflict
- **64KB Max Event**: Prevents overly large events

## Event Record (Wire Output)

When the frontend fetches events via `GET /api/v1/events`, each record includes:

```typescript
interface EventRecord {
  eventId: string;              // Internal ULID
  event: FieldEvent;            // Wire format event
  serverState: 'accepted' | 'applied' | 'conflict' | 'rejected';
  receivedAt: string (ISO datetime);
  appliedAtVersion?: number;    // Projection version when applied
}
```

## Important Design Rules

1. **No floats in internal envelopes**: All numeric values are integers (microdegrees, decimetres, epoch ms)
2. **ULID for IDs**: Time-ordered, sortable, collision-resistant
3. **HLC for causality**: Captures causality without requiring synchronized clocks
4. **Content hash**: SHA-256 over canonical JSON for integrity
5. **ClientEventId stability**: UUID v4, stable across retries and device transfers
6. **Internal IDs are ULIDs**: Never exposed to frontend as client-facing IDs

## Audit Trail

Every event creates an immutable audit trail:
1. Who reported it (reporterId, deviceId)
2. When it was observed (at, epoch ms)
3. What was observed (type, payload)
4. When it was received (receivedAt)
5. When it was applied (appliedAtVersion)
6. Content integrity (SHA-256 hash)

Conflicting reports are preserved with `disputed: true` flag — never silently overwritten.
