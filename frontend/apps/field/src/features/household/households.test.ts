import { describe, expect, it } from 'vitest';
import type { ProjectionSnapshot } from '@setu/contract';
import type { QueueItem } from '../../sync/index.js';
import { campSummary, householdsFromQueue, nameLookup, searchHouseholds, supersededId } from './households.js';

const ID = '11111111-1111-4111-8111-111111111111';
const item = (cid: string, hid: string, over: Record<string, unknown> = {}, status = 'queued', createdAt = 1): QueueItem =>
  ({
    clientEventId: cid, type: 'household_registration', status, attempts: 0, createdAt, updatedAt: createdAt,
    event: { type: 'household_registration', householdId: hid, headName: 'Asha', members: 3, needs: [], vulnerable: {}, ...over },
  }) as unknown as QueueItem;

const snapshot = {
  settlements: { features: [{ properties: { settlementId: '123', name: 'Kamalabari' } }] },
  shelters: { features: [{ properties: { shelterId: 'MJ-SH-009', name: 'Garamur School' } }] },
} as unknown as ProjectionSnapshot;

describe('household helpers', () => {
  const items = [
    item('a', 'h1', { headName: 'Asha', settlementId: '123', shelterId: 'MJ-SH-009', members: 4 }, 'synced', 1),
    item('b', 'h2', { headName: 'Bimal', members: 2 }, 'conflict', 2),
    item('c', 'h3', { headName: 'Chand', members: 5, shelterId: 'MJ-SH-009' }, 'queued', 3),
    { ...item('d', 'h1', { headName: 'Asha B', settlementId: '123', shelterId: 'MJ-SH-009', members: 6 }, 'queued', 4) },
    { ...item('w', 'x', { type: 'water_level' }, 'queued', 5), type: 'water_level' } as QueueItem,
  ];
  items[4]!.event = { type: 'water_level' } as never;

  it('groups by householdId, newest first, ignoring other event types', () => {
    const r = householdsFromQueue(items);
    expect(r.map((x) => x.householdId)).toEqual(['h1', 'h3', 'h2']);
    expect(r[0]!.current.clientEventId).toBe('d');
    expect(r[0]!.history.map((h) => h.clientEventId)).toEqual(['d', 'a']);
  });

  it('searches name, village (name or id) and camp (name or id), case-insensitively', () => {
    const r = householdsFromQueue(items);
    const names = nameLookup(snapshot);
    expect(searchHouseholds(r, 'bimal', names).map((x) => x.householdId)).toEqual(['h2']);
    expect(searchHouseholds(r, 'kamala', names).map((x) => x.householdId)).toEqual(['h1']);
    expect(searchHouseholds(r, '123', names)).toHaveLength(1);
    expect(searchHouseholds(r, 'garamur', names).map((x) => x.householdId)).toEqual(['h1', 'h3']);
    expect(searchHouseholds(r, 'MJ-SH-009', names)).toHaveLength(2);
    expect(searchHouseholds(r, 'nobody', names)).toHaveLength(0);
    expect(searchHouseholds(r, '  ', names)).toHaveLength(3);
  });

  it('summarises a camp from current registrations', () => {
    const r = householdsFromQueue(items);
    expect(campSummary(r, 'MJ-SH-009')).toEqual({ households: 2, people: 11, pending: 2, awaitingReview: 0, rejected: 0 });
    expect(campSummary(r)).toEqual({ households: 3, people: 13, pending: 2, awaitingReview: 1, rejected: 0 });
  });

  it('reads the superseded id from the resubmission note', () => {
    expect(supersededId(`x\nResubmitted after conflict; supersedes ${ID}`)).toBe(ID);
    expect(supersededId('nothing')).toBeUndefined();
  });
});
