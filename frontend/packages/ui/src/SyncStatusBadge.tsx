import type { ClientSyncStatus } from '@setu/contract';

export interface SyncStatusMeta {
  label: string;
  icon: string;
  description: string;
}

/** One entry per ClientSyncStatus: distinct label + glyph + CSS class (never colour alone). */
export const SYNC_STATUS_META: Record<ClientSyncStatus, SyncStatusMeta> = {
  queued: { label: 'Queued', icon: '○', description: 'Saved on this device, not yet sent' },
  sending: { label: 'Sending', icon: '↻', description: 'Sending to server' },
  accepted: { label: 'Awaiting confirmation', icon: '◐', description: 'Server received it; not yet confirmed in the shared feed' },
  synced: { label: 'Synced', icon: '✓', description: 'Confirmed in the shared feed' },
  conflict: { label: 'Conflict', icon: '⚠', description: 'Conflicts with server state; needs review' },
  rejected: { label: 'Rejected', icon: '✗', description: 'Server rejected this report' },
  failed: { label: 'Failed, will retry', icon: '!', description: 'Temporary failure; will retry automatically' },
};

export function SyncStatusBadge({ status }: { status: ClientSyncStatus }) {
  const meta = SYNC_STATUS_META[status];
  return (
    <span
      className={`setu-sync setu-sync--${status}`}
      role="status"
      data-status={status}
      aria-label={`Sync status: ${meta.label}. ${meta.description}`}
      title={meta.description}
    >
      <span className="setu-sync__icon" aria-hidden="true">{meta.icon}</span>
      <span className="setu-sync__label">{meta.label}</span>
    </span>
  );
}
