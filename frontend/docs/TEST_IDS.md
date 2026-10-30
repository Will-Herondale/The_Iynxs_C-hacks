# SETU frontend: shared test-id and dev-port contract

Owned by the coordinator. Team Field, Team Command and Team QA all depend on it.
Change it only through the coordinator.

## Dev ports (`vite.config.ts`, `strictPort: true`)
| App | Port |
|---|---|
| apps/field (`@setu/field`) | 5173 |
| apps/command (`@setu/command`) | 5174 |
| mock relay (`setuMockRelay()`) | 5199 |

Both apps:
- use the `setuMockRelay()` plugin from `@setu/mock-backend/relay`;
- create the client with `createApiClientWithMock()` unless `VITE_API_MODE === 'http'`.

Mock failure toggles go through the URL, e.g. `?mock=offline`, `?mock=5xx:1`, `?mock=conflict`, `?mock=reject`, `?mock=delay:3000`, `?mock=off`. See `frontend/README.md`.

## Field app (`data-testid`)
| id | element | attributes |
|---|---|---|
| `online-indicator` | online/offline badge | `data-online="true\|false"` |
| `pending-count` | count of items not yet `synced` | text = number |
| `last-synced` | last successful confirmation time | `data-ts` = ISO or empty |
| `sync-now` | manual sync button | |
| `nav-report`, `nav-household`, `nav-queue` | nav links | |
| `report-type-flood_report`, `report-type-road_blockage`, `report-type-road_cleared`, `report-type-water_level` | report-type picker | |
| `field-roadId` | road select (seed ids R1..R10) | |
| `field-blockage` | `partial` / `full` select | |
| `field-severity` | 1-5 | |
| `field-depthCm`, `field-levelCm`, `field-trend`, `field-gaugeId`, `field-areaId` | inputs | |
| `field-lat`, `field-lng` | location inputs (prefilled by GPS, editable) | |
| `field-note` | textarea | |
| `report-submit` | submit button | |
| `household-headName`, `household-members`, `household-settlementId`, `household-vulnerable-<elderly\|children\|disabled\|medical>`, `household-needs` | household form | |
| `household-submit` | submit | |
| `form-error` | validation error text | |
| `queue-list` | queue container | |
| `queue-item` | one queued item | `data-client-event-id`, `data-status` = ClientSyncStatus, `data-type`, `data-attempts` |
| `queue-retry`, `queue-discard`, `queue-edit` | per-item actions (inside `queue-item`) | |
| `conflict-panel` | conflict details (inside `queue-item`) | |
| `conflict-keep-mine`, `conflict-accept-server` | conflict resolution | |

## Command centre (`data-testid`)
| id | element | attributes |
|---|---|---|
| `map` | map container | `data-projection-version` = current snapshot version |
| `layer-toggle-flood`, `layer-toggle-roads`, `layer-toggle-settlements`, `layer-toggle-routes`, `layer-toggle-shelters` | checkboxes | `aria-checked` / `checked` |
| `road-row-<roadId>` | road status list row | `data-status` = open\|partial\|blocked\|unknown |
| `settlement-row-<settlementId>` | settlement list row | `data-accessibility` = accessible\|limited\|cut_off |
| `route-row-<routeId>` | route list row | `data-status` = active\|recalculated\|unavailable |
| `shelter-row-<shelterId>` | shelter list row | |
| `feature-panel` | detail panel for the selected feature | `data-feature-kind`, `data-feature-id` |
| `incident-feed` | incident/event feed | |
| `incident-item` | one event | `data-client-event-id`, `data-status` = ClientSyncStatus-like (accepted\|synced\|conflict\|rejected) |
| `stat-cut-off`, `stat-blocked-roads`, `stat-active-routes` | header stats | text = number |
| `connection-status` | live-update status | `data-state` = live\|polling\|offline |

The road/settlement/route lists are required. They make the projections testable and accessible without reading the map canvas. Clicking a row selects the feature and opens `feature-panel`, the same as clicking it on the map.

## Scripted mock scenario (from `@setu/mock-backend` seed, Majuli, SYNTHETIC)
IDs are Karthik's real ids: `roadId`/`settlementId` = `String(osm_id)`, `shelterId` = `shelter_id` (e.g. `MJ-SH-009`). Everything below is a
scripted lookup, labelled SYNTHETIC (geo/SCENARIOS.md); flood polygons are an interim DEM-threshold mask, not a hydraulic simulation.
Baseline flood is empty; shelters are `capacity:0 occupancy:0 open:false` (= "not published"); settlement `population:0` = "not published".
- **S1** bridge `284824410` (deck ≈84.8 m, level 85.3 m): `road_blockage` (full) with `roadId=284824410`, or a `water_level` within 300 m of it:
  - the bridge becomes `blocked`/`impassable`, with `reason` "Submerged — water level 85.3 m above deck ≈84.8 m (synthetic S1), reported at HH:MM IST";
  - every route crossing it becomes `unavailable` with a `refusal`, and its precomputed alternate appears as `recalculated` (`replacesRouteId`);
  - far-side settlements become `limited` with a `cutOffReason`;
  - the flood switches to the 85.3 m polygons (`flood-s1-<nnn>`, `confidence=modelled`).
- **S2** road `1074461062` (200 m closure near shelter `MJ-SH-009`): `road_blockage` full makes the road `blocked`, refuses the route to `MJ-SH-009`, and adds the alternate as `recalculated`.
- **S4** Auniati `10692764768` (DEM 82.3 m, level 83.8 m): a `water_level` within 1.5 km with `levelCm >= 150` (read as depth above local ground; level = 82.3 m + levelCm/100):
  - the flood switches to the 83.8 m polygons (`flood-s4-<nnn>`);
  - Auniati becomes `cut_off`, with a `cutOffReason`, `evacuationDeadline` (event time + 3 h) and priority `critical`;
  - EVERY route from Auniati becomes `unavailable`, with a `refusal`, and there are no alternates (the "no safe route" state);
  - a later `water_level` below 150 cm there reverts S4.
- `road_cleared` on a blocked road reverts it: road, settlements, routes (alternates become `unavailable`) and, unless S1/S4 still hold it, the flood.
- The mock applies an event about 1500ms after accepting it (`?mock=delay:<ms>`).

## Wave 3 additions (submerged-bridge demo, camp, provenance)

### Field app and camp mode
| id | element | attributes |
|---|---|---|
| `field-cause` | blockage cause select (submerged, debris, collapse, damage, other) | |
| `field-roadId` | now lists bridges too (B1, …), labelled "Bridge: <name>" | |
| `nav-camp` | camp mode nav link (`#/camp`) | |
| `camp-select` | choose the camp/shelter (SH1..SH3), remembered on the device | |
| `camp-info` | capacity/occupancy of the chosen camp, from projections | `data-shelter-id` |
| `camp-household-form` | household registration at the camp (sets `shelterId`) | reuses `household-*` field ids |
| `camp-household-list` | households registered at this camp from this device | |
| `camp-household-row` | one household | `data-client-event-id`, `data-status` |
| `sync-status-label` | the visible text label inside every SyncStatusBadge | text = the brief's vocabulary (below) |

Status vocabulary from the brief, shown by `SyncStatusBadge`:

| Internal ClientSyncStatus | Label shown |
|---|---|
| `queued`, device offline | **Saved on device** (created locally) |
| `queued`, online | **Queued for sync** |
| `sending` | **Submitted** |
| `accepted` | **Accepted — awaiting confirmation** |
| `synced` | **Confirmed** |
| `conflict` | **Disputed** |
| `rejected` | **Rejected** |
| `failed` | **Retrying** |

### Command centre
| id | element | attributes |
|---|---|---|
| `road-row-<id>` | (existing) | adds `data-kind` = road\|bridge, `data-passability` |
| `situation-summary` | plain-language summary at the top, e.g. "Bridge B1 submerged → Kalapahar cut off → evacuate by 18:00" | |
| `explain-cutoff-<settlementId>` | "Why cut off" block (feature-panel and settlement row) | |
| `explain-refusal-<routeId>` | "Why this route is refused" block | |
| `evac-deadlines` | evacuation deadline list, soonest first | |
| `deadline-<settlementId>` | one deadline | `data-deadline` = ISO, text shows the time left |
| `nav-audit` / `audit-view` | provenance and audit view | |
| `audit-row` | one event | `data-event-id`, `data-client-event-id`, `data-status` |
| `provenance-<featureId>` | "Based on these reports" list inside feature-panel | |
| `map-legend` | legend: flooded / blocked / safe / uncertain | |

### Demo scenario (scripted in mock-backend; field names PROPOSED in issue #6)
Superseded by the Majuli S1/S2/S4 scenarios in "Scripted mock scenario" above (the Guwahati B1/S4/EVAC-3 demo is gone). Flood polygons carry
`confidence=modelled` (synthetic DEM-threshold mask); the baseline snapshot has no flood.
