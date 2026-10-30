import { describe, expect, it } from 'vitest';
import { countByStatus, specStatusLabel, summaryGroups } from './statusVocab.js';

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

  it('merges sending and accepted-not-confirmed in the summary', () => {
    const counts = countByStatus([{ status: 'sending' }, { status: 'accepted' }, { status: 'synced' }]);
    const g = Object.fromEntries(summaryGroups(counts, true).map((x) => [x.key, x.count]));
    expect(g).toMatchObject({ syncing: 2, accepted: 1, local: 0 });
  });
});
