import type { ClientSyncStatus } from '@setu/contract';

/** Spec status vocabulary (replaces the old labels). */
export function specStatusLabel(status: ClientSyncStatus, online: boolean): string {
  switch (status) {
    case 'queued':
      return online ? 'Waiting to sync' : 'Saved locally';
    case 'sending':
    case 'accepted':
      return 'Synchronising';
    case 'synced':
      return 'Accepted';
    case 'conflict':
      return 'Requires review';
    case 'rejected':
      return 'Rejected';
    case 'failed':
      return 'Failed — retry available';
  }
}

export const STATUS_ORDER: ClientSyncStatus[] = ['queued', 'sending', 'accepted', 'synced', 'conflict', 'rejected', 'failed'];

export const ZERO_COUNTS: Record<ClientSyncStatus, number> = {
  queued: 0, sending: 0, accepted: 0, synced: 0, conflict: 0, rejected: 0, failed: 0,
};

export function countByStatus(items: { status: ClientSyncStatus }[]): Record<ClientSyncStatus, number> {
  const counts = { ...ZERO_COUNTS };
  for (const i of items) counts[i.status] += 1;
  return counts;
}

/** Groups shown in the summary: statuses sharing a user-facing label are merged. */
export function summaryGroups(
  counts: Record<ClientSyncStatus, number>,
  online: boolean,
): { key: string; label: string; count: number }[] {
  return [
    { key: 'local', label: online ? 'Waiting to sync' : 'Saved locally', count: counts.queued },
    { key: 'syncing', label: 'Synchronising', count: counts.sending + counts.accepted },
    { key: 'accepted', label: 'Accepted', count: counts.synced },
    { key: 'review', label: 'Requires review', count: counts.conflict },
    { key: 'rejected', label: 'Rejected', count: counts.rejected },
    { key: 'failed', label: 'Failed — retry available', count: counts.failed },
  ];
}
