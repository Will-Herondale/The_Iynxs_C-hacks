import { useSyncExternalStore } from 'react';

/** Server event records that failed contract validation on the last fetch (reported by the http client, never silently dropped). */
export interface SkippedInfo { skipped: number; total: number; firstIssue?: string }
let current: SkippedInfo = { skipped: 0, total: 0 };
const listeners = new Set<() => void>();
export function setSkippedEvents(info: SkippedInfo): void {
  if (info.skipped === current.skipped && info.total === current.total) return;
  current = info; listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useSkippedEvents = (): SkippedInfo => useSyncExternalStore(subscribe, () => current);

export function SkippedEventsNotice() {
  const { skipped, total, firstIssue } = useSkippedEvents();
  if (skipped === 0) return null;
  return (
    <p role="status" data-testid="skipped-events-notice" data-skipped={skipped}>
      ⚠ {skipped} of {total} server records are not shown: they failed contract validation
      {firstIssue ? ` (${firstIssue})` : ''}. The list below is incomplete (backend issue #22).
    </p>
  );
}
