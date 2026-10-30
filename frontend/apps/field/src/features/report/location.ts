import { useCallback, useEffect, useRef, useState } from 'react';

/** Majuli (demo district) centre: map starts here. It is a map viewport only, never submitted as a report location. */
export const MAJULI_CENTER = { lat: 26.95, lng: 94.17 };
/** @deprecated kept for imports; use MAJULI_CENTER. */
export const DEFAULT_LOCATION = MAJULI_CENTER;

export type GpsState = 'idle' | 'locating' | 'ok' | 'unavailable';

export interface GpsFix { lat: number; lng: number; accuracyM?: number }

/** Asks navigator.geolocation once on mount (and on demand) and reports the fix; never blocks the form. */
export function useGeolocation(onFix: (pos: GpsFix) => void, auto = true) {
  const [state, setState] = useState<GpsState>('idle');
  const cb = useRef(onFix);
  cb.current = onFix;
  const locate = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState('unavailable');
      return;
    }
    setState('locating');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        cb.current({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), accuracyM: Math.round(p.coords.accuracy) });
        setState('ok');
      },
      () => setState('unavailable'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  }, []);
  useEffect(() => {
    if (auto) locate();
  }, [auto, locate]);
  return { gps: state, locate };
}

/** One visible line describing how trustworthy the chosen location is. */
export function describeLocation(source: 'gps' | 'map' | 'manual' | 'unknown', accuracyM?: number): string {
  if (source === 'gps') return accuracyM === undefined ? 'GPS (accuracy not reported)' : `GPS, accurate to about ±${Math.round(accuracyM)} m`;
  if (source === 'map') return 'Manually placed on the map';
  if (source === 'manual') return 'Manually placed (typed coordinates)';
  return 'Unknown: choose a point on the map, use GPS, or type coordinates';
}
