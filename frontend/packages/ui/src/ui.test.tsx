// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ClientSyncStatusSchema } from '@setu/contract';
import { AppShell, Button, EmptyState, Field, OnlineIndicator, Panel, SyncStatusBadge } from './index.js';

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
    for (const s of [labels, classes, icons, arias]) expect(s.size).toBe(statuses.length);
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
