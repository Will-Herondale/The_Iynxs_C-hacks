import { FieldEventSchema, newClientEventId, type FieldEvent } from '@setu/contract';
import { clearWriteFailure, reportWriteFailure } from '../offline/storage';
import { db, type QueueItem } from './db';

let kick: () => void = () => {};
/** The engine registers itself so queue mutations trigger a pass. */
export function setKick(fn: () => void): void {
  kick = fn;
}

/** Idempotent on clientEventId; validates the payload first. */
export async function enqueue(event: FieldEvent): Promise<QueueItem> {
  const valid = FieldEventSchema.parse(event);
  const now = Date.now();
  let item: QueueItem;
  try {
    item = await db.transaction('rw', db.queue, async () => {
      const existing = await db.queue.get(valid.clientEventId);
      if (existing) return existing;
      const created: QueueItem = {
        clientEventId: valid.clientEventId,
        type: valid.type,
        event: valid,
        status: 'queued',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      };
      await db.queue.add(created);
      return created;
    });
  } catch (err) {
    // Nothing was stored: surface it (typed) so the form keeps its data and tells the user.
    throw reportWriteFailure(err);
  }
  clearWriteFailure();
  kick();
  return item;
}

export async function retry(id: string): Promise<void> {
  await db.queue
    .where('clientEventId')
    .equals(id)
    .modify((it) => {
      if (it.status !== 'failed' && it.status !== 'rejected') return;
      it.status = 'queued';
      it.nextAttemptAt = undefined;
      it.lastError = undefined;
      it.updatedAt = Date.now();
    });
  kick();
}

export async function discard(id: string): Promise<void> {
  await db.queue.delete(id);
}

function withNewId(event: FieldEvent, note?: string): FieldEvent {
  return { ...event, clientEventId: newClientEventId(), ...(note !== undefined ? { note } : {}) } as FieldEvent;
}

/** Atomically replaces `id` with a brand-new item (new clientEventId). Never mutates a submitted event. */
async function supersede(id: string, next: FieldEvent): Promise<QueueItem> {
  const valid = FieldEventSchema.parse(next);
  const now = Date.now();
  const created: QueueItem = {
    clientEventId: valid.clientEventId,
    type: valid.type,
    event: valid,
    status: 'queued',
    attempts: 0,
    supersedes: id,
    createdAt: now,
    updatedAt: now,
  };
  try {
    // One transaction: if the new write fails the original stays untouched.
    await db.transaction('rw', db.queue, db.archive, async () => {
      const orig = await db.queue.get(id);
      if (orig) await db.archive.put({ ...orig, supersededBy: valid.clientEventId, archivedAt: now });
      await db.queue.delete(id);
      await db.queue.put(created);
    });
  } catch (err) {
    throw reportWriteFailure(err);
  }
  kick();
  return created;
}

/**
 * keep-mine: resubmit as a NEW event whose note references the original id.
 * accept-server: drop the local copy.
 */
export async function resolveConflict(id: string, choice: 'keep-mine' | 'accept-server'): Promise<void> {
  if (choice === 'accept-server') {
    await db.queue.delete(id);
    return;
  }
  const orig = await db.queue.get(id);
  if (!orig) return;
  const ref = `Resubmitted after conflict; supersedes ${orig.clientEventId}`;
  const note = orig.event.note ? `${orig.event.note}\n${ref}` : ref;
  await supersede(id, withNewId(orig.event, note.slice(0, 2000)));
}

/** Rejected → edited resubmit: the edited event gets a new clientEventId. */
export async function replace(id: string, event: FieldEvent): Promise<QueueItem> {
  return supersede(id, withNewId(event));
}
