import type { ReactNode } from 'react';

/*
 * Local stand-ins for @setu/ui `Explanation` and `DeadlineBadge` (Team Scenario).
 * Same prop signatures; once they are merged, replace this file's exports with
 * `export { Explanation, DeadlineBadge } from '@setu/ui'`.
 */

export function Explanation({ title, summary, items }: { title: string; summary: string; items?: ReactNode[] }) {
  return (
    <section role="note" aria-label={title} style={{ border: '2px solid #c0392b', borderRadius: 6, padding: '6px 10px', margin: '6px 0' }}>
      <strong>{title}</strong>
      <p style={{ margin: '4px 0' }}>{summary}</p>
      {items && items.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18 }}>{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
      )}
    </section>
  );
}

/** Human "time left" text for an ISO deadline. */
export function timeLeft(deadline: string, now: Date = new Date()): string {
  const ms = Date.parse(deadline) - now.getTime();
  if (Number.isNaN(ms)) return 'unknown';
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const txt = h > 0 ? `${h} h ${m} min` : `${m} min`;
  return ms < 0 ? `overdue by ${txt}` : `${txt} left`;
}

export function DeadlineBadge({ deadline, now }: { deadline: string; now?: Date }) {
  const overdue = Date.parse(deadline) < (now ?? new Date()).getTime();
  return (
    <span data-deadline={deadline} style={{ fontWeight: 700, color: overdue ? '#c0392b' : 'inherit' }}>
      <span aria-hidden="true">{overdue ? '⛔' : '⏱'}</span> {timeLeft(deadline, now)}
    </span>
  );
}
