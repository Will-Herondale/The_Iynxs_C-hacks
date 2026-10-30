import type { ClientSyncStatus } from '@setu/contract';

export interface SyncStatusMeta {
  label: string;
  icon: string;
  description: string;
}

/** One entry per ClientSyncStatus: distinct label + glyph + CSS class (never colour alone). */
export const SYNC_STATUS_META: Record<ClientSyncStatus, SyncStatusMeta> = {
  queued: { label: 'Queued for sync', icon: '○', description: 'Saved on this device, not yet sent' },
  sending: { label: 'Submitted', icon: '↻', description: 'Sending to server' },
  accepted: { label: 'Accepted — awaiting confirmation', icon: '◐', description: 'Server received it; not yet confirmed in the shared feed' },
  synced: { label: 'Confirmed', icon: '✓', description: 'Confirmed in the shared feed' },
  conflict: { label: 'Disputed', icon: '⚠', description: 'Conflicts with server state; needs review' },
  rejected: { label: 'Rejected', icon: '✗', description: 'Server rejected this report' },
  failed: { label: 'Retrying', icon: '!', description: 'Temporary failure; will retry automatically' },
};

/** Label for queued items created while the device is offline. */
export const OFFLINE_QUEUED_META: SyncStatusMeta = {
  label: 'Saved on device',
  icon: '○',
  description: 'Saved on this device; will send when back online',
};

export function SyncStatusBadge({ status, online }: { status: ClientSyncStatus; online?: boolean }) {
  const meta = status === 'queued' && online === false ? OFFLINE_QUEUED_META : SYNC_STATUS_META[status];
  return (
    <span
      className={`setu-sync setu-sync--${status}`}
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
