import type { ClientSyncStatus } from '@setu/contract';
import { summaryGroups } from './statusVocab.js';

export interface SyncSummaryProps {
  counts: Record<ClientSyncStatus, number>;
  online: boolean;
  lastSyncedAt?: number;
}

/** Connectivity, last successful sync and per-status counts (labels, not just colour). */
export function SyncSummary({ counts, online, lastSyncedAt }: SyncSummaryProps) {
  const iso = lastSyncedAt ? new Date(lastSyncedAt).toISOString() : '';
  return (
    <section className="sync-summary" aria-label="Sync summary" data-testid="sync-summary">
      <p>
        <strong data-testid="sync-connectivity" data-online={online ? 'true' : 'false'}>
          {online ? '● Online' : '○ Offline — reports are saved on this device'}
        </strong>
      </p>
      <p>
        Last successful sync:{' '}
        <time data-testid="sync-last-success" data-ts={iso} dateTime={iso || undefined}>
          {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'never'}
        </time>
      </p>
      <ul className="sync-summary__counts">
        {summaryGroups(counts, online).map((g) => (
          <li key={g.key} data-testid={`sync-count-${g.key}`} data-count={g.count}>
            <strong>{g.count}</strong> {g.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
