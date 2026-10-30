import { OfflineBanner as UiOfflineBanner } from '@setu/ui';
import { useSyncState } from '../sync/index.js';

/** Shown across the top of every screen while the device is offline (design-system banner). */
export function OfflineBanner() {
  const { online } = useSyncState();
  return <UiOfflineBanner online={online} />;
}
