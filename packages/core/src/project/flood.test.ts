import { describe, expect, it } from 'vitest';
import {
  projectFlood,
  selectWaterObservation,
  computeHydraulicDepth,
  type WaterObservation,
  type FloodPoint,
} from './flood';
import { hlcInitial } from '../event/hlc';

async function makeWaterObs(
  overrides: Partial<WaterObservation> & { at?: number; origin?: string; seq?: number } = {},
): Promise<WaterObservation> {
  const s = hlcInitial();
  return {
    pointId: 'P1',
    depthDm: 110, // 1.1 m
    refKind: 'bridge_deck',
    confidence: 100,
    observedAt: overrides.at ?? s.l,
    hlc: { l: s.l, c: 0 },
    origin: overrides.origin ?? 'dev-1',
    seq: overrides.seq ?? 1,
    suspectClock: false,
    ...overrides,
  };
}

const refPoint: FloodPoint = {
  pointId: 'P1',
  lng: 94200000, // 94.2 E in microdegrees
  lat: 26950000, // 26.95 N in microdegrees
  refElevDm: 860, // 86.0 m
  drainElevDm: 840, // 84.0 m drainage cell
};

describe('projectFlood', () => {
  it('returns dry when no observation', () => {
    const cells = [{ cx: 0, cy: 0, handDm: 500, drainHandDm: 100 }];
    const result = projectFlood(cells, [], refPoint, 1000);
    expect(result.h0Dm).toBe(0);
    expect(result.wetCells).toBe(0);
    expect(result.cells[0].wet).toBe(false);
  });

  it('computes hydraulic depth from observation', () => {
    const h0 = computeHydraulicDepth(
      { depthDm: 11, refKind: 'bridge_deck', confidence: 100, observedAt: 1000, hlc: { l: 1000, c: 0 }, origin: 'd', seq: 1, suspectClock: false, pointId: 'P1' },
      refPoint,
    );
    // z_ref = 86.0m, depth = 1.1m, S = 87.1m, z_drain = 84.0m, h0 = 3.1m = 31 dm
    expect(h0).toBe(31);
  });

  it('rejects implausible hydraulic depth', () => {
    const h0 = computeHydraulicDepth(
      { depthDm: 130, refKind: 'bridge_deck', confidence: 100, observedAt: 1000, hlc: { l: 1000, c: 0 }, origin: 'd', seq: 1, suspectClock: false, pointId: 'P1' },
      refPoint,
    );
    expect(h0).toBeNull();
  });

  it('inundates cells where hand <= h0', async () => {
    const obs = await makeWaterObs({ depthDm: 11, observedAt: 500 });
    const cells = [
      { cx: 0, cy: 0, handDm: 20, drainHandDm: 31 },   // wet: 20 <= 31, depth=11
      { cx: 1, cy: 0, handDm: 40, drainHandDm: 31 },   // dry: 40 > 31
    ];
    const result = projectFlood(cells, [obs], refPoint, 1000);
    expect(result.h0Dm).toBe(31);
    expect(result.cells[0].wet).toBe(true);
    expect(result.cells[0].depthDm).toBe(11);
    expect(result.cells[1].wet).toBe(false);
    expect(result.wetCells).toBe(1);
  });

  it('selects latest observation', async () => {
    const obs1 = await makeWaterObs({ depthDm: 110, observedAt: 1000, seq: 1 });
    const obs2 = await makeWaterObs({ depthDm: 220, observedAt: 2000, seq: 2 });
    const selected = selectWaterObservation([obs1, obs2], 3000);
    expect(selected).toBeDefined();
    expect(selected!.depthDm).toBe(220);
  });
});
