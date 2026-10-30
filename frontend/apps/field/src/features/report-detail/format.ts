import type { ClientSyncStatus } from '@setu/contract';

/** Spec status vocabulary. 'accepted' (HTTP 2xx, not yet confirmed applied) is still "Synchronising". */
export function syncLabel(status: ClientSyncStatus, online: boolean): string {
  switch (status) {
    case 'queued': return online ? 'Waiting to sync' : 'Saved locally';
    case 'sending':
    case 'accepted': return 'Synchronising';
    case 'synced': return 'Accepted';
    case 'conflict': return 'Requires review';
    case 'rejected': return 'Rejected';
    case 'failed': return 'Failed — retry available';
  }
}

const IST = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
/** "30 Oct 2026, 14:05:09 IST" */
export function formatIst(input: string | number | Date): string {
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? String(input) : `${IST.format(d)} IST`;
}
