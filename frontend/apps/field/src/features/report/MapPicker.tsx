import { useEffect, useRef, useState } from 'react';
import type { Map as MlMap, Marker, StyleSpecification } from 'maplibre-gl';
import { MAJULI_CENTER } from './location.js';
import { addBaseLayers } from '@setu/geo';
import { plainOfflineStyle } from './geoStyle.js';

export interface MapPickerProps {
  value: { lat: number; lng: number } | null;
  onPick: (pos: { lat: number; lng: number }) => void;
  /** Offline style factory; pass `createOfflineStyle` from `@setu/geo`. Defaults to a plain background. */
  createStyle?: () => StyleSpecification;
  /** Called once the map has loaded, e.g. to run `addBaseLayers(map)` from `@setu/geo`. */
  onMapReady?: (map: MlMap) => void;
}

/**
 * Compact MapLibre picker: tap to place the report location. Loaded lazily; where WebGL is unavailable it
 * renders a notice and the coordinate fields stay usable (the map is never required to submit).
 */
export function MapPicker({ value, onPick, createStyle = plainOfflineStyle, onMapReady }: MapPickerProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ml = await import('maplibre-gl');
        await import('maplibre-gl/dist/maplibre-gl.css');
        if (cancelled || !el.current) return;
        const m = new ml.Map({
          container: el.current,
          style: createStyle(),
          center: [value?.lng ?? MAJULI_CENTER.lng, value?.lat ?? MAJULI_CENTER.lat],
          zoom: value ? 13 : 10,
          attributionControl: false,
        });
        map.current = m;
        m.on('load', () => {
          void addBaseLayers(m as never).catch(() => undefined);
          onMapReady?.(m);
        });
        m.on('click', (e) => pick.current({ lat: +e.lngLat.lat.toFixed(6), lng: +e.lngLat.lng.toFixed(6) }));
        m.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
        if (value) marker.current = new ml.Marker().setLngLat([value.lng, value.lat]).addTo(m);
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !value) return;
    void import('maplibre-gl').then((ml) => {
      if (!map.current) return;
      if (marker.current) marker.current.setLngLat([value.lng, value.lat]);
      else marker.current = new ml.Marker().setLngLat([value.lng, value.lat]).addTo(map.current);
      map.current.easeTo({ center: [value.lng, value.lat] });
    });
  }, [value?.lat, value?.lng]);

  if (unavailable) {
    return <p role="status" data-testid="map-picker-unavailable">The map cannot be shown on this device. Use GPS or type the coordinates below.</p>;
  }
  return (
    <div
      ref={el} data-testid="map-picker" role="application" aria-label="Offline map: tap to place the report location"
      style={{ height: 220, width: '100%', borderRadius: 8, border: '1px solid #9aa7b4' }}
    />
  );
}
