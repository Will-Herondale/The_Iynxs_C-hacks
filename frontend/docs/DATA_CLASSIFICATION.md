# Data classification and honesty rules (wave 9)

Karthik's GIS validation showed the road graph has 1,030 connected components, Auniati is not connected to bridge 284824410, shelter MJ-SH-009 is not on the road network, the 45-minute ETA is fixture-provided (not computed), and all 23 shelters are `open:false`, capacity 0, occupancy 0. The UI must not imply more than the data supports. No new contract fields are used; every rule works from existing fields.

Single sources of truth live in `@setu/geo` / `@setu/ui`: `LAYER_DATA_CLASS`, `shelterStatus`, `routeState`, `ROUTE_STATE_META`, `formatIndicativeEta`, and the `DataClassTag` component.

## 1. Data classes

Every layer toggle, legend entry and list carries a tag with icon + text (never colour alone) and a tooltip.

| Class | Meaning | Layers |
|---|---|---|
| `REAL` | Sourced GIS | roads, bridges, waterways, waterbodies, places, island, hillshade/DEM |
| `SYNTHETIC` | Scenario / fixture-derived | scenario bridge states, households, reports, routes, fixture shelters' status |
| `EXPERIMENTAL` | Modelled | DEM-threshold flood, any HAND-derived layer, backend-provided flood ("Modelled · EXPERIMENTAL") |

HAND is never used for flood extent, road passability or evacuation safety.

## 2. Shelters

All 23 shelters are **pre-identified camps**, not confirmed operational shelters.

| Properties | Badge | Capacity / occupancy |
|---|---|---|
| `open === true` | "Open (reported)" | shown as reported |
| otherwise (incl. `open:false`, capacity 0, occupancy 0) | "Pre-identified · not confirmed" (neutral, not red "closed") | "not published"; 0/0 is never shown as a count |

Map marker: hollow, dashed outline, with its own legend entry.

## 3. Route states (`routeState(route, context)`)

The frontend cannot tell whether a route was computed.

| State | When | Map style |
|---|---|---|
| `calculated` | **Reserved.** Only with a future verified signal; currently never returned | (solid, not yet used) |
| `not-verified` | Default for status `active` / `recalculated` | dashed amber, "?" |
| `no-safe-route` | Settlement has routes and all are unavailable | none |
| `unreachable` | **Reserved** for destination unreachable; unit-tested, not produced | none |
| `no-route-data` | Settlement has no routes | none |
| `refused` | Unavailable with a refusal | grey dashed ✕ |

`etaMin` is always labelled "indicative, source unconfirmed" and never appears in the situation strip as fact. No route is ever rendered as a safe evacuation route.

## 4. What the backend must provide to unlock states

- `calculated`: a per-route signal that the route was computed on a connected road graph (e.g. `computedBy`, `graphVersion`, `computedAt`) plus origin and destination snapped to graph nodes.
- `unreachable`: an explicit result from the router saying the destination is not reachable from the origin on the graph (distinct from "no route data").
- Shelters: published `open`, capacity and occupancy from an authoritative source; until then they stay pre-identified.
- Network: a connected, validated road graph linking settlements, bridges and shelters (currently 1,030 components).
