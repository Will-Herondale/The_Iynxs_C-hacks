import { useSyncState } from '../sync/index.js';

/** Shown across the top of every screen while the device is offline. */
export function OfflineBanner() {
  const { online } = useSyncState();
  if (online) return null;
  return (
    <div className="offline-banner" role="status" data-testid="offline-banner">
      You&apos;re offline — reports are saved on this device and will sync automatically.
    </div>
  );
}
