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
