import {
  isConfirmedSynced,
  isRetryable,
  NetworkError,
  type ApiClient,
  type EventStatus,
  type SubmitAck,
} from '@setu/contract';
import { backoffMs } from './backoff';
import { db, LAST_SYNCED_KEY, type QueueItem } from './db';

export const BATCH_SIZE = 20;

export type EngineOptions = { now?: () => number; rand?: () => number };

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A 'sending' item found at startup (crash/reload mid-flight) goes back to queued; the server dedupes. */
export async function recoverSending(): Promise<void> {
  await db.queue
    .where('status')
    .equals('sending')
    .modify((it) => {
      it.status = 'queued';
      it.updatedAt = Date.now();
    });
}

/** Items waiting to be sent whose backoff has elapsed. Failed items without nextAttemptAt (non-retryable) never auto-retry. */
export async function dueItems(now: number): Promise<QueueItem[]> {
  const rows = await db.queue.where('status').anyOf('queued', 'failed').sortBy('createdAt');
  return rows.filter((it) => (it.status === 'queued' && (it.nextAttemptAt === undefined || it.nextAttemptAt <= now)) || (it.nextAttemptAt !== undefined && it.nextAttemptAt <= now));
}

function applyAck(it: QueueItem, ack: SubmitAck | undefined, now: number): void {
  it.updatedAt = now;
  if (!ack || ack.clientEventId !== it.clientEventId) {
    // Malformed response: keep for retry, never assume success.
    it.status = 'failed';
    it.attempts += 1;
    it.lastError = 'Missing acknowledgement from server';
    it.nextAttemptAt = now + backoffMs(it.attempts);
    return;
  }
  it.lastError = undefined;
  it.nextAttemptAt = undefined;
  switch (ack.result) {
    case 'accepted':
      it.status = 'accepted';
      it.eventId = ack.eventId;
      it.acceptedAtVersion = ack.acceptedAtVersion;
      break;
    case 'duplicate':
      // Already known to the server; still needs confirmation through status.
      it.status = 'accepted';
      it.eventId = ack.eventId;
      break;
    case 'conflict':
      it.status = 'conflict';
      it.eventId = ack.eventId ?? it.eventId;
      it.conflict = { reason: ack.reason, serverState: ack.serverState };
      break;
    case 'rejected':
      it.status = 'rejected';
      it.validationErrors = ack.errors;
      break;
  }
}

async function sendBatch(api: ApiClient, batch: QueueItem[], opts: Required<EngineOptions>): Promise<boolean> {
  const ids = batch.map((b) => b.clientEventId);
  await db.queue.where('clientEventId').anyOf(ids).modify((it) => {
    it.status = 'sending';
    it.updatedAt = opts.now();
  });
  let acks: SubmitAck[];
  try {
    acks = await api.submitEvents(batch.map((b) => b.event));
  } catch (err) {
    const now = opts.now();
    const retryable = isRetryable(err);
    await db.queue.where('clientEventId').anyOf(ids).modify((it) => {
      // Skip rows the user discarded/changed meanwhile.
      if (it.status !== 'sending') return;
      // NetworkError: the request never reached the server, so the item just waits for connectivity ('queued').
      // Server/Timeout errors may have been seen by the server, so those are 'failed'.
      it.status = err instanceof NetworkError ? 'queued' : 'failed';
      it.attempts += 1;
      it.lastError = errMsg(err);
      it.updatedAt = now;
      it.nextAttemptAt = retryable ? now + backoffMs(it.attempts, opts.rand()) : undefined;
    });
    return false;
  }
  const now = opts.now();
  const byId = new Map(acks.map((a) => [a.clientEventId, a]));
  await db.queue.where('clientEventId').anyOf(ids).modify((it) => {
    if (it.status !== 'sending') return;
    applyAck(it, byId.get(it.clientEventId), now);
  });
  return true;
}

/** Move accepted items forward using getEventStatus. Never assumes synced. */
export async function confirmAccepted(api: ApiClient, opts: EngineOptions = {}): Promise<void> {
  const now = opts.now ?? Date.now;
  const pending = await db.queue.where('status').equals('accepted').toArray();
  if (pending.length === 0) return;
  let statuses: EventStatus[];
  try {
    statuses = await api.getEventStatus(pending.map((p) => p.clientEventId));
  } catch {
    return; // stay accepted; retried on next pass / version bump
  }
  const byId = new Map(statuses.map((s) => [s.clientEventId, s]));
  const t = now();
  let syncedAny = false;
  await db.transaction('rw', db.queue, db.meta, async () => {
    for (const p of pending) {
      const s = byId.get(p.clientEventId);
      if (!s) continue;
      const cur = await db.queue.get(p.clientEventId);
      if (!cur || cur.status !== 'accepted') continue;
      if (s.state === 'applied' && s.projectionVersion !== undefined) {
        // duplicate acks carry no acceptedAtVersion: applied alone is the server confirming
        if (cur.acceptedAtVersion === undefined || isConfirmedSynced(cur.acceptedAtVersion, s.projectionVersion)) {
          cur.status = 'synced';
          cur.eventId = s.eventId ?? cur.eventId;
          syncedAny = true;
        }
      } else if (s.state === 'conflict') {
        cur.status = 'conflict';
        cur.conflict = { reason: 'Server reported a conflict after acceptance' };
      } else if (s.state === 'rejected') {
        cur.status = 'rejected';
        cur.validationErrors = [{ path: '', message: 'Server rejected this event after acceptance' }];
      } else {
        continue; // unknown / accepted: keep waiting
      }
      cur.updatedAt = t;
      await db.queue.put(cur);
    }
    if (syncedAny) await db.meta.put({ key: LAST_SYNCED_KEY, value: t });
  });
}

/** One full pass: send due items in batches of <= 20, then confirm accepted ones. */
export async function runPass(api: ApiClient, options: EngineOptions = {}): Promise<void> {
  const opts = { now: options.now ?? Date.now, rand: options.rand ?? Math.random };
  const due = await dueItems(opts.now());
  for (let i = 0; i < due.length; i += BATCH_SIZE) {
    const ok = await sendBatch(api, due.slice(i, i + BATCH_SIZE), opts);
    if (!ok) break; // transport is down; don't hammer with further batches
  }
  await confirmAccepted(api, opts);
}
