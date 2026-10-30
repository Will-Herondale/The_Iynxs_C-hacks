import { useMemo, useState } from 'react';
import type { ProjectionSnapshot } from '@setu/contract';
import { Badge, EmptyState, Panel } from '@setu/ui';
import { useSelection } from '../../app';
import { formatDeadline } from '../../app/time';
import { useProjections } from '../../data';
import { MonoId } from '../../panels/NotProvided';
import { ACCESS_TONE, label } from '../../panels/model';
import { accessRank, matches, priorityRank, settlementRows, type SettlementRow } from './model';

type SortKey = 'name' | 'accessibility' | 'segment' | 'deadline' | 'priority' | 'status';
interface Col { key: SortKey; header: string; sort: (r: SettlementRow) => string | number }

const COLS: Col[] = [
  { key: 'name', header: 'Settlement', sort: (r) => r.name.toLowerCase() },
  { key: 'accessibility', header: 'Accessibility', sort: (r) => accessRank(r.accessibility) },
  { key: 'segment', header: 'Critical segment', sort: (r) => r.criticalSegments.join(',') || '~' },
  { key: 'deadline', header: 'Evacuation deadline', sort: (r) => (r.deadline ? Date.parse(r.deadline) : Infinity) },
  { key: 'priority', header: 'Priority', sort: (r) => priorityRank(r.priority) },
  { key: 'status', header: 'Status', sort: (r) => r.statusLabel },
];
const NOT_IN_CONTRACT = 'not in contract (#15)';
const Dash = ({ what }: { what: string }) => <span title={NOT_IN_CONTRACT} aria-label={`${what}: ${NOT_IN_CONTRACT}`} data-testid={`na-${what}`}>—</span>;

export function SettlementsSectionView({ snapshot, now = Date.now() }: { snapshot?: ProjectionSnapshot; now?: number }) {
  const { selected, select } = useSelection();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'accessibility', dir: 1 });
  const rows = useMemo(() => (snapshot ? settlementRows(snapshot) : []), [snapshot]);
  const view = useMemo(() => {
    const col = COLS.find((c) => c.key === sort.key)!;
    return rows.filter((r) => matches(r, q)).sort((a, b) => {
      const x = col.sort(a), y = col.sort(b);
      return (x < y ? -1 : x > y ? 1 : a.id.localeCompare(b.id, undefined, { numeric: true })) * (x === y ? 1 : sort.dir);
    });
  }, [rows, q, sort]);

  if (!snapshot) return <div data-testid="settlements-section"><Panel title="Settlements"><EmptyState title="Loading…" /></Panel></div>;

  return (
    <div data-testid="settlements-section">
      <Panel title="Settlements">
        <div style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'center' }}>
          <label>Search{' '}
            <input type="search" className="setu-table__search" aria-label="Search settlements" data-testid="settlements-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="name, id, segment…" />
          </label>
          <span data-testid="settlements-count" aria-live="polite">{view.length} of {rows.length}</span>
        </div>
        {view.length === 0 ? (
          <EmptyState title="No settlements match" />
        ) : (
          <div className="setu-table"><div className="setu-table__scroll">
            <table data-testid="settlements-table" className="cmd-settlements">
              <thead>
                <tr>
                  {COLS.map((c) => (
                    <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" className="setu-table__sort" data-testid={`settlements-sort-${c.key}`} onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === 1 ? -1 : 1 }))}>
                        {c.header}{sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                      </button>
                    </th>
                  ))}
                  <th scope="col">Shelter · travel · latest departure</th>
                </tr>
              </thead>
              <tbody>
                {view.map((r) => {
                  const isSel = selected?.kind === 'settlement' && selected.id === r.id;
                  return (
                    <tr key={r.id} data-testid={`settlement-row-${r.id}`} data-accessibility={r.accessibility} data-status={r.status} aria-selected={isSel}
                      onClick={() => select({ kind: 'settlement', id: r.id })} className={isSel ? 'cmd-row--selected' : 'cmd-row'}>
                      <td><button type="button" className="cmd-linkbtn" onClick={(e) => { e.stopPropagation(); select({ kind: 'settlement', id: r.id }); }} aria-pressed={isSel}>{r.name}</button> <MonoId>{r.id}</MonoId></td>
                      <td><Badge tone={ACCESS_TONE[r.accessibility].tone} icon={ACCESS_TONE[r.accessibility].icon}>{label(r.accessibility)}</Badge></td>
                      <td data-testid={`segment-${r.id}`}>{r.criticalSegments.length ? r.criticalSegments.map((id) => <MonoId key={id}>{id}</MonoId>).flatMap((e, i) => (i ? [', ', e] : [e])) : '—'}</td>
                      <td>{r.deadline ? <time dateTime={r.deadline}>{formatDeadline(r.deadline, now)}</time> : '—'}</td>
                      <td>{r.priority ?? '—'}</td>
                      <td>
                        {r.status === 'no-safe-route' ? <Badge tone="danger" icon="⛔">{r.statusLabel}</Badge> : r.statusLabel}
                      </td>
                      <td className="cmd-settlements__na">
                        <Dash what="nearest-shelter" /> · <Dash what="travel-time" /> · <Dash what="latest-departure" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div></div>
        )}
      </Panel>
    </div>
  );
}

export function SettlementsSection() {
  const { snapshot } = useProjections();
  return <SettlementsSectionView {...(snapshot ? { snapshot } : {})} />;
}
