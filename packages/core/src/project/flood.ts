// Flood projection — planning doc 05.
//
// Converts obs.water events into inundation over a precomputed HAND grid.
// See planning doc 05 §3.2 for the corrected formulation:
//   wet(c) <=> H(c) <= h(D(c))
//   depth(c) = max(0, h(D(c)) - H(c))
//
// No gauge-stage vs DEM comparison (ADR-8 datum rule). The primary observation
// is local depth over a DEM-referenced point.

export interface FloodPoint {
  pointId: string;
  lng: number;     // microdegrees
  lat: number;     // microdegrees
  refElevDm: number;   // decimetres, DEM elevation at reference point
  drainElevDm: number; // decimetres, drainage cell elevation for this point
}

export interface WaterObservation {
  pointId: string;
  depthDm: number;      // depth above reference, decimetres
  refKind: 'bridge_deck' | 'road_surface' | 'embankment_crest' | 'gauge_zero';
  confidence: number;   // 0..100
  observedAt: number;
  hlc: { l: number; c: number };
  origin: string;
  seq: number;
  suspectClock: boolean;
}

export interface InundationCell {
  cx: number;
  cy: number;
  wet: boolean;
  depthDm: number;      // decimetres, 0 if not wet
  handDm: number;       // decimetres, HAND value for this cell
}

export interface FloodProjection {
  h0Dm: number;         // active hydraulic depth, decimetres
  wetCells: number;
  inundatedAreaM2: number;
  disputedPoints: Array<{ pointId: string; reason: string }>;
  cells: InundationCell[];
  version: number;
  generatedAt: number;
}

/**
 * Select the active water observation at `asOf`.
 * Returns null if no valid observation.
 */
export function selectWaterObservation(
  obs: WaterObservation[],
  asOf: number,
): WaterObservation | null {
  const valid = obs.filter((o) => o.observedAt <= asOf && !o.suspectClock);
  if (valid.length === 0) return null;

  // Highest rank: (observedAt, confidence, hlc.l, hlc.c, origin, seq)
  valid.sort((a, b) => {
    const ka = [a.observedAt, a.confidence, a.hlc.l, a.hlc.c, a.origin, a.seq];
    const kb = [b.observedAt, b.confidence, b.hlc.l, b.hlc.c, b.origin, b.seq];
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    }
    return 0;
  });

  return valid[valid.length - 1];
}

/**
 * Compute hydraulic depth h0 from an observation at a reference point.
 * h0 = S_obs - z(D_ref) where S_obs = z_ref + depthDm / 10.
 * Returns null if h0 is out of plausible range.
 */
export function computeHydraulicDepth(
  obs: WaterObservation,
  refPoint: FloodPoint,
): number | null {
  const zRefM = refPoint.refElevDm / 10;
  const depthM = obs.depthDm / 10;
  const sObsM = zRefM + depthM;

  const zDrainM = refPoint.drainElevDm / 10;
  const h0M = sObsM - zDrainM;

  // Sanity: h0 must be between 0 and 12 m (planning doc 05 §3.3)
  if (h0M < 0 || h0M > 12) return null;

  return Math.round(h0M * 10); // decimetres
}

/**
 * Project inundation over a grid of cells.
 * grid: array of { cx, cy, handDm } cells with D8 drainage assignment.
 * drainMap: cell index -> nearest drainage cell handDm value.
 */
export function projectFlood(
  cells: Array<{ cx: number; cy: number; handDm: number; drainHandDm: number }>,
  obs: WaterObservation[],
  refPoint: FloodPoint | null,
  asOf: number,
  cellSizeM: number = 30,
): FloodProjection {
  const activeObs = selectWaterObservation(obs, asOf);
  const disputedPoints: Array<{ pointId: string; reason: string }> = [];

  let h0Dm = 0;
  if (activeObs && refPoint) {
    const h0 = computeHydraulicDepth(activeObs, refPoint);
    if (h0 === null) {
      disputedPoints.push({
        pointId: refPoint.pointId,
        reason: `hydraulic depth out of plausible range (obs depth ${activeObs.depthDm} dm)`,
      });
    } else {
      h0Dm = h0;
    }
  }

  // Also surface concurrent disagreeing observations as disputed
  const allValid = obs.filter((o) => o.observedAt <= asOf && !o.suspectClock);
  if (allValid.length >= 2) {
    const top = allValid[allValid.length - 1];
    const runnerUp = allValid[allValid.length - 2];
    if (
      Math.abs(top.depthDm - runnerUp.depthDm) > 50 && // >5 dm difference
      top.origin !== runnerUp.origin
    ) {
      disputedPoints.push({
        pointId: top.pointId,
        reason: `concurrent disagreeing depth observations (${top.depthDm} dm vs ${runnerUp.depthDm} dm)`,
      });
    }
  }

  const wetCells: InundationCell[] = [];
  let wetCount = 0;

  for (const cell of cells) {
    let wet = false;
    let depthDm = 0;

    if (h0Dm > 0) {
      // wet(c) <=> H(c) <= h(D(c))
      if (cell.handDm <= cell.drainHandDm) {
        wet = true;
        depthDm = Math.max(0, cell.drainHandDm - cell.handDm);
      }
    }

    if (wet) wetCount++;
    wetCells.push({ cx: cell.cx, cy: cell.cy, wet, depthDm, handDm: cell.handDm });
  }

  const inundatedAreaM2 = wetCount * cellSizeM * cellSizeM;

  return {
    h0Dm,
    wetCells: wetCount,
    inundatedAreaM2,
    disputedPoints,
    cells: wetCells,
    version: 1,
    generatedAt: asOf,
  };
}
