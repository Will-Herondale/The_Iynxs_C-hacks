# Command Map coordinate audit — 2026-10-31

## Verdict

The white-space placement is caused by the synthetic demo coordinates being
outside the bundled Majuli island/base-data extent. It is **not** a CRS,
axis-order, or microdegree conversion error.

## Coordinate conventions

- Bundled frontend GeoJSON: longitude/latitude degrees, EPSG:4326.
- Backend source GeoJSON: longitude/latitude degrees, EPSG:4326.
- Backend point artifacts: converted with `degToMicrodeg(deg) = round(deg *
  1_000_000)` in `packages/server/src/geo-artifacts.ts`; projection responses
  convert them back to degrees in `buildSettlements`/`buildShelters`.
- MapLibre receives `[lng, lat]` coordinates. The frontend does not transform
  or swap axes.

## Exact extents

| Dataset / extent | min longitude | min latitude | max longitude | max latitude |
|---|---:|---:|---:|---:|
| Frontend `MAJULI_BOUNDS` / island | 93.95658 | 26.86636 | 94.59287 | 27.18220 |
| Frontend roads | 93.95044 | 26.85446 | 94.49482 | 27.13823 |
| Frontend minor roads | 93.96572 | 26.91254 | 94.40863 | 27.09550 |
| Frontend bridges | 93.97031 | 26.87023 | 94.42321 | 27.09951 |
| Frontend places | 94.05852 | 26.91064 | 94.27677 | 26.98055 |
| Frontend shelters | 94.14668 | 26.92481 | 94.42692 | 27.09511 |
| Backend demo road graph | 93.96490 | 26.88161 | 94.48446 | 27.13638 |
| Bundled hillshade image | 93.59986 | 26.77986 | 94.70014 | 27.22014 |

The hillshade is deliberately a larger raster rectangle for orientation; its
extent must not be treated as the island/data extent.

## Synthetic coordinates

Defined in `packages/server/src/geo-artifacts.ts:393-398`:

| Feature | longitude | latitude |
|---|---:|---:|
| `syn-settlement-1` | 94.500000 | 26.800000 |
| `syn-bridge-1` | 94.500500 | 26.800500 |
| `syn-shelter-1` | 94.501000 | 26.801000 |

All three are below the island south bound `26.86636`; they are also south of
the backend road graph minimum `26.88161`. Their longitude is inside
`MAJULI_BOUNDS`, but just east of the frontend road max `94.49482` and the
backend road-graph max `94.48446`. Therefore the synthetic settlement/bridge
can render in map viewport white space while the real bundled roads/island
remain in the visible rectangle.

## Safest correction

Do **not** expand `MAJULI_BOUNDS`, alter the hillshade rectangle, or add a
frontend coordinate transform. That would hide the data error by showing more
empty raster space and would weaken the geographic framing.

The safe correction is backend-owned: relocate the entire synthetic connected
subgraph together to a verified point inside the island polygon and the loaded
road-data extent. Update all six linked locations consistently:

- `SYN_LNG` / `SYN_LAT`
- bridge coordinates
- shelter coordinates
- synthetic node keys
- flood reference point
- route geometry

A candidate must be checked against the actual island polygon and selected to
avoid an accidental claim that it is a real road/settlement. For example,
`[94.35, 27.00]` is inside the bundled island polygon and both data extents,
but it is only a candidate—not an approved new demo location.

Darsh does not need to change frontend rendering for this correction. The
frontend should continue treating these as WGS84 `[lng, lat]` features and
displaying the `synthetic` label.

## Evidence / source pointers

- Frontend bounds: `frontend/packages/geo/src/generated.ts:229`.
- Hillshade placement: `frontend/packages/geo/src/style/baseLayers.ts:84-88`.
- Command map initial bounds: `frontend/apps/command/src/map/basemap.ts:6` and
  `MapView.tsx:76-81`.
- Backend synthetic coordinates: `packages/server/src/geo-artifacts.ts:393-480`.
- Backend conversion: `packages/server/src/geo-artifacts.ts:28-30`.
- Frontend map placement uses `[lng, lat]` directly in `MapView.tsx:184-187`.

No data or application source was changed during this audit.
