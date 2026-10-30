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

## Scripted mock scenario (from `@setu/mock-backend` seed)
- `road_blockage` with `roadId=R7` and `blockage=full`:
  - R7 becomes `blocked`;
  - S3 becomes `cut_off`;
  - EVAC-2 becomes `unavailable`, and EVAC-2b appears as `recalculated`.
- R4 full: S1 becomes `cut_off`; EVAC-1 is replaced by EVAC-1b.
- R3 full: S5 becomes `cut_off`. R10 full: S6 becomes `cut_off`.
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
A `road_blockage` with `roadId=B1`, `blockage=full`, `cause=submerged` (bridge "Bharalu Bridge") does all of the following:
- B1 becomes `blocked`, `passability=impassable`, with a `reason`.
- Flood area A2 grows (`confidence=observed`).
- S4 becomes `cut_off`, with a `cutOffReason` whose `blockingFeatureIds` includes B1 and that event, plus an `evacuationDeadline` and `evacuationPriority=critical`.
- EVAC-3 becomes `unavailable` with a `refusal` explaining that B1 is impassable.

At least one flood polygon in the seed has `confidence=uncertain`.

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
