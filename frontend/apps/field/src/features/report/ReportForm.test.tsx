// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FieldEvent, ProjectionSnapshot } from '@setu/contract';
import { ReportScreen } from './ReportForm.js';
import { FALLBACK_ROADS, filterRoadOptions, roadOptions } from './roadOptions.js';
import type { QueueItem } from '../../sync/index.js';
import { buildReportEvent, EMPTY_REPORT } from './buildEvent.js';

const tid = (id: string) => screen.getByTestId(id) as HTMLInputElement;
afterEach(cleanup);

describe('buildReportEvent', () => {
  const id = { reporterId: 'r', deviceId: 'd' };
  it('builds a valid road_blockage', () => {
    const r = buildReportEvent({ ...EMPTY_REPORT, type: 'road_blockage', roadId: 'R7', lat: '26.1', lng: '91.7' }, id, crypto.randomUUID());
    expect(r.ok && r.event.type === 'road_blockage' && r.event.roadId === 'R7').toBe(true);
  });
  it('rejects road_cleared without a road and missing location', () => {
    const r = buildReportEvent({ ...EMPTY_REPORT, type: 'road_cleared' }, id, crypto.randomUUID());
    expect(r.ok).toBe(false);
  });
});

describe('ReportScreen', () => {
  it('submits a road_blockage R7 full report to the queue writer', async () => {
    const submit = vi.fn(async (e: FieldEvent) => (void e, undefined));
    render(<ReportScreen submit={submit} />);
    fireEvent.click(tid('report-type-road_blockage'));
    fireEvent.change(await screen.findByTestId('field-roadId'), { target: { value: 'R7' } });
    fireEvent.change(tid('field-blockage'), { target: { value: 'full' } });
    fireEvent.change(tid('field-lat'), { target: { value: '26.14' } });
    fireEvent.change(tid('field-lng'), { target: { value: '91.73' } });
    fireEvent.click(tid('report-submit'));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const ev = submit.mock.calls[0]![0];
    expect(ev).toMatchObject({ type: 'road_blockage', roadId: 'R7', blockage: 'full' });
  });

  it('shows form-error and does not submit invalid input', async () => {
    const submit = vi.fn(async () => undefined);
    render(<ReportScreen submit={submit} />);
    fireEvent.click(tid('report-submit'));
    expect(await screen.findByTestId('form-error')).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it('double-click submits once', async () => {
    const submit = vi.fn(() => new Promise<undefined>((r) => setTimeout(() => r(undefined), 30)));
    render(<ReportScreen submit={submit} />);
    fireEvent.change(tid('field-lat'), { target: { value: '26.14' } });
    fireEvent.change(tid('field-lng'), { target: { value: '91.73' } });
    const form = screen.getByRole('form');
    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.click(tid('report-submit'));
    await new Promise((r) => setTimeout(r, 120));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('quick action preselects blocked road/full and lists roads only', async () => {
    render(<ReportScreen submit={vi.fn(async () => undefined)} />);
    fireEvent.click(tid('quick-blocked'));
    const road = (await screen.findByTestId('field-roadId')) as HTMLSelectElement;
    const values = Array.from(road.options).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['R1', 'R10']));
    expect(values).not.toContain('B1');
    expect(tid('field-blockage').value).toBe('full');
  });

  it('submerged bridge: bridges only, cause fixed to submerged, observed time editable', async () => {
    const submit = vi.fn(async (e: FieldEvent) => (void e, undefined));
    render(<ReportScreen submit={submit} />);
    fireEvent.click(tid('report-type-submerged_bridge'));
    const road = (await screen.findByTestId('field-roadId')) as HTMLSelectElement;
    expect(Array.from(road.options).map((o) => o.value).filter(Boolean)).toEqual(['B1']);
    expect(screen.getByTestId('cause-fixed').textContent).toContain('submerged');
    fireEvent.change(road, { target: { value: 'B1' } });
    fireEvent.change(tid('field-observedAt'), { target: { value: '2026-10-30T09:15' } });
    fireEvent.change(tid('field-lat'), { target: { value: '26.95' } });
    fireEvent.change(tid('field-lng'), { target: { value: '94.17' } });
    expect(screen.getByTestId('location-summary').textContent).toContain('Manually placed');
    fireEvent.click(tid('report-submit'));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const ev = submit.mock.calls[0]![0];
    expect(ev).toMatchObject({ type: 'road_blockage', roadId: 'B1', blockage: 'full', cause: 'submerged' });
    expect(ev.occurredAt).toBe(new Date('2026-10-30T09:15').toISOString());
    expect(ev.location.accuracyM).toBeUndefined();
    expect((await screen.findByTestId('report-saved-label')).textContent).toBe('Saved locally');
  });

  it('damaged infrastructure and other are disabled with the #15 note and cannot be selected', () => {
    render(<ReportScreen submit={vi.fn(async () => undefined)} />);
    for (const c of ['damaged_infrastructure', 'other']) {
      const b = screen.getByTestId(`report-category-${c}`);
      expect(b.getAttribute('aria-disabled')).toBe('true');
      expect(b.textContent).toContain('Blocked: issue #15');
      fireEvent.click(b);
      expect(b.getAttribute('aria-checked')).toBe('false');
    }
  });

  it('water level shows the cm unit and the disabled estimated-vs-measured hint', () => {
    render(<ReportScreen submit={vi.fn(async () => undefined)} />);
    fireEvent.click(tid('report-type-water_level'));
    expect(screen.getByText(/unit: cm/)).toBeTruthy();
    expect(screen.getByTestId('estimate-hint').textContent).toContain('issue #15');
  });

  it('location is optional-GPS: unknown until set, and submit is refused without one', async () => {
    const submit = vi.fn(async () => undefined);
    render(<ReportScreen submit={submit} />);
    expect(screen.getByTestId('location-summary').textContent).toContain('Unknown');
    fireEvent.click(tid('report-submit'));
    expect(await screen.findByTestId('form-error')).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it('rejects an observation time in the future', () => {
    const r = buildReportEvent(
      { ...EMPTY_REPORT, category: 'flooded_road', lat: '26.9', lng: '94.1', observedAt: '2999-01-01T00:00' },
      { reporterId: 'r', deviceId: 'd' }, crypto.randomUUID(),
    );
    expect(r.ok).toBe(false);
  });

  it('GPS accuracy is carried into the event only when the location came from GPS', () => {
    const base = { ...EMPTY_REPORT, category: 'flooded_road' as const, lat: '26.9', lng: '94.1', accuracyM: '12' };
    const id = { reporterId: 'r', deviceId: 'd' };
    const gps = buildReportEvent({ ...base, locationSource: 'gps' }, id, crypto.randomUUID());
    const manual = buildReportEvent({ ...base, locationSource: 'manual' }, id, crypto.randomUUID());
    expect(gps.ok && gps.event.location.accuracyM).toBe(12);
    expect(manual.ok && manual.event.location.accuracyM).toBeUndefined();
  });
});

describe('roadOptions', () => {
  it('filters bridges', () => {
    expect(filterRoadOptions(FALLBACK_ROADS, 'bridge').map((o) => o.id)).toEqual(['B1']);
  });
  it('labels bridges from the cached snapshot', () => {
    const snap = { roads: { features: [
      { properties: { roadId: 'R1', name: 'Main Rd' } },
      { properties: { roadId: 'B9', name: 'Bharalu Bridge', kind: 'bridge' } },
    ] } } as unknown as ProjectionSnapshot;
    expect(roadOptions(snap).map((o) => o.label)).toEqual(['R1 — Main Rd', 'Bridge: Bharalu Bridge (B9)']);
    expect(roadOptions(undefined)).toBe(FALLBACK_ROADS);
  });
});

describe('ReportScreen editing a rejected item', () => {
  it('shows form-error with the server validation errors', () => {
    const r = buildReportEvent({ ...EMPTY_REPORT, type: 'road_blockage', roadId: 'R7', lat: '26.1', lng: '91.7' }, { reporterId: 'r', deviceId: 'd' }, crypto.randomUUID());
    if (!r.ok) throw new Error('setup');
    const item = {
      clientEventId: r.event.clientEventId, event: r.event, type: r.event.type, status: 'rejected',
      validationErrors: [{ path: 'roadId', message: 'Unknown road R7' }, { path: '', message: 'Second problem' }],
    } as unknown as QueueItem;
    render(<ReportScreen editing={item} />);
    const box = screen.getByTestId('form-error');
    expect(box.textContent).toContain('Unknown road R7');
    expect(box.textContent).toContain('Second problem');
  });
});
