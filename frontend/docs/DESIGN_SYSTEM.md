# SETU design system (`@setu/ui`)

One calm, information-dense, professional emergency-operations look for the Field and Command apps.
Import tokens and styles once per app: `@setu/ui/tokens.css` then `@setu/ui/components.css`.
Fonts (Inter, JetBrains Mono) are bundled locally through `@fontsource`; there is no CDN or other runtime network use.

## Principles
1. **Read the situation at a glance.** Strong hierarchy: one primary thing per region, muted secondary text, monospace only for IDs and times.
2. **Colour is never the only signal.** Every colour-coded state also carries an icon, a text label or a border/fill pattern.
3. **Observed, modelled and synthetic look different.** Observed = solid border. Modelled = dashed border + "MODELLED" label. Synthetic = dotted border + `SyntheticTag`. The DEM-threshold flood is a screening estimate, never a validated hydraulic simulation.
4. **Honest states.** If the backend does not provide data, show `ErrorState` (`missing-geo`, `empty`, …) or a "Not provided by backend" / "Blocked: issue #15" note. Never fake numbers.
5. **"Accepted" means confirmed.** HTTP 2xx is not convergence; `synced` (server confirmed applied) is the only state labelled Accepted.
6. **Calm.** No gradients, glassmorphism, large rounded cards or decorative animation. Radii are 2–4px. Motion only for the sync spinner, and not under `prefers-reduced-motion`.
7. **WCAG AA.** Text contrast ≥ 4.5:1, UI contrast ≥ 3:1, visible focus ring, 44px touch targets in the Field theme, keyboard operable everywhere. Components are covered by `jest-axe` tests.

## Themes
`[data-theme='field']` (default, light, outdoor/high contrast) and `[data-theme='command']` (dark, operations room). Set it on a root element.

## Tokens (`tokens.css`)
| Group | Tokens |
|---|---|
| Semantic colour | `--setu-water` (blue: water/inundation), `--setu-critical` (red: impassable/critical), `--setu-warn` / `--setu-warning` (orange), `--setu-ok` / `--setu-safe` (green: safe/accessible), `--setu-unavailable` (grey: disconnected), `--setu-review` (purple: requires review); each has a `-bg` tint |
| Surface / border / text | `--setu-bg`, `--setu-surface-0..3`, `--setu-border`, `--setu-border-subtle`, `--setu-border-strong`, `--setu-text`, `--setu-text-secondary`, `--setu-text-muted`, `--setu-text-disabled` |
| Sync status | `--setu-sync-queued … failed` |
| Spacing | `--setu-space-0..10` |
| Type | `--setu-text-xs … 2xl`, `--setu-weight-*`, `--setu-leading-*`, `--setu-font`, `--setu-font-mono` |
| Radii / focus | `--setu-radius-sm/md/lg` (2–4px), `--setu-focus`, `--setu-focus-ring` |

Map colours for MapLibre paint are exported as `SETU_MAP_COLORS` (hex, command theme) and match the tokens.

## Status vocabulary
| ClientSyncStatus | Label | Icon role |
|---|---|---|
| queued, offline | Saved locally | hollow |
| queued, online | Waiting to sync | clock |
| sending / accepted-not-confirmed | Synchronising | spinner |
| synced (confirmed) | Accepted | check |
| conflict | Requires review | warning |
| rejected | Rejected | cross |
| failed | Failed — retry available | alert |

Use `SyncStatusBadge` (alias `StatusBadge`) `{status, online?}`; its label span keeps `data-testid="sync-status-label"`.

## Components and usage rules
| Component | Use for | Rule |
|---|---|---|
| `SyncStatusBadge` / `StatusBadge` | per-event sync state | Pass `online` so queued reads correctly. Never invent labels. |
| `SyncStatusSummary` | counts per status + last sync + connectivity | Counts come from the local queue / server, not guesses. |
| `OfflineBanner` | persistent offline notice | Place at top of shell; not dismissible while offline. |
| `SeverityLabel` | 1–5 or critical/high/normal | Always shows text, not just colour. |
| `EventCard` | a feed/queue entry | Show observed time; show received time when it differs. |
| `ObservationCard` | observed / modelled / synthetic data | Choose `kind` honestly; synthetic adds `SyntheticTag`. |
| `SyntheticTag` | any synthetic scenario data | Required wherever Karthik's scenarios or derived fixtures appear. |
| `DataTable` | sortable, searchable lists | Give `getRowId`; use `searchKeys`; 100 rows per page. |
| `ContextPanel` | detail of selected feature | `onClose` required; Esc closes. |
| `FormField` | label + hint + error around one control | Error replaces hint; wires aria attributes. |
| `ConfirmDialog` | destructive/irreversible actions | State consequence in `body`; confirm label names the action. |
| `LoadingState` / `ErrorState` | async states | Use the matching `kind`; add an `action` when retry is possible. |
| `Timestamp` | any time | IST, monospace, optional relative text. |
| `Mono` | IDs (`MJ-SH-009`, event ids) | Never wrap prose. |
| `Explanation`, `DeadlineBadge`, `PassabilityLegend` | why-cut-off, evacuation deadline, map legend | Unchanged API. |

## Do / Don't
- **Do** pair colour with text: `<SeverityLabel level="critical" />` renders "Critical".
- **Don't** show a bare red dot for "blocked".
- **Do** label modelled flood: `<ObservationCard kind="modelled" …>` ("MODELLED — DEM threshold, not a hydraulic simulation").
- **Don't** present synthetic scenarios as live reports.
- **Do** show `ErrorState kind="missing-geo"` when a layer is absent. **Don't** fabricate a placeholder map.
- **Do** use `Mono` for `MJ-SH-009`. **Don't** use monospace for body text.
- **Don't** add gradients, shadows beyond a 1px border, or radii above 4px.

## Testing
Each component has a vitest + `jest-axe` test in `packages/ui/src`. Run `npm test` from `frontend/`.
