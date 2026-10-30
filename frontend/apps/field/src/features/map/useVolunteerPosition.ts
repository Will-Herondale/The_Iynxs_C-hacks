import { useEffect, useState } from 'react';

export interface VolunteerPosition {
  lat: number;
  lng: number;
  accuracyM?: number;
}

/** Optional device location; absent when unsupported, denied or not yet fixed. Never required. */
export function useVolunteerPosition(): VolunteerPosition | undefined {
  const [pos, setPos] = useState<VolunteerPosition>();
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy }),
      () => setPos(undefined),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return pos;
}
