// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ClientSyncStatusSchema } from '@setu/contract';
import { DeadlineBadge, Explanation, PassabilityLegend, SETU_MAP_COLORS, AppShell, Button, EmptyState, Field, OnlineIndicator, Panel, SyncStatusBadge } from './index.js';

afterEach(cleanup);

const statuses = ClientSyncStatusSchema.options;

describe('SyncStatusBadge', () => {
  it('renders a unique label, class, icon and aria-label for every status', () => {
    const labels = new Set<string>();
    const classes = new Set<string>();
    const icons = new Set<string>();
    const arias = new Set<string>();
    for (const status of statuses) {
      const { container, unmount } = render(<SyncStatusBadge status={status} />);
      const el = container.firstElementChild as HTMLElement;
      labels.add(el.querySelector('.setu-sync__label')!.textContent!);
      icons.add(el.querySelector('.setu-sync__icon')!.textContent!);
      classes.add(el.className);
      arias.add(el.getAttribute('aria-label')!);
      expect(el.className).toContain(`setu-sync--${status}`);
      unmount();
    }
    // sending + accepted both read "Synchronising" (spec vocabulary) but differ in class, icon and aria-label.
    for (const s of [classes, icons, arias]) expect(s.size).toBe(statuses.length);
    expect(labels.size).toBe(statuses.length - 1);
  });

  it('queued and accepted are visually different pending variants', () => {
    const q = render(<SyncStatusBadge status="queued" />).container.firstElementChild!;
    const a = render(<SyncStatusBadge status="accepted" />).container.firstElementChild!;
    expect(q.className).not.toBe(a.className);
    expect(q.textContent).not.toBe(a.textContent);
  });
});

describe('components', () => {
  it('OnlineIndicator shows text for both states', () => {
    const { rerender } = render(<OnlineIndicator online />);
    expect(screen.getByText('Online')).toBeTruthy();
    rerender(<OnlineIndicator online={false} />);
    expect(screen.getByText('Offline')).toBeTruthy();
  });

  it('Field links label and error', () => {
    render(<Field label="Name" error="Required" />);
    const input = screen.getByLabelText('Name');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Required');
  });

  it('AppShell, Panel, Button, EmptyState render', () => {
    render(
      <AppShell header="H" nav="N" main={<Panel title="P"><Button>Go</Button></Panel>} aside={<EmptyState title="Nothing" />} />,
    );
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go' }).getAttribute('type')).toBe('button');
    expect(screen.getByText('Nothing')).toBeTruthy();
  });
});

describe('wave 3 ui', () => {
  it('SyncStatusBadge vocabulary labels', () => {
    const label = (status: (typeof statuses)[number], online?: boolean) => {
      const { unmount } = render(<SyncStatusBadge status={status} online={online} />);
      const t = screen.getByTestId('sync-status-label').textContent;
      unmount();
      return t;
    };
    expect(label('queued', false)).toBe('Saved locally');
    expect(label('queued', true)).toBe('Waiting to sync');
    expect(label('sending')).toBe('Synchronising');
    expect(label('accepted')).toBe('Synchronising');
    expect(label('synced')).toBe('Accepted');
    expect(label('conflict')).toBe('Requires review');
    expect(label('rejected')).toBe('Rejected');
    expect(label('failed')).toBe('Failed — retry available');
  });

  it('Explanation renders title, summary, items', () => {
    render(<Explanation title="Why cut off" summary="B1 is submerged" items={['a', 'b']} data-testid="x" />);
    expect(screen.getByTestId('x').textContent).toContain('B1 is submerged');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('DeadlineBadge: ok, urgent under 1h, overdue', () => {
    const now = Date.parse('2026-01-01T12:00:00Z');
    const r = render(<DeadlineBadge deadline="2026-01-01T15:00:00Z" now={now} data-testid="d" />);
    expect(screen.getByTestId('d').textContent).toContain('3h 0m left');
    expect(screen.getByTestId('d').getAttribute('data-deadline')).toBe('2026-01-01T15:00:00Z');
    expect(screen.getByTestId('d').className).not.toContain('urgent');
    r.rerender(<DeadlineBadge deadline="2026-01-01T12:30:00Z" now={now} data-testid="d" />);
    expect(screen.getByTestId('d').className).toContain('urgent');
    r.rerender(<DeadlineBadge deadline="2026-01-01T11:00:00Z" now={now} data-testid="d" />);
    expect(screen.getByTestId('d').textContent).toContain('OVERDUE');
    expect(screen.getByTestId('d').className).toContain('overdue');
  });

  it('PassabilityLegend lists four states; colours exported', () => {
    render(<PassabilityLegend />);
    for (const t of ['Flooded', 'Blocked', 'Safe', 'Uncertain']) expect(screen.getByText(t)).toBeTruthy();
    expect(Object.keys(SETU_MAP_COLORS)).toEqual(['flooded', 'blocked', 'safe', 'uncertain', 'warning', 'review', 'unverified']);
  });
});
