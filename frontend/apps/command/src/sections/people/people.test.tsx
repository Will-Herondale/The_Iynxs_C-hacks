// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PeopleSnapshot } from '@setu/contract';
import { CampsPeopleSectionView } from './CampsPeopleSection.js';
import { splitHouseholds } from './model.js';

const snapshot: PeopleSnapshot = {
  version: 4,
  generatedAt: '2026-10-30T12:00:00.000Z',
  totals: { checkins: 3, individuals: 2, households: 1, campsWithCheckins: 2 },
  autoMergedCount: 0,
  camps: [
    {
      campId: 'MJ-SH-001',
      name: 'Dakhinpat',
      open: true,
      capacity: 500,
      occupancy: 120,
      checkins: 2,
      households: 1,
      people: 5,
      needs: { water: 2 },
      lastCheckinAt: '2026-10-30T11:55:00.000Z',
    },
    {
      campId: 'MJ-SH-002',
      name: 'Garamur',
      open: true,
      capacity: 300,
      occupancy: 50,
      checkins: 1,
      households: 0,
      people: 1,
      needs: {},
      lastCheckinAt: '2026-10-30T11:50:00.000Z',
    },
  ],
  checkins: [
    {
      eventId: 'e1',
      clientEventId: null,
      kind: 'household',
      personId: 'H-1',
      mergedInto: null,
      displayName: 'Das Household',
      campId: 'MJ-SH-001',
      campName: 'Dakhinpat',
      settlementId: '2885275507',
      householdId: 'H-1',
      members: 4,
      ageBand: '18-59',
      sex: 'u',
      needs: ['water'],
      vulnerable: null,
      occurredAt: '2026-10-30T11:55:00.000Z',
      reporterId: 'volunteer-1',
    },
    {
      eventId: 'e2',
      clientEventId: null,
      kind: 'person',
      personId: 'p1',
      mergedInto: null,
      displayName: 'Anita Das',
      campId: 'MJ-SH-001',
      campName: 'Dakhinpat',
      settlementId: '2885275507',
      householdId: 'H-1',
      members: 1,
      ageBand: '18-59',
      sex: 'f',
      needs: ['water'],
      vulnerable: { elderly: false, children: false, disabled: false, medical: true },
      occurredAt: '2026-10-30T11:54:00.000Z',
      reporterId: 'volunteer-1',
    },
    {
      eventId: 'e3',
      clientEventId: null,
      kind: 'person',
      personId: 'p2',
      mergedInto: null,
      displayName: 'Anita Das',
      campId: 'MJ-SH-002',
      campName: 'Garamur',
      settlementId: '2885275507',
      householdId: 'H-1',
      members: 1,
      ageBand: '18-59',
      sex: 'f',
      needs: [],
      vulnerable: null,
      occurredAt: '2026-10-30T11:50:00.000Z',
      reporterId: 'volunteer-2',
    },
  ],
  duplicateSuggestions: [
    {
      proposalId: 'm1',
      scoreBp: 8000,
      a: { personId: 'p1', name: 'Anita Das', campId: 'MJ-SH-001', campName: 'Dakhinpat', kind: 'person' },
      b: { personId: 'p2', name: 'Anita Das', campId: 'MJ-SH-002', campName: 'Garamur', kind: 'person' },
    },
  ],
};

afterEach(cleanup);

describe('CampsPeopleSectionView', () => {
  it('shows per-camp counts separately from shelter occupancy', () => {
    render(<CampsPeopleSectionView snapshot={snapshot} />);
    expect(screen.getByTestId('people-total-checkins').textContent).toBe('3');
    expect(screen.getByTestId('people-total-individuals').textContent).toBe('2');
    expect(screen.getByTestId('people-total-households').textContent).toBe('1');
    expect(screen.getByTestId('people-total-camps').textContent).toBe('2');

    const row = screen.getByTestId('camp-people-row-MJ-SH-001');
    expect(row.getAttribute('data-people')).toBe('5');
    expect(screen.getByTestId('camp-people-MJ-SH-001').textContent).toBe('5');
    expect(screen.getByTestId('camp-checkins-MJ-SH-001').textContent).toBe('2');
    expect(screen.getByTestId('camp-households-MJ-SH-001').textContent).toBe('1');
    expect(screen.getByTestId('camp-occupancy-MJ-SH-001').textContent).toBe('120');
    expect(screen.getByTestId('camp-people-MJ-SH-002').textContent).toBe('1');
  });

  it('surfaces a possible duplicate without merging it', () => {
    render(<CampsPeopleSectionView snapshot={snapshot} />);
    const dup = screen.getByTestId('duplicate-suggestion-m1');
    expect(dup.textContent).toContain('Anita Das');
    expect(dup.textContent).toContain('Dakhinpat');
    expect(dup.textContent).toContain('Garamur');
    expect(screen.getByTestId('people-source-note').textContent).toContain('merged');
    // The two records stay separate.
    expect(screen.getByTestId('people-checkin-row-e2')).toBeTruthy();
    expect(screen.getByTestId('people-checkin-row-e3')).toBeTruthy();
  });

  it('flags a household recorded at more than one camp', () => {
    expect(splitHouseholds(snapshot)).toEqual([
      { householdId: 'H-1', camps: ['MJ-SH-001', 'MJ-SH-002'], names: ['Anita Das', 'Das Household'] },
    ]);
    render(<CampsPeopleSectionView snapshot={snapshot} />);
    const split = screen.getByTestId('split-household-H-1');
    expect(split.textContent).toContain('MJ-SH-001');
    expect(split.textContent).toContain('MJ-SH-002');
  });

  it('searches names and household ids', () => {
    render(<CampsPeopleSectionView snapshot={snapshot} />);
    fireEvent.change(screen.getByTestId('people-search'), { target: { value: 'Anita' } });
    expect(screen.getByTestId('people-count').textContent).toBe('2 of 3 records');
    fireEvent.change(screen.getByTestId('people-search'), { target: { value: 'H-1' } });
    expect(screen.getByTestId('people-count').textContent).toBe('3 of 3 records');
    fireEvent.change(screen.getByTestId('people-search'), { target: { value: 'zzzz' } });
    expect(screen.queryAllByTestId(/^people-checkin-row-/)).toHaveLength(0);
  });

  it('shows auto-merged records with mergedInto and reduced individual count', () => {
    const merged: PeopleSnapshot = {
      ...snapshot,
      totals: { ...snapshot.totals, individuals: 1 },
      autoMergedCount: 1,
      checkins: snapshot.checkins.map((r) =>
        r.personId === 'p2' ? { ...r, mergedInto: 'p1' } : r,
      ),
      duplicateSuggestions: [], // high-confidence match was auto-merged
    };
    render(<CampsPeopleSectionView snapshot={merged} />);
    expect(screen.getByTestId('people-total-individuals').textContent).toBe('1');
    expect(screen.getByTestId('people-total-auto-merged').textContent).toBe('1');
    const mergedRow = screen.getByTestId('people-checkin-row-e3');
    expect(mergedRow.getAttribute('data-merged-into')).toBe('p1');
    expect(mergedRow.textContent).toContain('merged into');
    // The canonical record is still present.
    expect(screen.getByTestId('people-checkin-row-e2')).toBeTruthy();
  });
});
