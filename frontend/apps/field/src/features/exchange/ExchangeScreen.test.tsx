// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { newClientEventId } from '@setu/contract';

const dup = newClientEventId();
const m = vi.hoisted(() => ({
  collectExportable: vi.fn(),
  existingClientEventIds: vi.fn(),
  importEvents: vi.fn(),
  recordExport: vi.fn(),
}));
vi.mock('./store.js', () => m);

import { ExchangeScreen, EXCHANGE_NOTE } from './ExchangeScreen.js';

const ev = (id: string) => ({
  clientEventId: id,
  occurredAt: '2026-10-30T10:00:00Z',
  reporterId: 'r1',
  deviceId: 'd1',
  location: { lat: 26.14, lng: 91.73, accuracyM: 8 },
  type: 'flood_report',
  severity: 3,
});

const pick = (text: string) => {
  const file = new File([text], 'x.jsonl');
  Object.defineProperty(file, 'text', { value: async () => text });
  fireEvent.change(screen.getByTestId('exchange-import-file'), { target: { files: [file] } });
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ExchangeScreen', () => {
  it('shows the honest note', () => {
    render(<ExchangeScreen />);
    expect(screen.getByTestId('exchange-note').textContent).toBe(EXCHANGE_NOTE);
  });

  it('previews per-line results and imports only accepted lines after confirm', async () => {
    m.existingClientEventIds.mockResolvedValue(new Set([dup]));
    m.importEvents.mockResolvedValue([]);
    const id = newClientEventId();
    render(<ExchangeScreen />);
    pick([JSON.stringify(ev(id)), JSON.stringify(ev(dup)), '{bad'].join('\n'));
    await waitFor(() => expect(screen.getAllByTestId('exchange-result-row')).toHaveLength(3));
    const kinds = screen.getAllByTestId('exchange-result-row').map((r) => r.getAttribute('data-result'));
    expect(kinds).toHaveLength(3);
    expect(kinds).toContain('rejected');
    expect(kinds).toContain('duplicate');
    expect(m.importEvents).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('exchange-import-confirm'));
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(screen.getByTestId('exchange-import-done')).toBeTruthy());
    const sent = m.importEvents.mock.calls[0]![0] as { clientEventId: string }[];
    expect(sent.map((e) => e.clientEventId).every((x) => x !== dup)).toBe(true);
    expect(screen.getByTestId('exchange-import-done').textContent).toContain(EXCHANGE_NOTE);
  });

  it('shows a file-level error', async () => {
    m.existingClientEventIds.mockResolvedValue(new Set());
    render(<ExchangeScreen />);
    pick('x'.repeat(5 * 1024 * 1024 + 1));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('too large'));
  });

  it('exports and shows the count', async () => {
    m.collectExportable.mockResolvedValue([ev(newClientEventId()), ev(newClientEventId())]);
    m.recordExport.mockResolvedValue(undefined);
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<ExchangeScreen />);
    fireEvent.click(screen.getByTestId('exchange-export'));
    await waitFor(() => expect(screen.getByTestId('exchange-export-count').textContent).toContain('2'));
    expect(click).toHaveBeenCalled();
  });
});
