import { describe, expect, it } from 'vitest';
import { LAYER_DATA_CLASS, dataClassOf, formatCalculatedEta, formatIndicativeEta, routeState, shelterStatus, ROUTE_STATE_META } from './honesty.js';

describe('LAYER_DATA_CLASS', () => {
  it('classifies', () => {
    for (const k of ['roads', 'bridges', 'waterways', 'waterbodies', 'places', 'island', 'hillshade', 'dem']) expect(dataClassOf(k)).toBe('REAL');
    for (const k of ['shelters', 'routes', 'settlements']) expect(LAYER_DATA_CLASS[k as 'routes']).toBe('SYNTHETIC');
    for (const k of ['flood-dem', 'flood-modelled', 'flood-hand', 'hand']) expect(dataClassOf(k)).toBe('EXPERIMENTAL');
    expect(dataClassOf('nope')).toBeUndefined();
  });
});

describe('shelterStatus', () => {
  it('open:false 0/0 is pre-identified, neutral, no counts', () => {
    const s = shelterStatus({ open: false, capacity: 0, occupancy: 0 });
    expect(s).toMatchObject({ status: 'preidentified', label: 'Pre-identified · not confirmed', tone: 'neutral', capacityText: 'not published', occupancyText: 'not published', confirmed: false });
  });
  it('open:true shows Open (reported)', () => {
    expect(shelterStatus({ open: true, capacity: 200, occupancy: 40 })).toMatchObject({ status: 'open-reported', label: 'Open (reported)', capacityText: '200', occupancyText: '40' });
  });
  it('open:true with 0 capacity never shows 0/0', () => {
    const s = shelterStatus({ open: true, capacity: 0, occupancy: 0 });
    expect(s.label).toBe('Open (reported)');
    expect(s.capacityText).toBe('not published');
  });
  it('open:false with real counts is not-open, not pre-identified', () => {
    expect(shelterStatus({ open: false, capacity: 100, occupancy: 100 })).toMatchObject({ status: 'closed-reported', tone: 'neutral', capacityText: '100' });
    expect(shelterStatus({ open: false, capacity: 0, occupancy: 5 }).status).toBe('closed-reported');
  });
  it('never uses Open label for open:false', () => {
    expect(shelterStatus({ open: false, capacity: 0, occupancy: 0 }).label).not.toMatch(/^Open/);
  });
});

describe('routeState', () => {
  const active = { status: 'active' as const };
  it('active/recalculated without a verified computation stay not-verified, never calculated', () => {
    expect(routeState(active)).toBe('not-verified');
    expect(routeState({ status: 'recalculated' }, { settlementRoutes: [active] })).toBe('not-verified');
    expect(routeState({ status: 'active', computation: { verified: false } })).toBe('not-verified');
  });
  it('only a verified road-graph computation -> calculated', () => {
    expect(routeState({ status: 'active', computation: { method: 'road_graph', verified: true } })).toBe('calculated');
    expect(routeState({ status: 'recalculated', computation: { method: 'road_graph', verified: true } })).toBe('calculated');
    expect(
      routeState(undefined, {
        settlementRoutes: [
          { status: 'unavailable' },
          { status: 'active', computation: { method: 'road_graph', verified: true } },
        ],
      }),
    ).toBe('calculated');
    expect(
      routeState(undefined, {
        settlementRoutes: [
          { status: 'unavailable' },
          { status: 'active', computation: { method: 'road_graph', verified: false } },
        ],
      }),
    ).toBe('not-verified');
  });
  it('unavailable with refusal -> refused', () => {
    expect(routeState({ status: 'unavailable', refusal: { title: 'x' } })).toBe('refused');
  });
  it('unavailable without refusal -> no-safe-route', () => {
    expect(routeState({ status: 'unavailable' })).toBe('no-safe-route');
  });
  it('no route: no-route-data / no-safe-route / not-verified', () => {
    expect(routeState(undefined)).toBe('no-route-data');
    expect(routeState(null, { settlementRoutes: [] })).toBe('no-route-data');
    expect(routeState(undefined, { settlementRoutes: [{ status: 'unavailable' }, { status: 'unavailable' }] })).toBe('no-safe-route');
    expect(routeState(undefined, { settlementRoutes: [{ status: 'unavailable' }, active] })).toBe('not-verified');
  });
  it('unreachable only on explicit reserved signal', () => {
    expect(routeState(active, { destinationUnreachable: true })).toBe('unreachable');
    expect(routeState(active, { destinationUnreachable: false })).toBe('not-verified');
    expect(routeState({ status: 'unavailable', refusal: {} }, { destinationUnreachable: true })).toBe('refused');
  });
  it('meta exists for every state with an icon', () => {
    for (const m of Object.values(ROUTE_STATE_META)) expect(m.icon && m.label && m.explanation).toBeTruthy();
    expect(ROUTE_STATE_META['not-verified'].label).toBe('Route not verified');
  });
});

describe('formatCalculatedEta', () => {
  it('labels the road-network computation', () => {
    expect(formatCalculatedEta(31)).toBe('~31 min (calculated on the road network)');
    expect(formatCalculatedEta(75)).toBe('~1 h 15 min (calculated on the road network)');
    expect(formatCalculatedEta(undefined)).toMatch(/^ETA unavailable/);
  });
});

describe('formatIndicativeEta', () => {
  it('labels indicative', () => {
    expect(formatIndicativeEta(45)).toBe('~45 min (indicative, source unconfirmed)');
    expect(formatIndicativeEta(75)).toBe('~1 h 15 min (indicative, source unconfirmed)');
    expect(formatIndicativeEta(60)).toBe('~1 h (indicative, source unconfirmed)');
    expect(formatIndicativeEta(0)).toContain('~0 min');
  });
  it('handles invalid', () => {
    for (const v of [NaN, -1, undefined, null, Infinity]) expect(formatIndicativeEta(v as number)).toMatch(/^ETA unavailable/);
  });
});
