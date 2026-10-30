import { Button, OnlineIndicator } from '@setu/ui';
import { LastSyncedLine } from '../status/index.js';
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

export const LastSynced = LastSyncedLine;

export function SyncNowButton() {
  const { syncing, online } = useSyncState();
  return (
    <Button
      data-testid="sync-now"
      onClick={() => {
        void syncNow({ force: true });
      }}
      disabled={syncing || !online}
      aria-busy={syncing}
    >
      {syncing ? 'Syncing…' : 'Sync now'}
    </Button>
  );
}
