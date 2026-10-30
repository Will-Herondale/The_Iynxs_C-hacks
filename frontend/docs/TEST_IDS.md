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

Status vocabulary (design system, wave 5), shown by `SyncStatusBadge` / `StatusBadge`. Each status has a distinct icon, CSS class and text; "Accepted" appears only once the server confirms the event was applied (`isConfirmedSynced`), never on HTTP 2xx alone.

| Internal ClientSyncStatus | Label shown |
|---|---|
| `queued`, device offline | **Saved locally** |
| `queued`, online | **Waiting to sync** |
| `sending` | **Synchronising** |
| `accepted` (server has it, not yet confirmed applied) | **Synchronising** |
| `synced` (confirmed applied) | **Accepted** |
| `conflict` | **Requires review** |
| `rejected` | **Rejected** |
| `failed` | **Failed — retry available** |

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

At least one flood polygon in the seed has `confidence=uncertain`.

## Command v3 — shell, navigation, Overview (LEAD)
| id | element | attributes |
|---|---|---|
| `nav-overview`, `nav-map`, `nav-settlements`, `nav-routes`, `nav-events`, `nav-audit` | section navigation buttons | `aria-current="page"` on the active one |
| `section-overview`, `section-events`, `section-audit`, `section-settlements`, `section-routes` | section containers (map stays mounted behind/beside them) | |
| `situation-summary` | persistent compact strip (situation lines + counts) | `data-all-clear` |
| `situation-more` | "+N more" link from the strip to Overview | |
| `stat-cut-off`, `stat-blocked-roads`, `stat-active-routes` | counts inside the strip | text = number |
| `overview` | Overview section root | |
| `overview-district`, `overview-simtime`, `overview-scenario` | district / simulation time / active scripted scenario (`Not provided by backend` unless triggered; scenario carries a SYNTHETIC tag) | |
| `overview-count-affected`, `-disconnected`, `-impassable`, `-pending`, `-evac` | clickable count tiles from projections | text includes the number |
| `overview-alerts` / `overview-no-alerts` | critical alert list / all-clear | |
| `overview-alert-<settlement-\|road-\|route-><id>` | one alert (click navigates + selects) | `data-severity` = critical\|warning, `data-new` |
| `overview-recent` / `overview-event` | recent events list / one event | `data-event-id` |
| `context-close` | closes the docked context panel (`feature-panel`) | |

## Command v3 — Live Map, panels, Settlements, Routes (HELPERS 1–2)
| id | element | attributes |
|---|---|---|
| `map` | map container (stays mounted; hidden on non-map sections) | |
| `layer-toggle-<terrain\|rivers\|roads\|settlements\|shelters\|flood\|blocked\|cutoff\|observations\|routes>` | independent layer checkboxes | `checked` / `aria-checked` |
| `map-layer-controls` | layer toggle group | |
| `map-legend`, `map-legend-synthetic`, `map-legend-flood-caveat` | legend; SYNTHETIC tag and the DEM-threshold caveat | |
| `feature-panel` | docked context panel (road/bridge, settlement, route, shelter, flood area, report) | `data-feature-kind`, `data-feature-id` |
| `feature-panel-empty`, `feature-panel-report` | no selection / selected report | |
| `not-provided-<field>` | "Not provided by backend (#15)" placeholder (travel time, depth, validity period, latest safe departure, first failing segment) | |
| `road-reason-<roadId>`, `road-flood-confidence` | road reason / flood confidence | |
| `flood-synthetic-note`, `flood-caveat` | GEO_PROVENANCE synthetic note / "DEM-threshold approximation — not a validated hydraulic simulation" | |
| `blocking-link-<id>`, `link-<kind>-<id>`, `source-event-link`, `provenance-<featureId>` | navigation links inside the panel | |
| `settlements-section`, `settlements-table`, `settlements-search`, `settlements-count`, `settlements-sort-<name\|accessibility\|segment\|deadline\|priority\|status>` | Settlements table controls | |
| `settlement-row-<settlementId>` | settlement row; click selects + highlights on map | `data-accessibility`, `data-status` |
| `segment-<settlementId>`, `priority-<settlementId>`, `na-<field>` | critical segment / priority / "—" (not in contract #15) cells | |
| `routes-section`, `routes-filter-origin`, `routes-filter-destination`, `routes-count`, `routes-source-note` | Routes & Evacuation | |
| `route-row-<routeId>` | route row | `data-status` = active\|recalculated\|unavailable |
| `route-select-<routeId>`, `route-eta-<routeId>`, `route-replaces-<routeId>`, `route-alternative-<routeId>` | route actions / fields | |
| `explain-refusal-<routeId>`, `refusal-missing-<routeId>` | why refused / refusal not provided | |
| `no-safe-route-<settlementId>` | every route for the settlement is unavailable | |

## Command v3 — Reports & Events + Audit (HELPER 3)
| id | element | attributes |
|---|---|---|
| `events-section` | Reports & Events section (windowed chronological feed) | |
| `events-count`, `events-scroll` | feed count / scroll container | |
| `feed-item` | one event in the feed | `data-event-id`, `data-client-event-id`, `data-status`, `data-type` |
| `feed-open-<eventId>` | opens the event drawer | |
| `audit-filter-location`, `audit-filter-from`, `audit-filter-to` | audit filters (plus existing type/status) | |
| `audit-scroll`, `audit-open-<eventId>` | windowed table container / open drawer | |
| `event-drawer` | event detail drawer | `data-event-id` |
| `event-drawer-id`, `event-drawer-status`, `event-drawer-close` | drawer header parts | |
| `event-payload` | original payload, formatted JSON | |
| `event-changes` | resulting changes block | |
| `event-affected-<kind>-<id>` | feature citing this event via sourceEventIds | |
| `event-diff`, `event-diff-item`, `event-diff-empty`, `event-diff-na` | snapshot diff at appliedAtVersion / none / not observed | |

## Field v3 (wave 5)

Owned by Team Field v3 (`apps/field`). Routes are hash routes: `#/home` (default) `#/report` `#/map` `#/households` `#/sync`, plus
`#/report/<clientEventId>` (report detail), `#/households/new` (opens the registration form), `#/camp`. Old hashes `#/household` → households, `#/queue` → sync.
**Migrated ids:** `nav-household` → `nav-households`, `nav-queue` → `nav-sync`. `nav-report` and `nav-camp` are unchanged (`nav-camp` is a header link).
Status labels follow the 7-label spec vocabulary (Saved locally / Waiting to sync / Synchronising / Accepted / Requires review / Rejected / Failed — retry available).

### Shell and Home (lead)
| id | element | attributes |
|---|---|---|
| `nav-home` `nav-report` `nav-map` `nav-households` `nav-sync` | bottom tab bar (mobile) / top nav | `aria-current="page"` when active |
| `home-screen` | Home section | |
| `home-district` | district name (`Majuli (demo)` fixture unless provided) | |
| `home-district-fixture` | "demo fixture" note, shown while the district is not from data | |
| `home-connectivity` | online/offline + last synced | `data-online` |
| `home-new-report` | big New Report link (`#/report`) | |
| `home-register-household` | Register household link (`#/households/new`) | |
| `home-count-pending` / `home-count-synced` / `home-count-attention` | counters from the local queue (attention = conflict, rejected, failed) | `data-attention` |
| `home-recent` / `home-recent-item` / `home-recent-empty` | last 5 items; each links to `#/report/<id>` | |
| `home-sync-now` | manual sync | |

### Report workflow and detail (Helper 1)
| id | element | attributes |
|---|---|---|
| `report-categories` | category radiogroup (big buttons) | |
| `report-type-water_level` / `report-type-flood_report` / `report-type-road_blockage` / `report-type-submerged_bridge` | Water level / Flooded road / Blocked road / Submerged bridge categories (old `report-type-*` ids kept) | `aria-checked`, `data-category` |
| `report-type-road_cleared` | Road reopened | |
| `report-category-damaged_infrastructure` / `report-category-other` | DISABLED, "Blocked: issue #15" | `aria-disabled="true"` |
| `quick-blocked` | shortcut: Blocked road | |
| `field-roadId` | road select (roads only) or bridge select (submerged bridge) | |
| `field-blockage` / `field-cause` / `cause-fixed` | partial/full; obstruction type; fixed "submerged" for bridges | |
| `field-severity` / `field-depthCm` / `field-areaId` | flooded road inputs | |
| `field-levelCm` / `field-trend` / `field-gaugeId` / `estimate-hint` | water level (unit cm); disabled estimated-vs-measured hint (#15) | |
| `field-observedAt` | editable observation time (defaults to now) | |
| `location-summary` | GPS ±m / Manually placed / Unknown | |
| `location-gps` / `location-map-toggle` | optional GPS; open the offline map picker | |
| `map-picker` / `map-picker-unavailable` | compact MapLibre picker / fallback notice | |
| `field-lat` / `field-lng` | manual coordinates | |
| `report-submit` | "Save report" | |
| `report-saved` / `report-saved-label` | confirmation; label text = `Saved locally` | `data-client-event-id` |
| `report-view-detail` / `report-new-another` / `report-done` | confirmation actions | |
| `report-detail` | detail root | `data-client-event-id`, `data-status` (ClientSyncStatus or `superseded`) |
| `detail-status` | 7-label status badge | |
| `detail-client-event-id` / `detail-event-id` / `detail-event-id-none` | Mono ids | |
| `detail-location` / `detail-observed` / `detail-submitted` | location with accuracy; observed vs submitted time (IST) | |
| `detail-payload` | original payload fields | |
| `detail-ack` / `detail-ack-none` | server ack (eventId, acceptedAtVersion) | |
| `detail-review` | conflict reason / rejection errors | |
| `detail-edit` / `detail-back` | edit rejected (creates a linked replacement) / back | |
| `provenance-superseded` / `provenance-open-replacement` | original shows what superseded it | |
| `provenance-supersedes` / `provenance-open-original` | replacement shows what it replaces | |

### Map tab (Helper 2)
Basemap = bundled `@setu/geo` layers (works offline). Report markers: circle = pending, square = accepted, plus text labels.
| id | element | attributes |
|---|---|---|
| `map-canvas` | MapLibre container | |
| `map-offline-note` / `map-basemap-note` | connectivity note / basemap status | |
| `map-key` | marker + layer key (shape + label) | |
| `map-report-<clientEventId>` | marker on the map | |
| `map-you` | volunteer location marker | |
| `map-settlement-<id>` | cut-off settlement marker | |
| `map-projection` / `map-projection-meta` | latest cached projection, "data as of" | |
| `map-blocked-list` / `map-flood-list` / `map-cutoff-list` | blocked roads / flood areas (modelled/synthetic labelled) / cut-off settlements | |
| `map-reports` / `map-report-link` | my reports list (opens detail); `li[data-state]` pending\|accepted\|review\|rejected | |

### Sync screen (Helper 2)
Uses `@setu/ui` `SyncStatusSummary` (`sync-summary`, `sync-count-queued|synchronising|synced|conflict|rejected|failed`) and `ConfirmDialog` (role=dialog, buttons "Keep report" / "Discard report").
| id | element | attributes |
|---|---|---|
| `sync-connectivity` / `sync-last-success` | connectivity; last successful sync | `data-online` / `data-ts` |
| `queue-sync-now` | manual sync | |
| `queue-filter-<key>` / `queue-list` / `queue-item` | filters; list; one item | item: `data-client-event-id`, `data-status`, `data-spec-label`, `data-type` |
| `queue-item-explain` / `queue-detail-link` | one-line explanation; link to `#/report/<id>` | |
| `queue-retry` / `queue-edit` / `queue-discard` | per-item actions (discard asks to confirm) | |
| `conflict-panel` / `conflict-keep-mine` / `conflict-accept-server` | review panel | |

### Households and camp (Helper 3)
| id | element | attributes |
|---|---|---|
| `households-screen` | Households tab root | |
| `households-register` / `households-cancel` | open / close the registration form | |
| `households-saved` | "Saved locally" confirmation after registering | |
| `households-search` | search box (name, village, camp; local households only) | |
| `households-list` / `household-row` | list / one household | row: `data-household-id`, `data-client-event-id`, `data-status` |
| `households-no-match` | no search result message | |
| `household-history-toggle` / `household-history` / `household-history-item` | registration history (events + statuses) | item: `data-client-event-id`, `data-status` |
| `household-open-detail` / `household-open-report` | open report detail (needs `onOpenReport`) | |
| `household-edit` | edit and resubmit a rejected household | |
| `household-id` | locally generated `householdId` (form) | |
| `household-shelterId` | current camp select (form; hidden in camp mode) | |
| `household-places-missing` | no cached village list | |
| `household-member-names-blocked` / `household-member-names-blocked-summary` | "Blocked: #15" note | |
| `household-duplicates-blocked` | duplicate review placeholder (BLOCKED #15) | |
| `camp-summary`, `camp-summary-households` / `-people` / `-pending` / `-review` / `-rejected` | camp summary counts | |
| `camp-capacity` | "not published" capacity/occupancy note | |
| `camp-open-report` | open report detail from a camp row | |

Existing `household-*`, `field-lat`/`field-lng`, `camp-*` ids are unchanged. `household-settlementId` now lists cached settlements (`Name (osm_id)`); the form takes a `snapshot` prop. Lead integration: `<HouseholdsScreen snapshot onOpenReport startRegistering />` and `<CampScreen onOpenReport />`.

## Offline PWA (wave 7)

### Status and staleness (Helper 3)
| id | element | attributes |
|---|---|---|
| `connectivity-status` | the one connectivity indicator (header, Home, Sync) | `data-state=online\|offline\|backend-unreachable\|syncing` |
| `connectivity-pending` / `connectivity-failed` | pending and failed counts | `data-count` |
| `last-synced` | last successful sync (IST + relative); Sync screen and header | `data-ts` |
| `data-as-of` | "operational data as of …" from `cachedAt` | `data-ts` |
| `stale-warning` | stale-data banner on Home, Map, Camp and Command header | `data-level=amber\|red` (amber > 15 min, red > 60 min) |
| `origin-badge` | Local / Remote label with distinct shape on markers and lists | `data-origin=local\|remote` |

### Install, update, storage (Helpers 1 and 2)
| id | element | attributes |
|---|---|---|
| `install-app` | install button (hidden if installed or no prompt) | |
| `update-toast` / `update-reload` / `update-dismiss` | new-version toast and its actions | |
| `storage-error` | banner for a failed local write (form data kept) | `data-kind=quota\|unavailable\|unknown` |
| `queue-sync-now` | manual retry (existing id) | |
