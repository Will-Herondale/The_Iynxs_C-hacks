import { useState } from 'react';
import type { SelectHTMLAttributes } from 'react';

export interface SearchOption { value: string; label: string }

/**
 * A normal <select> with a search box above it (shown once the list is long enough to need one).
 * The select keeps its own props, test ids and form registration; the search only narrows the options,
 * and the currently selected option is always kept so a search never changes the value.
 */
export function SearchSelect({ options, emptyLabel, selected, what, selectProps, minOptionsForSearch = 6 }: {
  options: SearchOption[];
  /** Label of the empty option (e.g. "Unknown", "Not in a camp"). Omit for no empty option. */
  emptyLabel?: string;
  selected?: string;
  /** What is being searched, e.g. "camps": used in the placeholder and the accessible name. */
  what: string;
  selectProps: SelectHTMLAttributes<HTMLSelectElement> & { 'data-testid'?: string };
  minOptionsForSearch?: number;
}) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? options.filter((o) => o.value === selected || o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle))
    : options;
  const matches = needle ? shown.filter((o) => o.value !== selected || o.label.toLowerCase().includes(needle)).length : options.length;
  const testId = selectProps['data-testid'];
  return (
    <>
      {options.length >= minOptionsForSearch && (
        <input
          type="search"
          className="setu-field__control search-select__input"
          placeholder={`Search ${what}…`}
          aria-label={`Search ${what}`}
          data-testid={testId ? `${testId}-search` : undefined}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}
      <select {...selectProps}>
        {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
        {shown.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {needle && (
        <p className="search-select__count" role="status" data-testid={testId ? `${testId}-count` : undefined}>
          {matches === 0 ? `No ${what} match “${q.trim()}”.` : `${matches} of ${options.length} ${what} match.`}
        </p>
      )}
    </>
  );
}
