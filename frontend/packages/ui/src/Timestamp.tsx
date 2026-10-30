export interface TimestampProps {
  iso: string;
  /** Show relative time ("5 min ago") alongside the absolute IST time. */
  relative?: boolean;
  /** Reference "now" for relative output (defaults to Date.now()). */
  now?: number;
}

const IST_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatIST(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Invalid time';
  return `${IST_FORMAT.format(d)} IST`;
}

export function formatRelative(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.round((now - t) / 1000);
  const abs = Math.abs(diff);
  const unit =
    abs < 60 ? `${abs}s` : abs < 3600 ? `${Math.floor(abs / 60)} min` : abs < 86400 ? `${Math.floor(abs / 3600)} h` : `${Math.floor(abs / 86400)} d`;
  if (abs < 5) return 'just now';
  return diff >= 0 ? `${unit} ago` : `in ${unit}`;
}

/** Absolute IST time in monospace; optionally with relative time. */
export function Timestamp({ iso, relative, now }: TimestampProps) {
  return (
    <time dateTime={iso} className="setu-mono setu-timestamp" title={iso}>
      {formatIST(iso)}
      {relative ? ` (${formatRelative(iso, now)})` : ''}
    </time>
  );
}
