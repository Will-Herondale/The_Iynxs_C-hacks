import { Button, OnlineIndicator } from '@setu/ui';
import { syncNow, useSyncState } from '../../sync/index.js';

export function OnlineStatus() {
  const { online } = useSyncState();
  return (
    <span data-testid="online-indicator" data-online={online ? 'true' : 'false'}>
      <OnlineIndicator online={online} />
    </span>
  );
}

export function PendingCount() {
  const { pendingCount } = useSyncState();
  return (
    <span className="queue-pending" title="Reports not yet confirmed as synced">
      Waiting to sync: <strong data-testid="pending-count">{pendingCount}</strong>
    </span>
  );
}

export function LastSynced() {
  const { lastSyncedAt } = useSyncState();
  const iso = lastSyncedAt ? new Date(lastSyncedAt).toISOString() : '';
  return (
    <span className="queue-last-synced">
      Last synced:{' '}
      <time data-testid="last-synced" data-ts={iso} dateTime={iso || undefined}>
        {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : 'never'}
      </time>
    </span>
  );
}

export function SyncNowButton() {
  const { syncing, online } = useSyncState();
  return (
    <Button
      data-testid="sync-now"
      onClick={() => {
        void syncNow();
      }}
      disabled={syncing || !online}
      aria-busy={syncing}
    >
      {syncing ? 'Syncing…' : 'Sync now'}
    </Button>
  );
}
