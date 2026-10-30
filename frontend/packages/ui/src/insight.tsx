import type { ReactNode } from 'react';

/** Hex colours matching the --setu-* map tokens (command theme), for MapLibre paint. */
export const SETU_MAP_COLORS = {
  flooded: '#4da3ff',
  blocked: '#ff5a52',
  safe: '#4cd964',
  uncertain: '#f2b84b',
  warning: '#f2a63b',
  review: '#d2a8ff',
} as const;

export interface ExplanationProps {
  title: string;
  summary: string;
  items?: string[];
  children?: ReactNode;
  'data-testid'?: string;
}

/** Plain-language "why" callout (cut-off, refused route). */
export function Explanation({ title, summary, items, children, 'data-testid': testId }: ExplanationProps) {
  return (
    <aside className="setu-explain" role="note" data-testid={testId}>
      <h4 className="setu-explain__title">{title}</h4>
      <p className="setu-explain__summary">{summary}</p>
      {items && items.length > 0 && (
        <ul className="setu-explain__items">
          {items.map((i) => <li key={i}>{i}</li>)}
        </ul>
      )}
      {children}
    </aside>
  );
}

const HOUR = 3_600_000;

export function formatTimeRemaining(ms: number): string {
  const total = Math.floor(Math.abs(ms) / 60_000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export interface DeadlineBadgeProps {
  /** ISO timestamp */
  deadline: string;
  /** injectable clock (ms epoch or Date) */
  now?: number | Date;
  'data-testid'?: string;
}

/** Time remaining until an evacuation deadline; red under 1h, OVERDUE when past. */
export function DeadlineBadge({ deadline, now = Date.now(), 'data-testid': testId }: DeadlineBadgeProps) {
  const diff = Date.parse(deadline) - (typeof now === 'number' ? now : now.getTime());
  const overdue = diff <= 0;
  const urgent = !overdue && diff < HOUR;
  const state = overdue ? 'overdue' : urgent ? 'urgent' : 'ok';
  return (
    <span className={`setu-deadline setu-deadline--${state}`} data-deadline={deadline} data-state={state} data-testid={testId}>
      <span aria-hidden="true">{overdue ? '⛔' : '⏱'}</span>
      <span>{overdue ? 'OVERDUE' : `${formatTimeRemaining(diff)} left`}</span>
    </span>
  );
}

const LEGEND = [
  { key: 'flooded', label: 'Flooded', cls: 'setu-legend__swatch--flooded' },
  { key: 'blocked', label: 'Blocked', cls: 'setu-legend__swatch--blocked' },
  { key: 'safe', label: 'Safe', cls: 'setu-legend__swatch--safe' },
  { key: 'uncertain', label: 'Uncertain', cls: 'setu-uncertain-hatch' },
] as const;

/** Map legend: flooded / blocked / safe / uncertain (colour + text). */
export function PassabilityLegend() {
  return (
    <ul className="setu-legend" aria-label="Map legend">
      {LEGEND.map((l) => (
        <li key={l.key} className="setu-legend__item" data-legend={l.key}>
          <span className={`setu-legend__swatch ${l.cls}`} aria-hidden="true" />
          {l.label}
        </li>
      ))}
    </ul>
  );
}
