import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '../testing/fixture';
import { syntheticBounds } from './demo';

describe('syntheticBounds', () => {
  it('is null when nothing is flagged synthetic (or there is no snapshot)', () => {
    expect(syntheticBounds(undefined)).toBeNull();
    expect(syntheticBounds(fixtureSnapshot())).toBeNull();
  });

  it('covers every synthetic feature and ignores real ones', () => {
    const s = structuredClone(fixtureSnapshot());
    const a = s.settlements.features[0]!; const b = s.shelters.features[0]!; const r = s.routes.features[0]!;
    (a.properties as { synthetic?: boolean }).synthetic = true; a.geometry = { type: 'Point', coordinates: [94.4, 26.7] };
    (b.properties as { synthetic?: boolean }).synthetic = true; b.geometry = { type: 'Point', coordinates: [94.6, 26.9] };
    (r.properties as { synthetic?: boolean }).synthetic = true; r.geometry = { type: 'LineString', coordinates: [[94.45, 26.75], [94.55, 26.85]] };
    expect(syntheticBounds(s)).toEqual([[94.4, 26.7], [94.6, 26.9]]);
  });
});
