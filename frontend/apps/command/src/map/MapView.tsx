import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MlMap, type MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useProjections } from '../data';
import { LAYER_NAMES, useLayerVisibility, useSelection } from '../app';
import {
  EMPTY_FC, GROUP_LAYERS, INTERACTIVE_LAYERS, KIND_LAYER, MAP_CENTER, MAP_LAYERS, MAP_ZOOM,
  SOURCE_IDS, featureToSelection, selectionFilter, snapshotSources,
} from './layers';
import { Legend } from './Legend';

const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

/**
 * MapLibre map. Created once; snapshot changes only call setData on existing sources.
 * Renders server projections as-is. Tiles failing (offline) never affect the vector layers.
 */
export function MapView() {
  const { snapshot, version } = useProjections();
  const { visible } = useLayerVisibility();
  const { selected, select } = useSelection();

  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const selectRef = useRef(select);
  selectRef.current = select;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    let map: MlMap;
    try {
      map = new maplibregl.Map({
        container: container.current,
        center: MAP_CENTER,
        zoom: MAP_ZOOM,
        attributionControl: { compact: true },
        style: {
          version: 8,
          sources: {
            osm: {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              maxzoom: 19,
              attribution: OSM_ATTRIBUTION,
            },
          },
          layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
        },
      });
    } catch {
      // No WebGL (e.g. jsdom, blocked GPU): the lists and panels still work.
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    // Tile/network errors are expected when offline; vector layers keep rendering.
    map.on('error', () => {});

    map.on('load', () => {
      for (const group of LAYER_NAMES) {
        map.addSource(SOURCE_IDS[group], { type: 'geojson', data: EMPTY_FC });
      }
      for (const layer of MAP_LAYERS) map.addLayer(layer);

      for (const id of INTERACTIVE_LAYERS) {
        map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
      }
      setReady(true);
    });

    map.on('click', (e: MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: INTERACTIVE_LAYERS.filter((l) => map.getLayer(l)) });
      for (const f of hits) {
        const sel = featureToSelection(f.layer.id, f.properties);
        if (sel) return selectRef.current(sel);
      }
      selectRef.current(undefined);
    });

    return () => {
      mapRef.current = null;
      setReady(false);
      map.remove();
    };
  }, []);

  // Update sources in place when the server snapshot changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !snapshot) return;
    const data = snapshotSources(snapshot);
    for (const group of LAYER_NAMES) {
      (map.getSource(SOURCE_IDS[group]) as GeoJSONSource | undefined)?.setData(data[group] as never);
    }
  }, [ready, snapshot]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const group of LAYER_NAMES) {
      for (const id of GROUP_LAYERS[group]) {
        map.setLayoutProperty(id, 'visibility', visible[group] ? 'visible' : 'none');
      }
    }
  }, [ready, visible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const group of LAYER_NAMES) {
      const id = selected && KIND_LAYER[selected.kind] === group ? selected.id : undefined;
      map.setFilter(`${group}-selected`, selectionFilter(group, id));
    }
  }, [ready, selected]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}>
      <div
        ref={container}
        data-testid="map"
        data-projection-version={version ?? ''}
        role="application"
        aria-label="Situation map"
        style={{ position: 'absolute', inset: 0 }}
      />
      <Legend />
    </div>
  );
}
