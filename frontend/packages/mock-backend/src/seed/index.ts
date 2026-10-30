import type { FieldEvent, ProjectionSnapshot } from '@setu/contract';
import { FLOOD, ROADS, ROUTES, SEED_TIME, SETTLEMENTS, SHELTERS } from './data.js';
import { applyEvent, type ApplyOptions, type ApplyResult } from './rules.js';

export * from './data.js';
export { FIXTURES } from './fixtures.js';
export { applyEvent, ROAD_MATCH_RADIUS_M, EVACUATION_WINDOW_H, scenarioLevelM, type ApplyOptions, type ApplyResult } from './rules.js';
export { haversineM, distToLineM, pointInPolygon } from './geo.js';

const fc = <F>(features: F[]) => ({ type: 'FeatureCollection' as const, version: 1, generatedAt: SEED_TIME, features: features.map((f) => ({ type: 'Feature' as const, ...structuredClone(f) })) });

/** Fresh seed snapshot at version 1. Each call returns an independent deep copy. */
export function initialSnapshot(): ProjectionSnapshot {
  return {
    version: 1,
    generatedAt: SEED_TIME,
    flood: fc(FLOOD),
    roads: fc(ROADS),
    settlements: fc(SETTLEMENTS),
    routes: fc(ROUTES),
    shelters: fc(SHELTERS),
  };
}

/** Interface the mock store consumes. Pure functions, no I/O. */
export interface ScenarioRules {
  initialSnapshot(): ProjectionSnapshot;
  apply(event: FieldEvent, snapshot: ProjectionSnapshot, opts?: ApplyOptions): ApplyResult;
}

export const scenarioRules: ScenarioRules = { initialSnapshot, apply: applyEvent };
export const apply = applyEvent;
