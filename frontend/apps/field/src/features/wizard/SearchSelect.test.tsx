// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SearchSelect } from './SearchSelect.js';

afterEach(cleanup);
const options = Array.from({ length: 8 }, (_, i) => ({ value: `C${i}`, label: `Camp ${i} Bongaon` })).concat([{ value: 'X1', label: 'Garamur School' }]);
const mount = (selected?: string) =>
  render(<SearchSelect what="camps" emptyLabel="None" options={options} selected={selected} selectProps={{ 'data-testid': 'pick', defaultValue: selected ?? '' }} />);

describe('SearchSelect', () => {
  it('narrows the options as you type and reports the match count', () => {
    mount();
    fireEvent.change(screen.getByTestId('pick-search'), { target: { value: 'garamur' } });
    const values = [...(screen.getByTestId('pick') as HTMLSelectElement).options].map((o) => o.value);
    expect(values).toEqual(['', 'X1']);
    expect(screen.getByTestId('pick-count').textContent).toBe('1 of 9 camps match.');
  });
  it('matches on the id too, and says so when nothing matches', () => {
    mount();
    fireEvent.change(screen.getByTestId('pick-search'), { target: { value: 'c3' } });
    expect([...(screen.getByTestId('pick') as HTMLSelectElement).options].map((o) => o.value)).toEqual(['', 'C3']);
    fireEvent.change(screen.getByTestId('pick-search'), { target: { value: 'zzz' } });
    expect(screen.getByTestId('pick-count').textContent).toContain('No camps match');
  });
  it('keeps the selected option even when the search excludes it', () => {
    mount('C1');
    fireEvent.change(screen.getByTestId('pick-search'), { target: { value: 'garamur' } });
    expect([...(screen.getByTestId('pick') as HTMLSelectElement).options].map((o) => o.value)).toEqual(['', 'C1', 'X1']);
  });
  it('has no search box for a short list', () => {
    render(<SearchSelect what="camps" options={options.slice(0, 3)} selectProps={{ 'data-testid': 'few' }} />);
    expect(screen.queryByTestId('few-search')).toBeNull();
  });
});
