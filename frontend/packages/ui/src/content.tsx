import type { ReactNode } from 'react';
import type { ClientSyncStatus } from '@setu/contract';
import { Timestamp } from './Timestamp.js';
import { StatusBadge, SYNC_STATUS_META, OFFLINE_QUEUED_META } from './StatusBadge.js';

/* ---------- time (IST) ---------- */

function TimeText({ iso, label }: { iso: string; label: string }) {
  return (
    <span className="setu-meta">
      <span className="setu-meta__k">{label}</span> <Timestamp iso={iso} />
    </span>
  );
}

/* ---------- SyntheticTag ---------- */

export function SyntheticTag({ note = 'Synthetic scenario data. Not a real observation or a validated simulation.' }: { note?: string }) {
  return (
    <span className="setu-synthetic" title={note} data-testid="synthetic-tag">
      <span aria-hidden="true">◇</span>
      <span>SYNTHETIC</span>
      <span className="setu-sr-only"> — {note}</span>
    </span>
  );
}

/* ---------- SeverityLabel ---------- */

export type SeverityLevel = 1 | 2 | 3 | 4 | 5 | 'critical' | 'high' | 'normal';
type Tone = 'critical' | 'high' | 'normal';

function severityView(level: SeverityLevel): { tone: Tone; text: string; icon: string } {
  if (typeof level === 'number') {
    const tone: Tone = level >= 4 ? 'critical' : level === 3 ? 'high' : 'normal';
    return { tone, text: `Severity ${level} of 5`, icon: tone === 'critical' ? '▲▲' : tone === 'high' ? '▲' : '●' };
  }
  return {
    tone: level,
    text: level === 'critical' ? 'Critical' : level === 'high' ? 'High' : 'Normal',
    icon: level === 'critical' ? '▲▲' : level === 'high' ? '▲' : '●',
  };
}

export function SeverityLabel({ level }: { level: SeverityLevel }) {
  const v = severityView(level);
  return (
    <span className={`setu-severity setu-severity--${v.tone}`} data-level={String(level)}>
      <span aria-hidden="true">{v.icon}</span>
      <span>{v.text}</span>
    </span>
  );
}

/* ---------- EventCard ---------- */

export interface EventCardProps {
  title: ReactNode;
  where: ReactNode;
  observedAt: string;
  receivedAt?: string;
  status?: ClientSyncStatus;
  onClick?: () => void;
  'data-testid'?: string;
}

export function EventCard({ title, where, observedAt, receivedAt, status, onClick, 'data-testid': testId }: EventCardProps) {
  const body = (
    <>
      <span className="setu-event__head">
        <span className="setu-event__title">{title}</span>
        {status && <StatusBadge status={status} />}
      </span>
      <span className="setu-event__where">{where}</span>
      <span className="setu-event__times">
        <TimeText iso={observedAt} label="Observed" />
        {receivedAt && <TimeText iso={receivedAt} label="Received" />}
      </span>
    </>
  );
  // A button wraps the card body only when clickable, so the status badge stays valid content.
  return onClick ? (
    <article className="setu-event setu-event--clickable" data-testid={testId}>
      <button type="button" className="setu-event__button" onClick={onClick}>{body}</button>
    </article>
  ) : (
    <article className="setu-event" data-testid={testId}>{body}</article>
  );
}

/* ---------- ObservationCard ---------- */

export type ObservationKind = 'observed' | 'modelled' | 'synthetic';

const OBS_META: Record<ObservationKind, { label: string; icon: string; note: string }> = {
  observed: { label: 'Observed', icon: '◉', note: 'Reported by a person or sensor' },
  modelled: { label: 'Modelled', icon: '≈', note: 'Computed by the server model; not an observation' },
  synthetic: { label: 'Synthetic', icon: '◇', note: 'Synthetic scenario data' },
};

export interface ObservationCardProps {
  kind: ObservationKind;
  title: ReactNode;
  /** Source or method, e.g. "Volunteer report" or "DEM-threshold estimate". */
  source?: ReactNode;
  at?: string;
  children?: ReactNode;
  'data-testid'?: string;
}

export function ObservationCard({ kind, title, source, at, children, 'data-testid': testId }: ObservationCardProps) {
  const m = OBS_META[kind];
  return (
    <section className={`setu-obs setu-obs--${kind}`} data-kind={kind} data-testid={testId}>
      <header className="setu-obs__head">
        <span className="setu-obs__kind" title={m.note}>
          <span aria-hidden="true">{m.icon}</span> {m.label}
        </span>
        {kind === 'synthetic' && <SyntheticTag />}
      </header>
      <h3 className="setu-obs__title">{title}</h3>
      {children && <div className="setu-obs__body">{children}</div>}
      {(source || at) && (
        <footer className="setu-obs__foot">
          {source && <span className="setu-meta"><span className="setu-meta__k">Source</span> {source}</span>}
          {at && <TimeText iso={at} label="At" />}
        </footer>
      )}
    </section>
  );
}

/* ---------- OfflineBanner ---------- */

export function OfflineBanner({ online }: { online: boolean }) {
  if (online) return null;
  return (
    <div className="setu-offline-banner" role="status" data-testid="offline-banner">
      <span aria-hidden="true">⦸</span>
      <span><strong>Offline.</strong> Changes are saved locally and will sync when the connection returns.</span>
    </div>
  );
}

/* ---------- SyncStatusSummary ---------- */

type Group = 'queued' | 'synchronising' | 'synced' | 'conflict' | 'rejected' | 'failed';

export interface SyncStatusSummaryProps {
  counts: Record<ClientSyncStatus, number>;
  lastSyncedAt?: string;
  online: boolean;
}

export function SyncStatusSummary({ counts, lastSyncedAt, online }: SyncStatusSummaryProps) {
  const queued = online ? SYNC_STATUS_META.queued : OFFLINE_QUEUED_META;
  const rows: { key: Group; label: string; icon: string; n: number }[] = [
    { key: 'queued', label: queued.label, icon: queued.icon, n: counts.queued },
    { key: 'synchronising', label: SYNC_STATUS_META.sending.label, icon: SYNC_STATUS_META.sending.icon, n: counts.sending + counts.accepted },
    { key: 'synced', label: SYNC_STATUS_META.synced.label, icon: SYNC_STATUS_META.synced.icon, n: counts.synced },
    { key: 'conflict', label: SYNC_STATUS_META.conflict.label, icon: SYNC_STATUS_META.conflict.icon, n: counts.conflict },
    { key: 'rejected', label: SYNC_STATUS_META.rejected.label, icon: SYNC_STATUS_META.rejected.icon, n: counts.rejected },
    { key: 'failed', label: SYNC_STATUS_META.failed.label, icon: SYNC_STATUS_META.failed.icon, n: counts.failed },
  ];
  const pending = Object.entries(counts).reduce((s, [k, n]) => (k === 'synced' ? s : s + n), 0);
  return (
    <section className="setu-syncsum" aria-label="Sync summary" data-testid="sync-summary" data-online={online}>
      <p className="setu-syncsum__pending">
        <strong data-testid="sync-summary-pending">{pending}</strong> not yet confirmed
      </p>
      <ul className="setu-syncsum__list">
        {rows.map((r) => (
          <li key={r.key} className={`setu-syncsum__row setu-syncsum__row--${r.key}${r.n === 0 ? ' is-zero' : ''}`}>
            <span aria-hidden="true">{r.icon}</span>
            <span className="setu-syncsum__label">{r.label}</span>
            <span className="setu-mono" data-testid={`sync-count-${r.key}`}>{r.n}</span>
          </li>
        ))}
      </ul>
      <p className="setu-syncsum__last">
        {lastSyncedAt ? <TimeText iso={lastSyncedAt} label="Last confirmed" /> : <span className="setu-meta">No confirmed sync yet</span>}
      </p>
    </section>
  );
}

/* ---------- LoadingState ---------- */

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="setu-loading" role="status" aria-busy="true" data-testid="loading-state">
      <span aria-hidden="true">…</span>
      <span>{label}</span>
    </div>
  );
}

/* ---------- ErrorState ---------- */

export type ErrorKind =
  | 'offline' | 'api-unavailable' | 'invalid' | 'sync-failed' | 'duplicate'
  | 'conflict' | 'missing-geo' | 'no-route' | 'no-shelter' | 'empty';

const ERROR_META: Record<ErrorKind, { title: string; message: string; icon: string; tone: 'warning' | 'critical' | 'review' | 'neutral' }> = {
  offline: { title: 'You are offline', message: 'Showing data saved on this device. New events are saved locally and will sync later.', icon: '⦸', tone: 'warning' },
  'api-unavailable': { title: 'Server unavailable', message: 'The SETU server could not be reached. Data shown may be out of date.', icon: '✗', tone: 'critical' },
  invalid: { title: 'Check the highlighted fields', message: 'Some values are missing or invalid.', icon: '!', tone: 'warning' },
  'sync-failed': { title: 'Sync failed', message: 'The event was not confirmed by the server. It is still saved on this device and can be retried.', icon: '!', tone: 'critical' },
  duplicate: { title: 'Duplicate event', message: 'The server already has this event. Nothing was added twice.', icon: '=', tone: 'neutral' },
  conflict: { title: 'Requires review', message: 'This conflicts with newer server data. Choose which version to keep.', icon: '⚠', tone: 'review' },
  'missing-geo': { title: 'Map data not available', message: 'Not provided by backend. This layer cannot be drawn.', icon: '∅', tone: 'neutral' },
  'no-route': { title: 'No route available', message: 'The server reports no passable route from here.', icon: '✗', tone: 'critical' },
  'no-shelter': { title: 'No shelter available', message: 'The server reports no reachable shelter with capacity.', icon: '✗', tone: 'critical' },
  empty: { title: 'Nothing to show yet', message: 'There are no items here.', icon: '–', tone: 'neutral' },
};

export const ERROR_KINDS = Object.keys(ERROR_META) as ErrorKind[];

export interface ErrorStateProps {
  kind: ErrorKind;
  detail?: ReactNode;
  action?: ReactNode;
}

export function ErrorState({ kind, detail, action }: ErrorStateProps) {
  const m = ERROR_META[kind];
  return (
    <div
      className={`setu-error setu-error--${m.tone}`}
      role={kind === 'empty' || kind === 'offline' || kind === 'duplicate' ? 'status' : 'alert'}
      data-kind={kind}
      data-testid={`error-state-${kind}`}
    >
      <span className="setu-error__icon" aria-hidden="true">{m.icon}</span>
      <div className="setu-error__text">
        <p className="setu-error__title">{m.title}</p>
        <p className="setu-error__msg">{m.message}</p>
        {detail && <p className="setu-error__detail">{detail}</p>}
        {action && <div className="setu-error__action">{action}</div>}
      </div>
    </div>
  );
}
