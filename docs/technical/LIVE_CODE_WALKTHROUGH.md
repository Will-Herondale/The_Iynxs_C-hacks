# SETU — Live Code Walkthrough

This document provides a step-by-step walkthrough of the most important code execution path in SETU:

**Volunteer observation → field app → internal envelope → event log → projection fold → routing → frontend display**

## Overview

When a volunteer reports "water is 0.5m over the bridge deck," the following happens:

1. **Frontend**: Volunteer submits flood report via field app
2. **Translation**: Wire format → internal envelope
3. **Event Log**: Event appended to JSONL with content hash
4. **Projection Fold**: Flood, roads, settlements, routes recomputed
5. **Frontend**: Projection snapshot displayed in command centre

---

## Step 1: Volunteer Submits Observation

### Frontend Code: `frontend/packages/api-client/src/http.ts`

The frontend creates a `FieldEvent` matching the wire contract:

```typescript
const event: FieldEvent = {
  clientEventId: crypto.randomUUID(),  // UUID v4
  type: 'flood_report',
  occurredAt: new Date().toISOString(),  // ISO datetime
  reporterId: 'volunteer-majuli-01',
  deviceId: 'device-field-07',
  location: { lat: 26.8005, lng: 94.5005, accuracyM: 10 },  // floats
  note: 'Water over bridge deck',
  photoRefs: [],
  severity: 3,
  depthCm: 50,  // float centimetres
  areaId: 'area-syn-bridge',
};
```

The frontend validates against `FieldEventSchema` (Zod) before sending.

### Key File: `frontend/packages/contract/src/events.ts`

Defines the wire format schema. Key fields:
- `clientEventId`: UUID v4 string
- `occurredAt`: ISO datetime string
- `location`: `{lat: number, lng: number}` (floats in degrees)
- `depthCm`: float centimetres
- `areaId`: optional string

---

## Step 2: Translation — Wire Format → Internal Envelope

### Backend Code: `packages/server/src/translation.ts`

The server translates the wire event to an internal envelope:

```typescript
export function translateEvent(event: FieldEvent): EnvelopeInput {
  const s = hlcInitial();
  const now = s.l;

  const payload: Record<string, unknown> = {};

  switch (event.type) {
    case 'flood_report': {
      const e = event as FloodReport;
      const loc = locationToMicrodegrees(e.location);
      payload.type = 'obs.water';
      payload.client_event_id = e.clientEventId;  // UUID preserved
      payload.point_id = e.areaId ?? `point-${e.clientEventId}`;
      payload.depth_dm = e.depthCm !== undefined ? Math.round(e.depthCm / 10) : 0;  // cm → dm
      payload.ref_kind = 'bridge_deck';
      payload.confidence = 80;
      payload.severity = e.severity;
      payload.lat = loc.lat;  // microdegrees integer
      payload.lng = loc.lng;
      break;
    }
    // ... other event types
  }

  const envInput: EnvelopeInput = {
    origin: base.deviceId,
    seq: 1, // assigned by log on append
    hlc: { l: now, c: 0 },
    vv: {},
    type: payload.type as string,
    actor: { id: base.reporterId, role: 'volunteer' },
    subject: `${payload.type}:${payload.person_id || payload.edge_id || payload.point_id}`,
    at: toEpochMs(base.occurredAt),  // ISO → epoch ms
    payload: stripUndefined(payload),  // remove undefined values
  };

  return envInput;
}
```

**Key Transformations:**

| Wire Format | Internal Envelope | Reason |
|-------------|-----------------|--------|
| `clientEventId` (UUID) | `client_event_id` in payload | Stable identity, not used as internal ID |
| `occurredAt` (ISO) | `at` (epoch ms integer) | No floats, deterministic sorting |
| `lat`/`lng` (floats degrees) | `lat`/`lng` (microdegrees integers) | No floats |
| `depthCm` (float cm) | `depth_dm` (decimetres integer) | `depthCm / 10`, no floats |
| `photoRefs` (string array) | Pass through | No conversion needed |

### Why This Matters

The internal envelope uses only integers, strings, booleans, nulls, arrays, and objects — no floats. This ensures:
- Deterministic JSON serialization (canonical JSON)
- No floating-point precision issues
- SHA-256 content hash is stable

---

## Step 3: Event Log — Append to JSONL

### Backend Code: `packages/server/src/server.ts` (handleEventsBatch)

```typescript
// Check for duplicate clientEventId
const existingEventId = clientEventMappings.get(event.clientEventId);
if (existingEventId) {
  acks.push({ clientEventId, result: 'duplicate', eventId: existingEventId });
  continue;
}

// Translate wire → internal envelope
let envInput = translateEvent(event);

// Assign seq = hwm + 1 for this origin
const origin = envInput.origin;
const currentHwm = log.getHwm(origin);
envInput.seq = currentHwm + 1;
envInput.vv = { ...vv };

// Check for hash collision (same origin+seq)
const existing = log.getEventByOriginSeq(origin, envInput.seq);
if (existing) {
  acks.push({ clientEventId, result: 'conflict', eventId: existing.id });
  continue;
}

// Append to JSONL log
let appended: Envelope = await log.append(envInput);

// Record mapping
clientEventMappings.set(event.clientEventId, appended.id);
eventIdToClientEventId.set(appended.id, event.clientEventId);

// Accept
acks.push({
  clientEventId: event.clientEventId,
  result: 'accepted',
  eventId: appended.id,
  acceptedAtVersion: projectionVersion + 1,
});
```

**Key Points:**
1. **Duplicate check**: Same `clientEventId` → returns `duplicate` with existing `eventId`
2. **Sequence assignment**: `seq = hwm + 1` per origin (gap-free)
3. **Collision detection**: Same `origin+seq` → `conflict`
4. **Append**: Event appended to JSONL log with SHA-256 content hash
5. **Mapping**: `clientEventId` → `eventId` (ULID) and vice versa

### Event Log Format (JSONL)

Each line is a canonical JSON envelope:
```json
{
  "v": 1,
  "id": "06GRVFR97KRG6YJG0MQFDV9C9W",
  "origin": "device-field-07",
  "seq": 1,
  "hlc": {"l": 1793369011074, "c": 0},
  "vv": {},
  "type": "obs.water",
  "actor": {"id": "volunteer-majuli-01", "role": "volunteer"},
  "subject": "obs.water:area-syn-bridge",
  "at": 1793369011074,
  "payload": {
    "type": "obs.water",
    "client_event_id": "432762c5-d3dd-4fe7-9934-1d3634122c7c",
    "point_id": "area-syn-bridge",
    "depth_dm": 5,
    "ref_kind": "bridge_deck",
    "confidence": 80,
    "area_id": "area-syn-bridge",
    "severity": 3,
    "lat": 26800500,
    "lng": 94500500
  },
  "hash": "sha256(...)",
  "sig": null
}
```

---

## Step 4: Projection Fold

### Backend Code: `packages/server/src/projection.ts`

The projection fold combines flood, network, people, and route projections:

```typescript
export function projectSnapshot(
  events: Envelope[],
  artifacts: GeoArtifacts,
  asOf: number,
  version: number = 1,
): ProjectionSnapshot {
  const sortedEvents = [...events].sort(totalOrder);

  // 1. Extract water observations from events
  const waterObs = extractWaterObservations(sortedEvents);

  // 2. Infer road blockages from water observations at bridge deck points
  const bridgeBlockages = extractBridgeBlockages(waterObs, artifacts.floodReferencePoints);

  // 3. Create synthetic envelope-like records for bridge blockages
  const blockageEnvelopes = bridgeBlockages.map((b) => ({
    type: 'obs.road',
    at: b.observedAt,
    hlc: b.hlc,
    origin: b.origin,
    seq: b.seq,
    payload: {
      edge_id: b.edgeId,
      state: 'blocked',
      cause: 'water',
      depth_dm: b.depthDm,
      valid_from: b.observedAt,
      valid_until: null,
      confidence: b.confidence,
    },
  }));

  // 4. Compute flood projection using HAND
  const floodProjection = projectFlood(
    [],  // cells (empty - synthetic HAND cells created below)
    waterObs,
    artifacts.floodReferencePoints[0] ?? null,
    asOf,
  );

  // 5. If no flood cells but water observation exists, create synthetic cell
  let floodCells = floodProjection.cells;
  if (floodCells.length === 0 && waterObs.length > 0) {
    const activeObs = waterObs[waterObs.length - 1];
    if (activeObs.depthDm > 0 && activeObs.lat !== undefined && activeObs.lng !== undefined) {
      floodCells = [{
        cx: activeObs.lng,
        cy: activeObs.lat,
        wet: true,
        depthDm: activeObs.depthDm,
        handDm: 0,
        synthetic: true,
      }];
    }
  }

  // 6. Build road edges from artifacts
  const roadEdges = artifacts.roads.map((r) => ({
    edgeId: r.edgeId,
    class: 'residential',
  }));

  // 7. Merge real events with synthetic bridge blockages
  const allEventsForNetwork = [...sortedEvents, ...blockageEnvelopes] as Envelope[];

  // 8. Compute network projection (road passability)
  const networkProjection = projectNetwork(allEventsForNetwork, roadEdges, asOf);

  // 9. Compute cut-off settlements
  const cutOff = computeCutOff(artifacts.settlements, {
    ...floodProjection,
    cells: floodCells,
  });

  // 10. Build all projection FeatureCollections
  const flood = buildFloodExtent({ ...floodProjection, cells: floodCells });
  const roads = buildRoadStatus(artifacts.roads, networkProjection);
  const settlements = buildSettlements(artifacts.settlements, cutOff);
  const shelters = buildShelters(artifacts.shelters);
  const routes = buildRoutes(artifacts.routes, artifacts.routeEdges, passByEdge, settlementsById, sheltersById, Date.now());

  return {
    version,
    generatedAt: now,
    flood,
    roads,
    settlements,
    routes,
    shelters,
  };
}
```

**Key Steps:**

1. **Sort events**: `totalOrder` sorts by (hlc.l, hlc.c, origin, seq, id)
2. **Extract water observations**: Filter `obs.water` events
3. **Infer road blockages**: Water observations at bridge deck points block roads
4. **Compute flood**: `projectFlood()` computes inundation cells from HAND grid
5. **Compute network**: `projectNetwork()` computes road passability from observations
6. **Compute cut-off**: Settlements near wet cells are cut off
7. **Build all FeatureCollections**: flood, roads, settlements, routes, shelters

### Flood Projection

```typescript
export function projectFlood(
  cells: InundationCell[],
  obs: WaterObservation[],
  refPoint: FloodPoint | null,
  asOf: number,
  cellSizeM: number = 30,
): FloodProjection {
  const activeObs = selectWaterObservation(obs, asOf);

  let h0Dm = 0;
  if (activeObs && refPoint) {
    const h0 = computeHydraulicDepth(activeObs, refPoint);
    if (h0 === null) {
      // depth out of plausible range → disputed
      disputedPoints.push({ pointId: refPoint.pointId, reason: '...' });
    } else {
      h0Dm = h0;
    }
  }

  // For each HAND cell: wet if HAND <= hydraulic depth
  for (const cell of cells) {
    let wet = false;
    let depthDm = 0;
    if (h0Dm > 0) {
      if (cell.handDm <= cell.drainHandDm) {
        wet = true;
        depthDm = Math.max(0, cell.drainHandDm - cell.handDm);
      }
    }
    wetCells.push({ cx: cell.cx, cy: cell.cy, wet, depthDm, handDm: cell.handDm });
  }
  // ...
}
```

**Key Logic:**
- `wet(c) = HAND(c) <= h(D(c))` where `h(D(c))` is hydraulic depth at drainage cell
- `depth(c) = max(0, h(D(c)) - HAND(c))`
- Cells with `HAND = 0` are drainage cells (always wet if h0Dm > 0)

### Route Computation

```typescript
// Build time-expanded DAG
const graph = buildExpandedGraph(routeEdges, passByEdgeSlots, t0, horizonMs, slotLengthMs);

// Find fastest path
const result = findFastestPath(
  settlement.nodeId,
  shelter.nodeId,
  0,  // depart at slot 0
  graph,
);

// Result: { path: string[], etaS: number, waits: [...], replayPassed: boolean }
```

**Key Logic:**
- Build time-expanded DAG from road edges + passability
- `findFastestPath()` finds fastest path using forward DP
- If no path found → `etaS = 0`, `path = []`, `waits = null` (route unavailable)
- Route reason set to `"No route available — all roads blocked"` if no path

---

## Step 5: Frontend Displays Projection

### Frontend Code: `frontend/packages/api-client/src/http.ts`

The frontend fetches projections:

```typescript
const snapshot = await client.getProjections();
// snapshot.flood, snapshot.roads, snapshot.settlements, snapshot.routes, snapshot.shelters
```

The frontend renders each feature type with appropriate styling:
- Flood: polygon with depth color
- Roads: line with passability color
- Settlements: point with accessibility marker
- Routes: line with status color
- Shelters: point with occupancy info

**Synthetic features** are rendered distinctly (dashed lines, different color, "DEMO" badge).

---

## Complete Flow Summary

```
Volunteer Report
    ↓
Frontend validates (Zod schemas)
    ↓
POST /api/v1/events:batch
    ↓
Backend translates (wire → internal envelope)
    ↓
Event appended to JSONL log (SHA-256 hash)
    ↓
Projection fold computes:
  - Flood inundation (HAND)
  - Road passability (observations)
  - Settlement cut-off (wet cells proximity)
  - Evacuation routes (time-expanded DAG)
    ↓
SSE version bump
    ↓
Frontend fetches projections
    ↓
Command centre displays updated state
```

## Key Files in Execution Path

| File | Role |
|------|------|
| `frontend/packages/api-client/src/http.ts` | Frontend API client |
| `frontend/packages/contract/src/events.ts` | Wire format schemas |
| `packages/server/src/translation.ts` | Wire → internal envelope |
| `packages/server/src/server.ts` | HTTP server, event log, projections |
| `packages/server/src/event-log.ts` | Append-only JSONL log |
| `packages/server/src/projection.ts` | Deterministic projection fold |
| `packages/core/src/project/flood.ts` | HAND inundation |
| `packages/core/src/project/network.ts` | Road passability |
| `packages/core/src/route/dag.ts` | Time-expanded DAG routing |
| `packages/core/src/event/envelope.ts` | Envelope type |
| `packages/core/src/event/hlc.ts` | Hybrid Logical Clock |
| `packages/core/src/event/canonical.ts` | Canonical JSON |
| `packages/core/src/event/content-hash.ts` | SHA-256 hash |

## Important Implementation Details

1. **No floats in internal envelope**: All values are integers (microdegrees, decimetres, epoch ms)
2. **ULID for IDs**: Time-ordered, sortable
3. **HLC for causality**: Captures ordering without synchronized clocks
4. **Canonical JSON**: Deterministic serialization for hashing
5. **SHA-256 content hash**: Integrity verification
6. **Version vectors**: Sync protocol
7. **Time-expanded DAG**: Time-varying routing
8. **Synthetic data clearly labeled**: `synthetic: true` on all synthetic features
