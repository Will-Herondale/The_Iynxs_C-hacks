import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MlMap, type MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useProjections } from '../data';
import { LAYER_NAMES, useLayerVisibility, useSelection } from '../app';
import {
  EMPTY_FC, GROUP_LAYERS, INTERACTIVE_LAYERS, KIND_LAYER, MAP_CENTER, MAP_LAYERS, MAP_ZOOM,
  SOURCE_IDS, featureToSelection, idsFilter, selectionFilter, snapshotSources,
} from './layers';
import { blockingByGroup, blockingIds, buildMarkers, type MarkerSpec } from './markers';
import { Legend } from './Legend';

function markerElement(m: MarkerSpec, onSelect: () => void): HTMLElement {
  const el = document.createElement('div');
  el.dataset.testid = `map-marker-${m.featureId}`;
  el.dataset.markerKind = m.kind;
  if (m.passability) el.dataset.passability = m.passability;
  el.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;font:600 12px system-ui,sans-serif;';
  const label = document.createElement('span');
  label.textContent = m.label;
  const tone = m.cutOff || m.impassable ? '#b71c1c' : m.kind === 'shelter' ? '#00695c' : '#212121';
  label.style.cssText = `background:#fff;color:${tone};border:1.5px solid ${tone};border-radius:4px;padding:1px 5px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.4);`;
  if (m.kind === 'bridge') {
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = m.impassable ? '✕' : '≍';
    icon.style.cssText = m.impassable
      ? 'width:34px;height:34px;border-radius:50%;background:#c62828;color:#fff;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-size:24px;line-height:1;box-shadow:0 0 0 3px #c62828,0 2px 6px rgba(0,0,0,.5);'
      : 'width:26px;height:26px;border-radius:4px;background:#212121;color:#fff;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1;';
    el.append(icon, label);
  } else {
    label.style.marginTop = m.kind === 'settlement' ? '26px' : '14px';
    el.append(label);
  }
  el.addEventListener('click', (e) => { e.stopPropagation(); onSelect(); });
  return el;
}

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
  const markersRef = useRef<maplibregl.Marker[]>([]);
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

  // Bridge / cut-off settlement / shelter labels. Rebuilt per snapshot (a handful of markers).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !snapshot) return;
    for (const m of markersRef.current) m.remove();
    markersRef.current = buildMarkers(snapshot).map((m) =>
      new maplibregl.Marker({ element: markerElement(m, () => selectRef.current({ kind: m.featureKind, id: m.featureId })), anchor: 'center' })
        .setLngLat([m.lng, m.lat])
        .addTo(map),
    );
    return () => { for (const m of markersRef.current) m.remove(); markersRef.current = []; };
  }, [ready, snapshot]);

  // Pulse the red halo behind cut-off settlements.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const t = setInterval(() => {
      const k = (Math.sin(Date.now() / 350) + 1) / 2;
      if (map.getLayer('settlements-halo')) {
        map.setPaintProperty('settlements-halo', 'circle-radius', 18 + k * 12);
        map.setPaintProperty('settlements-halo', 'circle-opacity', 0.45 - k * 0.3);
      }
    }, 70);
    return () => clearInterval(t);
  }, [ready]);

  // Highlight the features blocking the selected settlement/route (server-provided ids).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const by = blockingByGroup(snapshot, blockingIds(snapshot, selected));
    map.setFilter('roads-blocking', idsFilter('roads', by.roads));
    map.setFilter('flood-blocking', idsFilter('flood', by.flood));
  }, [ready, snapshot, selected]);

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
