export const BACKOFF_BASE_MS = 2000;
export const BACKOFF_CAP_MS = 5 * 60 * 1000;

/**
 * Delay before the next attempt after `attempts` failures (>= 1):
 * 2s * 2^(attempts-1), +-20% jitter, capped at 5 min. `rand` in [0,1).
 */
export function backoffMs(attempts: number, rand: number = Math.random()): number {
  const n = Math.max(0, attempts - 1);
  const base = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** n);
  return Math.min(BACKOFF_CAP_MS, Math.round(base * (0.8 + 0.4 * rand)));
}
