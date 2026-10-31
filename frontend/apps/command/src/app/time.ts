/** Single time-format helper for the command centre: Asia/Kolkata, 24h "HH:MM IST", relative "in 2h 47m". */
const TZ = 'Asia/Kolkata';

const parts = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour12: false, ...opts })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;

/** "16:28 IST" */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = parts(d, { hour: '2-digit', minute: '2-digit' });
  return `${p.hour === '24' ? '00' : p.hour}:${p.minute} IST`;
}

/** "30 Oct, 16:28 IST" */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = parts(d, { day: 'numeric', month: 'short' });
  return `${p.day} ${p.month}, ${formatClock(iso)}`;
}

/** "in 2h 47m" / "overdue by 5m" / "now" */
export function formatRelative(iso: string, now: number | Date = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = t - (typeof now === 'number' ? now : now.getTime());
  const mins = Math.floor(Math.abs(diff) / 60000);
  if (mins === 0) return 'now';
  const h = Math.floor(mins / 60);
  const span = h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`;
  return diff > 0 ? `in ${span}` : `overdue by ${span}`;
}

/** "16:28 IST, in 2h 47m" */
export function formatDeadline(iso: string, now: number | Date = Date.now()): string {
  return `${formatClock(iso)}, ${formatRelative(iso, now)}`;
}
