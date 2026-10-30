import type { ProjectionSnapshot } from '@setu/contract';
import data from './fixture-snapshot.json' with { type: 'json' };

/**
 * Small hand-made SYNTHETIC snapshot for unit tests (road R7, bridge-ready B1 slot, settlements S1–S6,
 * routes EVAC-*, shelters SH*). It is a test fixture, independent of the mock backend's Majuli seed,
 * and is never shown in the app.
 */
export const fixtureSnapshot = (): ProjectionSnapshot => structuredClone(data) as unknown as ProjectionSnapshot;
