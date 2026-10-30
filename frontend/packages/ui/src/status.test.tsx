// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import {
  ERROR_KINDS, ErrorState, EventCard, LoadingState, ObservationCard, OfflineBanner,
  SeverityLabel, StatusBadge, SyncStatusSummary, SyntheticTag,
} from './index.js';

afterEach(cleanup);

async function violations(el: Element) {
  const res = await axe.run(el as HTMLElement, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
  return res.violations.map((v) => v.id);
}

const counts = { queued: 2, sending: 1, accepted: 1, synced: 5, conflict: 1, rejected: 0, failed: 1 };

describe('StatusBadge', () => {
  it('keeps the sync-status-label test id and exports both names', () => {
    render(<StatusBadge status="synced" />);
    expect(screen.getByTestId('sync-status-label').textContent).toBe('Accepted');
  });
  it('distinguishes offline-queued with its own class', () => {
    const { container } = render(<StatusBadge status="queued" online={false} />);
    expect(container.firstElementChild!.className).toContain('setu-sync--offline');
  });
});

describe('SeverityLabel', () => {
  it('shows text for numeric and named levels', () => {
    const { rerender } = render(<SeverityLabel level={4} />);
    expect(screen.getByText('Severity 4 of 5')).toBeTruthy();
    rerender(<SeverityLabel level="critical" />);
    expect(screen.getByText('Critical')).toBeTruthy();
    rerender(<SeverityLabel level="normal" />);
    expect(screen.getByText('Normal')).toBeTruthy();
  });
});

describe('EventCard', () => {
  it('renders fields, status, and click handler', () => {
    const onClick = vi.fn();
    render(<EventCard title="Water under bridge" where="Road 123" observedAt="2026-10-30T06:30:00Z" receivedAt="2026-10-30T06:31:00Z" status="synced" onClick={onClick} />);
    expect(screen.getByText('30 Oct, 12:00 IST')).toBeTruthy();
    expect(screen.getByText('30 Oct, 12:01 IST')).toBeTruthy();
    expect(screen.getByTestId('sync-status-label').textContent).toBe('Accepted');
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });
  it('is not a button without onClick', () => {
    render(<EventCard title="t" where="w" observedAt="2026-10-30T06:30:00Z" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ObservationCard / SyntheticTag', () => {
  it('labels each kind and tags synthetic only', () => {
    const { rerender } = render(<ObservationCard kind="observed" title="Gauge 1">x</ObservationCard>);
    expect(screen.getByText(/Observed/)).toBeTruthy();
    expect(screen.queryByTestId('synthetic-tag')).toBeNull();
    rerender(<ObservationCard kind="modelled" title="Flood extent" source="DEM-threshold estimate" />);
    expect(screen.getByText(/Modelled/)).toBeTruthy();
    rerender(<ObservationCard kind="synthetic" title="S1" />);
    expect(screen.getByTestId('synthetic-tag').textContent).toContain('SYNTHETIC');
  });
  it('SyntheticTag exposes its note as tooltip', () => {
    render(<SyntheticTag note="Scenario S2" />);
    expect(screen.getByTestId('synthetic-tag').getAttribute('title')).toBe('Scenario S2');
  });
});

describe('OfflineBanner', () => {
  it('renders only when offline', () => {
    const { rerender } = render(<OfflineBanner online />);
    expect(screen.queryByTestId('offline-banner')).toBeNull();
    rerender(<OfflineBanner online={false} />);
    expect(screen.getByTestId('offline-banner').textContent).toContain('Offline');
  });
});

describe('SyncStatusSummary', () => {
  it('merges sending + accepted and counts unconfirmed', () => {
    render(<SyncStatusSummary counts={counts} online lastSyncedAt="2026-10-30T06:30:00Z" />);
    expect(screen.getByTestId('sync-count-synchronising').textContent).toBe('2');
    expect(screen.getByTestId('sync-count-queued').textContent).toBe('2');
    expect(screen.getByTestId('sync-summary-pending').textContent).toBe('6');
    expect(screen.getByText('Waiting to sync')).toBeTruthy();
    expect(screen.getByText('30 Oct, 12:00 IST')).toBeTruthy();
  });
  it('uses "Saved locally" offline and handles no last sync', () => {
    render(<SyncStatusSummary counts={counts} online={false} />);
    expect(screen.getByText('Saved locally')).toBeTruthy();
    expect(screen.getByText('No confirmed sync yet')).toBeTruthy();
  });
});

describe('LoadingState / ErrorState', () => {
  it('LoadingState is a busy status', () => {
    render(<LoadingState label="Loading roads" />);
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('Loading roads')).toBeTruthy();
  });
  it('ErrorState renders all ten kinds with distinct titles, detail and action', () => {
    expect(ERROR_KINDS).toHaveLength(10);
    const titles = new Set<string>();
    for (const kind of ERROR_KINDS) {
      const { unmount } = render(<ErrorState kind={kind} detail="HTTP 503" action={<button type="button">Retry</button>} />);
      const el = screen.getByTestId(`error-state-${kind}`);
      expect(el.getAttribute('data-kind')).toBe(kind);
      expect(screen.getByText('HTTP 503')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
      titles.add(el.querySelector('.setu-error__title')!.textContent!);
      unmount();
    }
    expect(titles.size).toBe(10);
  });
});

describe('a11y (axe)', () => {
  it('has no violations across the status/content components', async () => {
    const { container } = render(
      <div>
        {(['queued', 'sending', 'accepted', 'synced', 'conflict', 'rejected', 'failed'] as const).map((s) => <StatusBadge key={s} status={s} online={false} />)}
        <SeverityLabel level={5} />
        <EventCard title="E" where="W" observedAt="2026-10-30T06:30:00Z" status="conflict" onClick={() => {}} />
        <ObservationCard kind="synthetic" title="S" source="Scenario" at="2026-10-30T06:30:00Z">body</ObservationCard>
        <OfflineBanner online={false} />
        <SyncStatusSummary counts={counts} online />
        <LoadingState />
        {ERROR_KINDS.map((k) => <ErrorState key={k} kind={k} />)}
      </div>,
    );
    expect(await violations(container)).toEqual([]);
  });
});
