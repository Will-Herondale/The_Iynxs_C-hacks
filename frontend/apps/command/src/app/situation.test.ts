import { describe, expect, it } from 'vitest';
import type { ProjectionSnapshot } from '@setu/contract';
import { buildSituation } from './situation';

const fc = (features: unknown[]) => ({ type: 'FeatureCollection', version: 1, generatedAt: '2026-01-01T00:00:00Z', features });
const f = (properties: object) => ({ type: 'Feature', geometry: null, properties });
const snap = (roads: object[], settlements: object[]): ProjectionSnapshot =>
  ({
    version: 3, generatedAt: '2026-01-01T00:00:00Z',
    flood: fc([]), roads: fc(roads.map(f)), settlements: fc(settlements.map(f)), routes: fc([]), shelters: fc([]),
  }) as unknown as ProjectionSnapshot;

const B1 = { roadId: 'B1', name: 'Bharalu Bridge', status: 'blocked', kind: 'bridge', passability: 'impassable', reason: 'submerged', sourceEventIds: ['e1'], updatedAt: '' };
const S4 = {
  settlementId: 'S4', name: 'Kalapahar', accessibility: 'cut_off',
  cutOffReason: { summary: 'B1 is under water', blockingFeatureIds: ['B1'] },
  evacuationDeadline: '2026-01-01T18:00:00Z',
};
const fmt = (iso: string) => iso.slice(11, 16);

describe('buildSituation', () => {
  it('chains bridge -> settlement -> deadline from server fields', () => {
    const s = buildSituation(snap([B1], [S4]), fmt);
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]!.text).toBe('Bharalu Bridge (B1) submerged → Kalapahar cut off → evacuate by 18:00');
    expect(s.soonest?.settlementId).toBe('S4');
    expect(s.allClear).toBe(false);
  });
  it('falls back to the server summary when no blocking feature resolves, and lists unexplained bridges first', () => {
    const s = buildSituation(
      snap([B1, { ...B1, roadId: 'R2', name: 'Ring Rd', kind: 'road', reason: undefined }], [{ ...S4, cutOffReason: { summary: 'Flooded approach', blockingFeatureIds: [] }, evacuationDeadline: undefined }]),
      fmt,
    );
    expect(s.lines.map((l) => l.kind)).toEqual(['cutoff', 'bridge', 'road']);
    expect(s.lines[0]!.text).toBe('Flooded approach → Kalapahar cut off');
    expect(s.lines[2]!.text).toBe('Road Ring Rd (R2) blocked');
  });
  it('picks the soonest deadline and reports all-clear when nothing is wrong', () => {
    const s = buildSituation(snap([], [S4, { ...S4, settlementId: 'S9', name: 'X', evacuationDeadline: '2026-01-01T09:30:00Z' }]), fmt);
    expect(s.soonest?.settlementId).toBe('S9');
    expect(buildSituation(snap([{ ...B1, status: 'open' }], []), fmt).allClear).toBe(true);
    expect(buildSituation(undefined).lines).toEqual([]);
  });
});
