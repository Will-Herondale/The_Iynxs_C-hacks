/** Operational data older than this shows an amber warning. */
export const STALE_AMBER_MS = 15 * 60 * 1000;
/** Operational data older than this shows a red warning. */
export const STALE_RED_MS = 60 * 60 * 1000;

export type StaleLevel = 'fresh' | 'amber' | 'red';

export function staleLevel(ageMs: number): StaleLevel {
  if (ageMs > STALE_RED_MS) return 'red';
  if (ageMs > STALE_AMBER_MS) return 'amber';
  return 'fresh';
}

/** "just now", "5 min ago", "2 h 5 min ago", "3 d ago". */
export function formatRelative(ageMs: number): string {
  const min = Math.floor(Math.max(0, ageMs) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min ago` : `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

export function formatIst(ms: number): string {
  return `${new Date(ms).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })} IST`;
}
