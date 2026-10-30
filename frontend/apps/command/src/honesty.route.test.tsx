// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ProjectionSnapshotSchema } from '@setu/contract';
import { RouteReason, routeEtaText } from './honesty';

afterEach(cleanup);

describe('route reason and ETA wording', () => {
  it('an unavailable route has no ETA, even though the backend sends etaMin 0', () => {
    expect(routeEtaText({ status: 'unavailable', etaMin: 0 })).toBe('No ETA (route unavailable)');
    expect(routeEtaText({ status: 'active', etaMin: 12 })).toContain('~12 min');
    expect(routeEtaText({ status: 'active', etaMin: 12 })).toContain('source unconfirmed');
  });

  it('shows the backend reason verbatim and labelled when it adds information', () => {
    render(<RouteReason routeId="r1" reason="No connected path between settlement and shelter" refusalSummary="No safe route" />);
    const el = screen.getByTestId('route-reason-r1');
    expect(el.textContent).toContain('Backend reason:');
    expect(el.textContent).toContain('No connected path between settlement and shelter');
    expect(el.textContent).toContain('not verified here');
  });

  it('hides the reason when it only repeats the refusal summary, or when absent', () => {
    render(<><RouteReason routeId="a" reason="Same" refusalSummary="Same" /><RouteReason routeId="b" /></>);
    expect(screen.queryByTestId('route-reason-a')).toBeNull();
    expect(screen.queryByTestId('route-reason-b')).toBeNull();
  });
});

describe('contract accepts the backend route reason', () => {
  it('keeps `reason` (and `refusal`) on a route feature instead of dropping it', () => {
    const fc = (features: unknown[]) => ({ type: 'FeatureCollection', version: 1, generatedAt: '2026-10-31T00:00:00Z', features });
    const snap = ProjectionSnapshotSchema.parse({
      version: 1, generatedAt: '2026-10-31T00:00:00Z', flood: fc([]), roads: fc([]), settlements: fc([]), shelters: fc([]),
      routes: fc([{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[94, 26], [94.1, 26.1]] },
        properties: { routeId: 'evac-0', from: 'S', to: 'H', kind: 'evacuation', status: 'unavailable', etaMin: 0,
          reason: 'No route reaches H from S within the 10-minute evacuation window.', refusal: { summary: 'x', blockingFeatureIds: [] }, synthetic: true } }]),
    });
    const p = snap.routes.features[0]!.properties;
    expect(p.reason).toContain('10-minute');
    expect(p.synthetic).toBe(true);
  });
});
