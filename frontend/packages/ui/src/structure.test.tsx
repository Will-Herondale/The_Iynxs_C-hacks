// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { ConfirmDialog } from './ConfirmDialog.js';
import { ContextPanel } from './ContextPanel.js';
import { DataTable } from './DataTable.js';
import { FormField } from './FormField.js';

afterEach(cleanup);

async function violations(el: Element) {
  const res = await axe.run(el, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
  return res.violations.map((v) => v.id);
}

interface Row { id: string; name: string; n: number }
const rows: Row[] = [
  { id: 'a', name: 'Kamalabari', n: 3 },
  { id: 'b', name: 'Dakhinpat', n: 10 },
  { id: 'c', name: 'Garamur', n: 1 },
];
const columns = [
  { key: 'name', header: 'Name', sortValue: (r: Row) => r.name },
  { key: 'n', header: 'Count', sortValue: (r: Row) => r.n },
];
const names = () => screen.getAllByRole('row').slice(1).map((r) => r.querySelector('td')!.textContent);

describe('DataTable', () => {
  it('sorts by column, cycling asc/desc/none', () => {
    render(<DataTable columns={columns} rows={rows} getRowId={(r) => r.id} />);
    const countBtn = screen.getByRole('button', { name: /Count/ });
    fireEvent.click(countBtn);
    expect(names()).toEqual(['Garamur', 'Kamalabari', 'Dakhinpat']);
    fireEvent.click(countBtn);
    expect(names()).toEqual(['Dakhinpat', 'Kamalabari', 'Garamur']);
    expect(screen.getByRole('columnheader', { name: /Count/ }).getAttribute('aria-sort')).toBe('descending');
    fireEvent.click(countBtn);
    expect(names()).toEqual(['Kamalabari', 'Dakhinpat', 'Garamur']);
  });

  it('filters by searchKeys and shows an empty state', () => {
    render(<DataTable columns={columns} rows={rows} getRowId={(r) => r.id} searchKeys={['name']} emptyMessage="Nothing here" />);
    const box = screen.getByRole('searchbox');
    fireEvent.change(box, { target: { value: 'gara' } });
    expect(names()).toEqual(['Garamur']);
    fireEvent.change(box, { target: { value: 'zzz' } });
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });

  it('supports keyboard navigation and activation', () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} rows={rows} getRowId={(r) => r.id} onRowClick={onRowClick} />);
    const [r1, r2] = screen.getAllByRole('row').slice(1);
    r1!.focus();
    fireEvent.keyDown(r1!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(r2);
    fireEvent.keyDown(r2!, { key: 'Enter' });
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });

  it('paginates at 100 rows', () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ id: String(i), name: `n${i}`, n: i }));
    render(<DataTable columns={columns} rows={many} getRowId={(r) => r.id} />);
    expect(screen.getAllByRole('row')).toHaveLength(101);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(/Page 2 of 3/)).toBeTruthy();
    expect(names()[0]).toBe('n100');
  });

  it('has no a11y violations', async () => {
    const { container } = render(<DataTable columns={columns} rows={rows} getRowId={(r) => r.id} searchKeys={['name']} caption="Villages" />);
    expect(await violations(container)).toEqual([]);
  });
});

describe('ContextPanel', () => {
  it('labels itself, closes on button and Esc, and has no violations', async () => {
    const onClose = vi.fn();
    const { container } = render(<ContextPanel title="Road 123" onClose={onClose}>body</ContextPanel>);
    expect(screen.getByRole('complementary', { name: 'Road 123' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    fireEvent.keyDown(screen.getByRole('complementary'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(await violations(container)).toEqual([]);
  });
});

describe('FormField', () => {
  it('links label, hint and error to the control', async () => {
    const { container } = render(
      <FormField label="Depth (cm)" hint="Estimate" error="Required">
        <input />
      </FormField>,
    );
    const input = screen.getByLabelText('Depth (cm)');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const described = input.getAttribute('aria-describedby')!.split(' ').map((id) => document.getElementById(id)!.textContent);
    expect(described.join(' ')).toContain('Estimate');
    expect(described.join(' ')).toContain('Required');
    expect(await violations(container)).toEqual([]);
  });
});

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    render(<ConfirmDialog open={false} title="t" body="b" confirmLabel="Go" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is modal, traps Tab, cancels on Esc, and confirms', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { container } = render(<ConfirmDialog open title="Discard?" body="Lose changes" confirmLabel="Discard" onConfirm={onConfirm} onCancel={onCancel} />);
    const dialog = screen.getByRole('dialog', { name: 'Discard?' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    const confirm = within(dialog).getByRole('button', { name: 'Discard' });
    expect(document.activeElement).toBe(cancel);
    confirm.focus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalled();
    expect(await violations(container)).toEqual([]);
  });

  it('restores focus to the opener', () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>open</button>
          <ConfirmDialog open={open} title="t" body="b" confirmLabel="Go" onConfirm={() => {}} onCancel={() => setOpen(false)} />
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByText('open');
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByText('Cancel'));
    expect(document.activeElement).toBe(opener);
  });
});
