import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  /** Value used for sorting; a column without it is not sortable. */
  sortValue?: (row: T) => string | number | null | undefined;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  /** Row properties searched by the text filter (case-insensitive substring). */
  searchKeys?: (keyof T & string)[];
  onRowClick?: (row: T) => void;
  caption?: string;
  emptyMessage?: ReactNode;
  pageSize?: number;
}

type SortDir = 'asc' | 'desc';

function compare(a: string | number | null | undefined, b: string | number | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/** Sortable, searchable, keyboard-navigable table. Renders at most `pageSize` (default 100) rows at a time. */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  searchKeys,
  onRowClick,
  caption,
  emptyMessage = 'No rows to show.',
  pageSize = 100,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);
  const [page, setPage] = useState(0);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows;
    if (q && searchKeys?.length) {
      out = out.filter((r) => searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(q)));
    }
    const col = sort && columns.find((c) => c.key === sort.key);
    if (sort && col?.sortValue) {
      const sv = col.sortValue;
      const sign = sort.dir === 'asc' ? 1 : -1;
      out = [...out].sort((a, b) => sign * compare(sv(a), sv(b)));
    }
    return out;
  }, [rows, query, searchKeys, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const shown = visible.slice(current * pageSize, (current + 1) * pageSize);

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null));

  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    const tr = e.currentTarget;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      (tr.nextElementSibling as HTMLElement | null)?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      (tr.previousElementSibling as HTMLElement | null)?.focus();
    } else if ((e.key === 'Enter' || e.key === ' ') && onRowClick) {
      e.preventDefault();
      onRowClick(row);
    }
  };

  return (
    <div className="setu-table">
      {searchKeys?.length ? (
        <input
          type="search"
          className="setu-table__search"
          aria-label="Search table"
          placeholder="Search…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
      ) : null}
      <div className="setu-table__scroll">
        <table>
          {caption ? <caption className="setu-visually-hidden">{caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key ? sort.dir : null;
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (active === 'asc' ? 'ascending' : 'descending') : c.sortValue ? 'none' : undefined}>
                    {c.sortValue ? (
                      <button type="button" className="setu-table__sort" onClick={() => toggleSort(c.key)}>
                        {c.header}
                        <span aria-hidden="true">{active === 'asc' ? ' ▲' : active === 'desc' ? ' ▼' : ' ↕'}</span>
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr
                key={getRowId(row)}
                data-row-id={getRowId(row)}
                tabIndex={0}
                className={onRowClick ? 'setu-table__row--clickable' : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={(e) => onRowKey(e, row)}
              >
                {columns.map((c) => (
                  <td key={c.key}>{c.render ? c.render(row) : (String((row as Record<string, unknown>)[c.key] ?? ''))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visible.length === 0 ? (
        <p className="setu-table__empty" role="status">
          {emptyMessage}
        </p>
      ) : null}
      {pageCount > 1 ? (
        <nav className="setu-table__pager" aria-label="Table pages">
          <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>
            Previous
          </button>
          <span>
            Page {current + 1} of {pageCount} ({visible.length} rows)
          </span>
          <button type="button" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}
