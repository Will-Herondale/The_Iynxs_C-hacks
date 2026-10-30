import type { StyleSpecification } from 'maplibre-gl';
import { createOfflineStyle, MAJULI_BOUNDS, MAJULI_CENTER } from '@setu/geo';

/** The single seam to the offline district basemap: bundled `@setu/geo` layers, no network. */
export const BASEMAP_SOURCE: '@setu/geo' | 'placeholder' = '@setu/geo';

/** Majuli (demo), [lng, lat]. */
export const DISTRICT_CENTER: [number, number] = MAJULI_CENTER;
export const DISTRICT_BOUNDS: [[number, number], [number, number]] = MAJULI_BOUNDS;

/** terrain:false until @setu/geo ships data/hillshade.png (file missing at 54a4957). Self-contained style (no glyphs, sprite or http URLs); data is filled by `addBaseLayers` on load. */
export function createBasemapStyle(): StyleSpecification {
  return createOfflineStyle({ terrain: false }) as unknown as StyleSpecification;
}
