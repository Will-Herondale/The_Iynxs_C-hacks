import { describe, expect, it } from 'vitest';
import { countByStatus, specStatusLabel } from './statusVocab.js';

describe('specStatusLabel', () => {
  it.each([
    ['queued', false, 'Saved locally'],
    ['queued', true, 'Waiting to sync'],
    ['sending', true, 'Synchronising'],
    ['accepted', true, 'Synchronising'],
    ['synced', true, 'Accepted'],
    ['conflict', true, 'Requires review'],
    ['rejected', true, 'Rejected'],
    ['failed', true, 'Failed — retry available'],
  ] as const)('%s online=%s → %s', (s, online, label) => {
    expect(specStatusLabel(s, online)).toBe(label);
  });

  it('counts per status', () => {
    const counts = countByStatus([{ status: 'sending' }, { status: 'accepted' }, { status: 'synced' }]);
    expect(counts).toMatchObject({ sending: 1, accepted: 1, synced: 1, queued: 0 });
  });
});
