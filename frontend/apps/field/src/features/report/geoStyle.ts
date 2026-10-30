import type { StyleSpecification } from 'maplibre-gl';

/**
 * Plain offline style: a background only, no external URLs.
 * Once `@setu/geo` is merged, pass `createOfflineStyle` (and add the base layers) to `MapPicker`
 * via its `createStyle` / `onMapReady` props to show the district basemap.
 */
export function plainOfflineStyle(): StyleSpecification {
  return { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e8eef3' } }] };
}
