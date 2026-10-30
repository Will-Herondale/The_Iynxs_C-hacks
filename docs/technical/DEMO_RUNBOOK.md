# SETU — Demo Runbook

**Date:** 2026-10-30  
**Branch:** `coordination/integration-handoff`  
**Backend Commit:** `245da93`  
**Backend URL:** `http://localhost:8080` / `https://marc-followed-equal-broadway.trycloudflare.com`

---

## Overview

This runbook demonstrates the complete SETU workflow: a volunteer's field observation of water under a bridge becomes a flooded road, blocked route, cut-off village, and evacuation deadline — computed, not typed in.

The demonstration uses the **SYN-DEMO-001** synthetic scenario, which creates a connected road network: Demo Settlement → Demo Bridge → Demo Shelter.

---

## Pre-Demo Checklist

- [ ] Backend server running on `http://localhost:8080`
- **Cloudflare tunnel** active at `https://marc-followed-equal-broadway.trycloudflare.com`
- **Frontend** built and accessible (if demonstrating frontend integration)
- **Browser** opened to backend health endpoint or frontend URL
- **Synthetic artifacts** loaded (auto-loaded on server startup)

---

## Demo Script (5 Minutes)

### Step 1: Show Initial State (30 seconds)

**What to show:**
- Command centre dashboard showing Majuli district
- All roads accessible (green)
- All settlements accessible (green)
- All routes active (green line)
- All shelters open (blue)

**Say:** "This is Majuli, Assam — a river-island district. Everything is normal. All roads are open, all settlements are accessible, and evacuation routes are ready."

### Step 2: Submit Flood Report (30 seconds)

**Action:** Submit a flood_report via field app or direct API call:

```json
{
  "clientEventId": "demo-flood-001",
  "type": "flood_report",
  "occurredAt": "2026-10-30T14:03:31.074723+00:00",
  "reporterId": "volunteer-majuli-01",
  "deviceId": "device-field-07",
  "location": {"lat": 26.8005, "lng": 94.5005, "accuracyM": 10},
  "note": "Water over demo bridge deck. Depth ~0.5m above deck.",
  "photoRefs": [],
  "severity": 3,
  "depthCm": 50,
  "areaId": "area-syn-bridge"
}
```

**What happens:**
- Backend accepts the event with `acceptedAtVersion: 1`
- Bridge `syn-bridge-1` (Demo Bridge Road) is marked `blocked` with `blockReason: "submerged_bridge"`
- Route `syn-evac-1` changes to `unavailable` with reason `"No route available — all roads blocked"`
- Flood cell appears at bridge location with `depth=50cm`, `severity=3`

**Say:** "A volunteer reports water over the bridge deck. The system immediately computes: the bridge is blocked, the evacuation route is unavailable, and there's inundation at the bridge location."

### Step 3: Show Projection Updates (30 seconds)

**What to show:**
- Road `syn-bridge-1` turns red (blocked)
- Route `syn-evac-1` turns red (unavailable) with reason "No route available — all roads blocked"
- Flood polygon appears around bridge with depth=50cm, severity=3

**Say:** "Notice how the system automatically computed the impact: the bridge is impassable, the evacuation route is blocked, and there's inundation at the bridge location — all computed from a single observation."

### Step 4: Show Idempotency (30 seconds)

**Action:** Resubmit the exact same flood_report event.

**Expected result:**
- Server returns `duplicate` with same eventId
- Projections unchanged — no double-counting

**Say:** "If the same report is submitted twice, the system recognizes it as a duplicate and doesn't double-count it."

### Step 5: Show Audit Trail (30 seconds)

**Action:** Call `GET /api/v1/events` to show the event record.

**Expected result:**
```json
{
  "eventId": "06GRV1CQ9TA40BBJ43QZ2TAJVC",
  "event": {
    "clientEventId": "demo-flood-001",
    "type": "flood_report",
    "occurredAt": "2026-10-30T14:03:31.074723+00:00",
    "reporterId": "volunteer-majuli-01",
    "deviceId": "device-field-07",
    "location": {"lat": 26.8005, "lng": 94.5005},
    "severity": 3,
    "depthCm": 50,
    "areaId": "area-syn-bridge"
  },
  "serverState": "applied",
  "receivedAt": "2026-10-30T14:03:31.074Z",
  "appliedAtVersion": 1
}
```

**Say:** "Every event is fully auditable — we know who reported it, when, where, and when it was applied to the projections."

---

## Demo Script — Alternative: Offline-First

### Step 1: Disconnect Network

**Action:** Disconnect network interface or disable Wi-Fi.

**What to show:**
- Field app still works — can submit observations
- Events stored locally in IndexedDB
- "Offline" indicator shows

### Step 2: Submit Offline Event

**Action:** Submit a flood report while offline.

**Expected result:**
- Event accepted locally
- Stored in IndexedDB
- Sync status shows "pending"

### Step 3: Reconnect

**Action:** Reconnect network.

**What happens:**
- Automatic sync to backend
- Events applied to server
- Projections update on frontend

**Say:** "The system works offline. Events are stored locally and automatically sync when connectivity returns."

---

## Demo Script — Real vs Synthetic

### What to Show

**Real Data (from Copernicus GLO-30 / OSM / DDMA):**
- 11,736 road segments across Majuli island
- 518 bridge-tagged ways
- 8 settlements (Kamalabari, Garamur, Auniati, etc.)
- 23 DDMA pre-identified shelters (all `open: false`)

**Synthetic Data (clearly labeled):**
- `syn-settlement-1` (Demo Settlement)
- `syn-shelter-1` (Demo Shelter)
- `syn-bridge-1` (Demo Bridge Road)
- `syn-evac-1` (Demo Evacuation Route)

**Say:** "Real geographic data comes from Copernicus GLO-30 and OpenStreetMap. The synthetic elements (demo settlement, bridge, shelter, route) are clearly labeled and used only for demonstration purposes."

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Server not responding | Server not running | Start with `npx tsx src/run.ts` in `packages/server/` |
| Health check fails | Server not initialized | Wait 5-10 seconds for geo artifacts to load |
| Projections empty | No events submitted | Submit a flood_report first |
| Frontend can't connect | Wrong backend URL | Point to `http://localhost:8080` or public tunnel |
| SSE not working | Network/firewall | Use polling fallback (automatic in client) |

---

## Files and Locations

| File | Purpose |
|------|---------|
| `packages/server/src/server.ts` | Backend HTTP server |
| `packages/server/src/projection.ts` | Deterministic projection fold |
| `packages/server/src/translation.ts` | Wire → internal envelope |
| `packages/server/src/geo-artifacts.ts` | Majuli geographic artifacts loader |
| `packages/core/src/project/flood.ts` | HAND inundation computation |
| `packages/core/src/route/dag.ts` | Time-expanded DAG routing |
| `frontend/packages/api-client/src/http.ts` | HTTP API client |
| `frontend/packages/contract/src/events.ts` | Wire format schemas |
| `frontend/packages/contract/src/projections.ts` | Projection schemas |
| `frontend/apps/command/src/` | Command centre application |
| `frontend/apps/field/src/` | Field app |

---

## Git Branches

| Branch | Purpose |
|--------|---------|
| `coordination/integration-handoff` | Backend + coordination (current) |
| `frontend/main` | Frontend application |
| `coordination/team-handoff` | Team coordination |
| `main` | Protected main branch |

---

## Support

For issues during the demo:
1. Check server health: `GET http://localhost:8080/health`
2. Check server logs: `packages/server/src/server.ts` console output
3. Check frontend console: Browser developer tools console
4. Check contract compliance: `frontend/packages/contract/src/` schemas
