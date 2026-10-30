import type { StyleSpecification } from 'maplibre-gl';

/**
 * The single seam to the offline district basemap.
 *
 * TODO(lead): once `@setu/geo` is merged, replace the body of `createBasemapStyle` with
 * `createOfflineStyle({ terrain: true })`, re-export MAJULI_BOUNDS / MAJULI_CENTER here and
 * set `BASEMAP_SOURCE = '@setu/geo'`. No other file in features/map touches the basemap.
 */
export const BASEMAP_SOURCE: '@setu/geo' | 'placeholder' = 'placeholder';

/** Majuli (demo), approx. [lng, lat]. */
export const DISTRICT_CENTER: [number, number] = [94.17, 26.95];
export const DISTRICT_BOUNDS: [[number, number], [number, number]] = [
  [93.95, 26.8],
  [94.4, 27.1],
];

/** No network URLs: a plain background so projection layers and markers still render offline. */
export function createBasemapStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [{ id: 'setu-bg', type: 'background', paint: { 'background-color': '#eef1e6' } }],
  };
}
