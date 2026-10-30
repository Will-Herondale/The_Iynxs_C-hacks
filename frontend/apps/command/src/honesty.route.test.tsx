import { describe, expect, it } from 'vitest';
import { ProjectionSnapshotSchema } from '@setu/contract';
import { routeEtaText } from './honesty';

describe('route ETA wording', () => {
  it('an unavailable route has no ETA, even though the backend sends etaMin 0', () => {
    expect(routeEtaText({ status: 'unavailable', etaMin: 0 })).toBe('No ETA (route unavailable)');
    expect(routeEtaText({ status: 'active', etaMin: 12 })).toContain('~12 min');
    expect(routeEtaText({ status: 'active', etaMin: 12 })).toContain('source unconfirmed');
  });
});

describe('contract keeps the authoritative route explanation', () => {
  it('parses refusal with summary, blockingFeatureIds and optional sourceEventIds', () => {
    const fc = (features: unknown[]) => ({ type: 'FeatureCollection', version: 1, generatedAt: '2026-10-31T00:00:00Z', features });
    const snap = ProjectionSnapshotSchema.parse({
      version: 1, generatedAt: '2026-10-31T00:00:00Z', flood: fc([]), roads: fc([]), settlements: fc([]), shelters: fc([]),
      routes: fc([{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[94, 26], [94.1, 26.1]] },
        properties: { routeId: 'syn-evac-1', from: 'S', to: 'H', kind: 'evacuation', status: 'unavailable', etaMin: 0, synthetic: true,
          refusal: { summary: 'No safe route: bridge blocked.', blockingFeatureIds: ['syn-bridge-1'], sourceEventIds: ['evt_1'] } } }]),
    });
    const r = snap.routes.features[0]!.properties.refusal!;
    expect(r.summary).toContain('No safe route');
    expect(r.blockingFeatureIds).toEqual(['syn-bridge-1']);
    expect(r.sourceEventIds).toEqual(['evt_1']);
  });
});
