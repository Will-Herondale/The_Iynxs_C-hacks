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
