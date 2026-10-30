import { useCallback, useEffect, useState } from 'react';

/** Default map centre (Guwahati) used when GPS is unavailable; the field stays editable. */
export const DEFAULT_LOCATION = { lat: 26.1445, lng: 91.7362 };

export type GpsState = 'idle' | 'locating' | 'ok' | 'unavailable';

/** Asks navigator.geolocation once on mount (and on demand) and reports the fix; never blocks the form. */
export function useGeolocation(onFix: (pos: { lat: number; lng: number; accuracyM?: number }) => void, auto = true) {
  const [state, setState] = useState<GpsState>('idle');
  const locate = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState('unavailable');
      return;
    }
    setState('locating');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onFix({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), accuracyM: p.coords.accuracy });
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
