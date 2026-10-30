import type { ClientSyncStatus } from '@setu/contract';

export interface SyncStatusMeta {
  label: string;
  icon: string;
  description: string;
}

/**
 * One entry per ClientSyncStatus. Each has its own glyph and CSS class, so colour is never the only signal.
 * `sending` and `accepted` share the label "Synchronising" (spec vocabulary): the server has not yet
 * confirmed the event as applied. HTTP 2xx is not convergence.
 */
export const SYNC_STATUS_META: Record<ClientSyncStatus, SyncStatusMeta> = {
  queued: { label: 'Waiting to sync', icon: '○', description: 'Saved on this device, waiting to be sent' },
  sending: { label: 'Synchronising', icon: '↻', description: 'Sending to the server' },
  accepted: { label: 'Synchronising', icon: '◐', description: 'Server received it; not yet confirmed as applied' },
  synced: { label: 'Accepted', icon: '✓', description: 'Server confirmed the event was applied' },
  conflict: { label: 'Requires review', icon: '⚠', description: 'Conflicts with server state; needs review' },
  rejected: { label: 'Rejected', icon: '✗', description: 'The server rejected this event' },
  failed: { label: 'Failed — retry available', icon: '!', description: 'Sending failed; retry is available' },
};

/** Label for queued items created while the device is offline. */
export const OFFLINE_QUEUED_META: SyncStatusMeta = {
  label: 'Saved locally',
  icon: '▣',
  description: 'Saved on this device; will send when back online',
};

export function syncStatusMeta(status: ClientSyncStatus, online?: boolean): SyncStatusMeta {
  return status === 'queued' && online === false ? OFFLINE_QUEUED_META : SYNC_STATUS_META[status];
}

export interface StatusBadgeProps {
  status: ClientSyncStatus;
  /** When false, a queued item reads "Saved locally" instead of "Waiting to sync". */
  online?: boolean;
}

export function StatusBadge({ status, online }: StatusBadgeProps) {
  const meta = syncStatusMeta(status, online);
  const offlineQueued = status === 'queued' && online === false;
  return (
    <span
      className={`setu-sync setu-sync--${status}${offlineQueued ? ' setu-sync--offline' : ''}`}
      role="status"
      data-status={status}
      aria-label={`Sync status: ${meta.label}. ${meta.description}`}
      title={meta.description}
    >
      <span className="setu-sync__icon" aria-hidden="true">{meta.icon}</span>
      <span className="setu-sync__label" data-testid="sync-status-label">{meta.label}</span>
    </span>
  );
}

export const SyncStatusBadge = StatusBadge;
