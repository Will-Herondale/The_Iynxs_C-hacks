import { SkippedEventsNotice } from '../../data/skipped';
import { memo, useMemo, useState } from 'react';
import { Panel, EmptyState, SyncStatusBadge } from '@setu/ui';
import type { ProjectionSnapshot } from '@setu/contract';
import { useSelection, type Selection } from '../../app';
import { formatClock } from '../../app/time';
import { useEvents, useProjections } from '../../data';
import { EVENT_META, eventSummary } from '../../feed/status';
import { useSnapshotHistory } from '../../feed/history';
import { buildAuditRows, delayLabel, type AuditRow } from '../../audit/model';
import { EventDrawer } from './EventDrawer';
import { useWindow } from './useWindow';

const ROW_H = 64;

export interface EventsSectionProps {
  onShowFeature?: (sel: Selection) => void;
}

const FeedRow = memo(function FeedRow({
  row,
  selected,
  onOpen,
}: {
  row: AuditRow;
  selected: boolean;
  onOpen: (id: string) => void;
}) {
  const { rec, status } = row;
  const meta = EVENT_META[rec.event.type];
  return (
    <li
      data-testid="feed-item"
      data-event-id={rec.eventId}
      data-client-event-id={rec.event.clientEventId}
      data-status={status}
      data-type={rec.event.type}
      style={{ height: ROW_H, boxSizing: 'border-box', padding: '6px 0', borderBottom: '1px solid rgba(128,128,128,0.3)', overflow: 'hidden', background: selected ? 'rgba(128,128,128,0.15)' : undefined }}
    >
      <button
        type="button"
        data-testid={`feed-open-${rec.eventId}`}
        onClick={() => onOpen(rec.eventId)}
        style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}
      >
        <div>
          <span aria-hidden="true">{meta.icon}</span> <strong>{meta.label}</strong>: {eventSummary(rec)}{' '}
          <SyncStatusBadge status={status} />
        </div>
        <div style={{ fontSize: '0.85em', opacity: 0.8 }}>
          {rec.event.location.lat.toFixed(4)}, {rec.event.location.lng.toFixed(4)} · observed{' '}
          <time dateTime={rec.event.occurredAt}>{formatClock(rec.event.occurredAt)}</time> · received{' '}
          <time dateTime={rec.receivedAt}>{formatClock(rec.receivedAt)}</time> · {delayLabel(rec)}
        </div>
      </button>
    </li>
  );
});

/** Reports & Events: chronological, windowed feed; click an event for payload and resulting changes. */
export function EventsSection({ onShowFeature }: EventsSectionProps) {
  const { events, error } = useEvents();
  const { snapshot } = useProjections();
  useSnapshotHistory(snapshot);
  return <EventsFeed events={events} snapshot={snapshot} error={error} onShowFeature={onShowFeature} />;
}

export function EventsFeed({
  events,
  snapshot,
  error,
  onShowFeature,
}: {
  events: Parameters<typeof buildAuditRows>[0];
  snapshot: ProjectionSnapshot | undefined;
  error?: Error | null;
  onShowFeature?: ((sel: Selection) => void) | undefined;
}) {
  useSelection();
  const rows = useMemo(() => buildAuditRows(events, snapshot), [events, snapshot]);
  const [openId, setOpenId] = useState<string>();
  const win = useWindow(rows.length, ROW_H);
  const opened = openId ? rows.find((r) => r.rec.eventId === openId) : undefined;

  return (
    <div data-testid="events-section">
      <Panel title="Reports & events">
        <SkippedEventsNotice />
        {error && <p role="alert">Could not refresh events; showing last known.</p>}
        {rows.length === 0 ? (
          <EmptyState title="No reports received yet" />
        ) : (
          <>
            <p data-testid="events-count" aria-live="polite">{rows.length} events, newest first</p>
            <div data-testid="events-scroll" onScroll={win.onScroll} style={{ maxHeight: 480, overflowY: 'auto' }}>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, paddingTop: win.padTop, paddingBottom: win.padBottom }}>
                {rows.slice(win.start, win.end).map((row) => (
                  <FeedRow key={row.rec.eventId} row={row} selected={row.rec.eventId === openId} onOpen={setOpenId} />
                ))}
              </ul>
            </div>
          </>
        )}
        {opened && (
          <EventDrawer rec={opened.rec} status={opened.status} snapshot={snapshot} onClose={() => setOpenId(undefined)} onShowFeature={onShowFeature} />
        )}
      </Panel>
    </div>
  );
}
