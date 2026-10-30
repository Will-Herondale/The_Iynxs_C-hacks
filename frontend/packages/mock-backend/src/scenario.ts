import type { FieldEvent, ProjectionSnapshot } from '@setu/contract';

/**
 * Seam between the mock store (H1) and the scripted scenario (H2: src/seed/**).
 * The scenario is a scripted lookup table, NOT a routing/flood engine.
 */
export interface ScenarioRules {
  /** Fresh baseline snapshot (version 0 is fine; the store owns versioning). */
  initialSnapshot(): ProjectionSnapshot;
  /**
   * Pure: return the next snapshot for an applied event (the same `snapshot` unchanged if no rule matches).
   * The store stamps `version` / `generatedAt` itself, so every applied event bumps the feed version.
   */
  apply(event: FieldEvent, snapshot: ProjectionSnapshot, opts?: { now?: string }): ScenarioApplyResult;
}

export interface ScenarioApplyResult {
  snapshot: ProjectionSnapshot;
  changed: boolean;
  effects: string[];
}

/** Fallback used until a seed scenario is wired in: empty collections, events change nothing. */
export const emptyScenarioRules: ScenarioRules = {
  initialSnapshot() {
    const now = new Date(0).toISOString();
    const fc = { type: 'FeatureCollection' as const, version: 0, generatedAt: now, features: [] };
    return { version: 0, generatedAt: now, flood: fc, roads: fc, settlements: fc, routes: fc, shelters: fc };
  },
  apply: (_event, snapshot) => ({ snapshot, changed: false, effects: [] }),
};

/** A persisted event record held by the mock server. */
export interface StoredEvent {
  eventId: string;
  clientEventId: string;
  event: FieldEvent;
  serverState: 'accepted' | 'applied' | 'conflict';
  receivedAt: string;
  acceptedAtVersion?: number;
  appliedAtVersion?: number;
  /** Epoch ms at which an accepted event becomes applied. */
  applyAt?: number;
  conflictReason?: string;
}

/** Everything the mock server persists / replicates between tabs and the relay. JSON-serialisable. */
export interface MockSyncState {
  version: number;
  snapshot: ProjectionSnapshot;
  events: StoredEvent[];
}

/**
 * Hook implemented by H2's relay client (cross-origin tab sync). The store publishes its full state
 * on every change and adopts newer remote states.
 */
export interface MockRelay {
  publish(state: MockSyncState): void;
  subscribe(onState: (state: MockSyncState) => void): () => void;
}
