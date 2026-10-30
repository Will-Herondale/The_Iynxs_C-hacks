// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FieldEvent } from '@setu/contract';
import { ReportScreen } from './ReportForm.js';
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
});
