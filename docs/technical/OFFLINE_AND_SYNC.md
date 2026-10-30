# SETU — Offline-First and Synchronization

## Overview

SETU is designed as an **offline-first** system. Field volunteers must be able to create observations and access projections even when internet connectivity is unavailable. The central server is not a prerequisite for field operations.

## Offline Capabilities

### Application Shell (PWA)
- **Installable PWA**: Web app manifest enables installation on mobile devices
- **Service Worker**: Caches application shell resources (HTML, CSS, JS, images)
- **Offline Shell**: Application loads and functions without network connection
- **Locally Available Assets**: All critical assets bundled with the application

### Local Storage (IndexedDB)
SETU uses IndexedDB for local persistence:

**Tables:**
- `fieldEvents`: Append-only store of locally created events
- `syncState`: Version vectors per origin for sync tracking
- `projections`: Cached projection snapshots
- `geoArtifacts`: Bundled geographic data (HAND, roads, settlements, shelters)
- `syncLog`: History of sync attempts

### Local Event Creation
1. Volunteer fills out field report form
2. Event validated locally against Zod schemas
3. Event persisted to IndexedDB with `synced: false`
4. Event available immediately in local UI
5. Event survives page reloads and browser restarts

### Stable Event Identity
- Each event gets a ULID v1 ID (generated client-side)
- `clientEventId` (UUID v4) serves as idempotency key
- Same clientEventId → same event (duplicate delivery is idempotent)

## Synchronization Protocol

### Automatic Sync
When connectivity returns:
1. Collect unsynced events from IndexedDB
2. Batch submit to backend (max 500 events per batch)
3. Process acknowledgments:
   - `accepted`: Mark as synced
   - `duplicate`: Mark as synced (already exists)
   - `conflict`/`rejected`: Mark as error, retain locally
4. Pull updated projections from server
5. Update local projection cache
6. Log sync attempt (success/failure, events sent/acked, duration)

### Manual Sync
Users can manually trigger synchronization via the UI sync button.

### Retry Policy
- Exponential backoff: 1s, 2s, 4s, 8s, 16s
- Maximum 5 retries before giving up
- Failed syncs logged for later review

## Version Vector Sync

Each device maintains a version vector tracking the highest sequence number per origin. When syncing:
1. Client sends its version vector to server
2. Server responds with events the client hasn't seen
3. Client merges new events into local log
4. Client recomputes local projections

## Event Exchange (JSONL)

SETU supports decentralized event exchange via JSONL export/import:

### Export Format
Each line is a wire-format `FieldEvent` (canonical JSON):
```json
{"clientEventId":"...","type":"flood_report","occurredAt":"...","reporterId":"...","deviceId":"...","location":{"lat":26.8005,"lng":94.5005},"depthCm":50,"areaId":"area-syn-bridge","severity":3}
```

### Import Validation
1. Parse each line as JSON
2. Validate against `FieldEventSchema` (Zod)
3. Check `clientEventId` for duplicates (already imported?)
4. Check content hash for integrity
5. Merge valid events into local event log
6. Recompute local projections

### Import Rules
- Invalid payloads are rejected
- Identity collisions are rejected (same clientEventId, different content)
- Repeated imports of same event are deduplicated
- Conflict rules preserved (road_blockage on cleared road = conflict)

## Offline-First Design Principles

1. **Central server is not a prerequisite** for field operations
2. **All events persist locally** before any network attempt
3. **Sync is automatic** when connectivity returns
4. **Manual sync** available for immediate synchronization
5. **Stale data warnings** displayed when sync is overdue (>5 minutes)
6. **Offline device never implies** it has the latest district-wide picture

## Data Staleness

The system tracks:
- Last successful sync timestamp
- Time since last sync (>5 minutes = stale warning)
- Whether information is local-only or district-wide
- Age of observations

## Security Notes

- Valid hash = integrity check only, NOT proof of report truthfulness
- Imported events validated against sync rules
- Invalid payloads rejected
- Identity collisions rejected
- Origin and sequence preserved
- Deduplication of repeated imports
