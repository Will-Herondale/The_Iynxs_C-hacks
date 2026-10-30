import { useMemo, useState } from 'react';
import { Panel, EmptyState, SyncStatusBadge } from '@setu/ui';
import type { EventRecord, FieldEventType } from '@setu/contract';
import { useSelection, type Selection } from '../app';
import { formatDateTime } from '../app/time';
import { useEvents, useProjections } from '../data';
import { EVENT_META } from '../feed/status';
import { useSnapshotHistory } from '../feed/history';
import { AUDIT_STATUS_LABEL, buildAuditRows, type AuditFilter, type AuditRow } from './model';
import type { FeedStatus } from '../feed/status';
import { EventDrawer } from '../sections/events/EventDrawer';
import { useWindow } from '../sections/events/useWindow';

export interface AuditViewProps {
  /** Called after a feature link is clicked; the app switches to the Map view. */
  onShowFeature?: (sel: Selection) => void;
}

const TYPES = Object.keys(EVENT_META) as FieldEventType[];
const STATUSES = Object.keys(AUDIT_STATUS_LABEL) as FeedStatus[];
const ROW_H = 44;
const cell = {
  padding: '0 8px',
  textAlign: 'left',
  height: ROW_H,
  boxSizing: 'border-box',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 220,
  borderBottom: '1px solid rgba(128,128,128,0.3)',
} as const;

/** datetime-local value (interpreted as IST) -> ISO. */
function istToIso(v: string): string | undefined {
  return v ? `${v}:00+05:30` : undefined;
}

export function AuditView({ onShowFeature }: AuditViewProps) {
  const { events, error } = useEvents();
  const { snapshot } = useProjections();
  useSnapshotHistory(snapshot);
  const { select } = useSelection();
  const [filter, setFilter] = useState<AuditFilter>({});
  const [openId, setOpenId] = useState<string>();

  const rows = useMemo(() => buildAuditRows(events, snapshot, filter), [events, snapshot, filter]);
  const win = useWindow(rows.length, ROW_H);
  const opened = openId ? rows.find((r) => r.rec.eventId === openId) : undefined;

  const patch = (key: keyof AuditFilter, value: string | undefined) => {
    const next: AuditFilter = { ...filter };
    if (value) (next as Record<string, string>)[key] = value;
    else delete next[key];
    setFilter(next);
  };

  const open = (sel: Selection) => {
    select(sel);
    onShowFeature?.(sel);
  };

  return (
    <div data-testid="audit-view">
      <Panel title="Audit: every report received">
        <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <label>
            Type{' '}
            <select data-testid="audit-filter-type" value={filter.type ?? ''} onChange={(e) => patch('type', e.target.value)}>
              <option value="">All types</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>{EVENT_META[t].label}</option>
              ))}
            </select>
          </label>
          <label>
            Status{' '}
            <select data-testid="audit-filter-status" value={filter.status ?? ''} onChange={(e) => patch('status', e.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{AUDIT_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </label>
          <label>
            Location{' '}
            <input
              data-testid="audit-filter-location"
              type="search"
              placeholder="settlement or feature id"
              value={filter.location ?? ''}
              onChange={(e) => patch('location', e.target.value)}
            />
          </label>
          <label>
            From (IST){' '}
            <input data-testid="audit-filter-from" type="datetime-local" onChange={(e) => patch('from', istToIso(e.target.value))} />
          </label>
          <label>
            To (IST){' '}
            <input data-testid="audit-filter-to" type="datetime-local" onChange={(e) => patch('to', istToIso(e.target.value))} />
          </label>
          <span data-testid="audit-count" aria-live="polite">{rows.length} of {events.length} events</span>
        </div>
        {error && <p role="alert">Could not refresh events; showing last known.</p>}
        {rows.length === 0 ? (
          <EmptyState title={events.length === 0 ? 'No reports received yet' : 'No events match these filters'} />
        ) : (
          <div data-testid="audit-scroll" onScroll={win.onScroll} style={{ maxHeight: 480, overflowY: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9em', tableLayout: 'fixed' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'Canvas' }}>
                <tr>
                  {['Event ID', 'Type', 'Origin (reporter / device)', 'Observed', 'Received', 'Processing status', 'Affected entities'].map((h) => (
                    <th key={h} scope="col" style={cell}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {win.padTop > 0 && <tr aria-hidden="true" style={{ height: win.padTop }}><td colSpan={7} /></tr>}
                {rows.slice(win.start, win.end).map((row) => (
                  <AuditRowView key={row.rec.eventId} row={row} selected={row.rec.eventId === openId} onOpen={setOpenId} onFeature={open} />
                ))}
                {win.padBottom > 0 && <tr aria-hidden="true" style={{ height: win.padBottom }}><td colSpan={7} /></tr>}
              </tbody>
            </table>
          </div>
        )}
        {opened && (
          <EventDrawer
            rec={opened.rec}
            status={opened.status}
            snapshot={snapshot}
            onClose={() => setOpenId(undefined)}
            onShowFeature={onShowFeature}
          />
        )}
      </Panel>
    </div>
  );
}

function AuditRowView({
  row,
  selected,
  onOpen,
  onFeature,
}: {
  row: AuditRow;
  selected: boolean;
  onOpen: (id: string) => void;
  onFeature: (sel: Selection) => void;
}) {
  const { rec, status, affected } = row;
  const e: EventRecord['event'] = rec.event;
  return (
    <tr
      data-testid="audit-row"
      data-event-id={rec.eventId}
      data-client-event-id={e.clientEventId}
      data-status={status}
      data-type={e.type}
      aria-selected={selected}
      style={selected ? { background: 'rgba(128,128,128,0.15)' } : undefined}
    >
      <td style={{ ...cell, fontFamily: 'monospace', fontSize: '0.85em' }}>
        <button type="button" data-testid={`audit-open-${rec.eventId}`} onClick={() => onOpen(rec.eventId)}>
          {rec.eventId}
        </button>
      </td>
      <td style={cell}>
        <span aria-hidden="true">{EVENT_META[e.type].icon}</span> {EVENT_META[e.type].label}
      </td>
      <td style={cell} title={`${e.reporterId} / ${e.deviceId}`}>{e.reporterId} / {e.deviceId}</td>
      <td style={cell}><time dateTime={e.occurredAt}>{formatDateTime(e.occurredAt)}</time></td>
      <td style={cell}><time dateTime={rec.receivedAt}>{formatDateTime(rec.receivedAt)}</time></td>
      <td style={cell}><SyncStatusBadge status={status} /></td>
      <td style={cell}>
        {affected.length === 0 ? (
          <span style={{ opacity: 0.7 }}>none</span>
        ) : (
          affected.map((f) => (
            <button
              key={`${f.kind}-${f.id}`}
              type="button"
              data-testid={`audit-feature-${f.kind}-${f.id}`}
              onClick={() => onFeature(f)}
              style={{ marginRight: 6 }}
            >
              {f.kind} {f.id}
            </button>
          ))
        )}
      </td>
    </tr>
  );
}
