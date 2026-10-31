import type { ApiClient, ProjectionSnapshot } from '@setu/contract';

/** Empty snapshot: what an honest, freshly started backend returns. Test-only. */
export function emptySnapshot(version = 0): ProjectionSnapshot {
  const fc = { type: 'FeatureCollection', features: [] } as const;
  return {
    version,
    generatedAt: '2026-01-01T00:00:00.000Z',
    flood: fc, roads: fc, settlements: fc, routes: fc, shelters: fc,
  } as unknown as ProjectionSnapshot;
}

/** Small in-test ApiClient (no mock-backend). Override any method. */
export function stubApi(over: Partial<ApiClient> = {}): ApiClient {
  return {
    submitEvents: async (events) => events.map((e, i) => ({ clientEventId: e.clientEventId, result: 'accepted', eventId: `E${i}`, acceptedAtVersion: 1 })),
    getEventStatus: async (ids) => ids.map((id) => ({ clientEventId: id, state: 'accepted' })),
    getProjections: async () => emptySnapshot(),
    listEvents: async () => [],
    subscribe: () => () => undefined,
    ...over,
  } as ApiClient;
}
