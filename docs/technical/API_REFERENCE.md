# SETU — API Reference

## Base URL

- **Local**: `http://localhost:8080`
- **Public**: `https://marc-followed-equal-broadway.trycloudflare.com`
- **CORS**: Enabled (`Access-Control-Allow-Origin: *`)

---

## POST /api/v1/events:batch

Submit one or more field events for processing.

### Request

```http
POST /api/v1/events:batch
Content-Type: application/json

{
  "events": [
    {
      "clientEventId": "uuid-v4",
      "type": "flood_report",
      "occurredAt": "2026-10-30T14:03:31.074723+00:00",
      "reporterId": "volunteer-1",
      "deviceId": "device-abc",
      "location": { "lat": 26.9586, "lng": 94.1622, "accuracyM": 10 },
      "note": "Water 0.5m over bridge deck",
      "photoRefs": [],
      "severity": 3,
      "depthCm": 50,
      "areaId": "A1"
    }
  ]
}
```

### Response (200 OK)

```json
{
  "acks": [
    {
      "clientEventId": "uuid-v4",
      "result": "accepted",
      "eventId": "evt_abc123",
      "acceptedAtVersion": 5
    }
  ]
}
```

### Ack Result Values

| Result | Meaning |
|--------|---------|
| `accepted` | Event accepted and queued for processing |
| `duplicate` | Duplicate clientEventId — already exists |
| `conflict` | Conflict with existing event (e.g., road_blockage on cleared road) |
| `rejected` | Validation failed — see errors array |

### Errors

- `400 Invalid JSON body`
- `400 events must be an array`
- `400 Too many events: max 500 per batch`

---

## POST /api/v1/events/status

Check synchronization status of submitted events.

### Request

```http
POST /api/v1/events/status
Content-Type: application/json

{
  "clientEventIds": ["uuid-v4", "uuid-v5"]
}
```

### Response (200 OK)

```json
{
  "statuses": [
    {
      "clientEventId": "uuid-v4",
      "eventId": "evt_abc123",
      "state": "applied",
      "projectionVersion": 5
    }
  ]
}
```

### State Values

| State | Meaning |
|-------|---------|
| `unknown` | Event not found |
| `accepted` | Event accepted, queued for processing |
| `applied` | Event applied to projections |
| `conflict` | Conflict detected |
| `rejected` | Event rejected |

---

## GET /api/v1/projections

Get the current projection snapshot containing flood, road, settlement, route, and shelter data.

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `sinceVersion` | number (optional) | Return 304 if snapshot version <= sinceVersion |

### Response (200 OK)

```json
{
  "version": 5,
  "generatedAt": "2026-10-30T10:05:00Z",
  "flood": {
    "type": "FeatureCollection",
    "version": 1,
    "generatedAt": "2026-10-30T10:05:00Z",
    "features": [
      {
        "type": "Feature",
        "id": "flood-0",
        "geometry": {
          "type": "Polygon",
          "coordinates": [[
            [94.159, 26.956],
            [94.165, 26.956],
            [94.165, 26.961],
            [94.159, 26.961],
            [94.159, 26.956]
          ]]
        },
        "properties": {
          "areaId": "area-sh21-auniati",
          "depthCm": 50,
          "severity": 3,
          "synthetic": true
        }
      }
    ]
  },
  "roads": {
    "type": "FeatureCollection",
    "version": 1,
    "generatedAt": "2026-10-30T10:05:00Z",
    "features": [
      {
        "type": "Feature",
        "id": "road-0",
        "geometry": {
          "type": "LineString",
          "coordinates": [[94.161, 26.958], [94.1635, 26.9592]]
        },
        "properties": {
          "roadId": "284824410",
          "name": "SH21",
          "status": "blocked",
          "updatedAt": "2026-10-30T10:05:00Z",
          "sourceEventIds": ["obs-2026-10-30-001"],
          "blockReason": "submerged_bridge",
          "waterLevelM": 85.3,
          "deckElevationM": 84.8,
          "synthetic": false
        }
      }
    ]
  },
  "settlements": {
    "type": "FeatureCollection",
    "version": 1,
    "generatedAt": "2026-10-30T10:05:00Z",
    "features": [
      {
        "type": "Feature",
        "id": "settlement-0",
        "geometry": {
          "type": "Point",
          "coordinates": [94.1238, 26.9365]
        },
        "properties": {
          "settlementId": "10692764768",
          "name": "Auniati",
          "population": 0,
          "accessibility": "cut_off",
          "households": 0,
          "needs": ["evacuation"],
          "cut_off_reason": "bridge_submerged_sh21",
          "synthetic": false
        }
      }
    ]
  },
  "routes": {
    "type": "FeatureCollection",
    "version": 1,
    "generatedAt": "2026-10-30T10:05:00Z",
    "features": [
      {
        "type": "Feature",
        "id": "route-0",
        "geometry": {
          "type": "LineString",
          "coordinates": [[94.1622, 26.9586], [94.17, 26.965], [94.18, 26.97]]
        },
        "properties": {
          "routeId": "route-auniati-evac-001",
          "from": "10692764768",
          "to": "MJ-SH-009",
          "kind": "evacuation",
          "status": "recalculated",
          "etaMin": 45,
          "replacesRouteId": null,
          "reason": "No route available - all roads blocked",
          "synthetic": true
        }
      }
    ]
  },
  "shelters": {
    "type": "FeatureCollection",
    "version": 1,
    "generatedAt": "2026-10-30T10:05:00Z",
    "features": [
      {
        "type": "Feature",
        "id": "shelter-0",
        "geometry": {
          "type": "Point",
          "coordinates": [94.2885, 27.0399]
        },
        "properties": {
          "shelterId": "MJ-SH-009",
          "name": "Jengraimukh College",
          "capacity": 0,
          "occupancy": 0,
          "open": false,
          "status": "pre_identified_not_confirmed",
          "serves_auniati": true,
          "synthetic": false
        }
      }
    ]
  }
}
```

### Response (304 Not Modified)

Returned when `sinceVersion` >= current projection version.

---

## GET /api/v1/events

List event records (audit trail).

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `sinceVersion` | number (optional) | Filter events after version |
| `limit` | number (optional, default 50) | Maximum events to return |
| `type` | string (optional) | Filter by event type (`flood_report`, `road_blockage`, etc.) |

### Response (200 OK)

```json
{
  "events": [
    {
      "eventId": "evt_abc123",
      "event": {
        "clientEventId": "uuid-v4",
        "type": "flood_report",
        "occurredAt": "2026-10-30T14:03:31.074723+00:00",
        "reporterId": "volunteer-1",
        "deviceId": "device-abc",
        "location": { "lat": 26.9586, "lng": 94.1622 },
        "severity": 3,
        "depthCm": 50,
        "areaId": "A1"
      },
      "serverState": "applied",
      "receivedAt": "2026-10-30T14:03:31.074723+00:00",
      "appliedAtVersion": 5
    }
  ]
}
```

**Note**: Invalid events (invalid wire format) are silently skipped. Use `onSkippedRecords` callback in the frontend client to be notified of skipped records.

---

## GET /api/v1/stream

Server-Sent Events stream for real-time version bumps.

### Response

```http
GET /api/v1/stream
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

```
data: {"type":"version","version":5}

```

The stream sends an initial version message immediately on connection, then bumps the version whenever new events are applied.

---

## GET /api/v1/health

Health check endpoint.

### Response (200 OK)

```json
{
  "ok": true,
  "eventCount": 26,
  "projectionVersion": 1
}
```

---

## Contract Schemas

All wire-format data is validated against Zod schemas defined in `frontend/packages/contract/src/`:

- `FieldEventSchema` — Discriminated union of flood_report, road_blockage, road_cleared, water_level, household_registration
- `ProjectionSnapshotSchema` — Complete projection snapshot
- `EventRecordSchema` — Event record with server metadata
- `SubmitAckSchema` — Submission acknowledgment
- `EventStatusSchema` — Event sync status

## Error Handling

### Server Errors

| Status | Meaning |
|--------|---------|
| 400 | Invalid request (bad JSON, missing fields, too many events) |
| 404 | Not found |
| 500 | Internal server error |
| 503 | Server not initialized |

### Frontend Errors

| Class | retryable | Meaning |
|-------|-----------|---------|
| `NetworkError` | true | Network unavailable |
| `ServerError` | true | Server returned error status |
| `TimeoutError` | true | Request timed out |
| `NotImplementedError` | false | Feature not implemented |

## Client Example

```typescript
import { createApiClient } from '@setu/api-client';

const client = createApiClient({
  baseUrl: 'https://marc-followed-equal-broadway.trycloudflare.com'
});

// Submit a field report
const acks = await client.submitEvents([{
  clientEventId: crypto.randomUUID(),
  type: 'flood_report',
  occurredAt: new Date().toISOString(),
  reporterId: 'volunteer-1',
  deviceId: 'device-01',
  location: { lat: 26.9586, lng: 94.1622 },
  severity: 3,
  depthCm: 50,
}]);

// Get projections
const snapshot = await client.getProjections();
console.log(snapshot.roads.features);

// Subscribe to real-time updates
const unsubscribe = client.subscribe((version) => {
  console.log(`New version: ${version}`);
  // Refetch projections
});