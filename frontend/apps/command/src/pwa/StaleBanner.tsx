import { useEffect, useState } from 'react';
import { formatRelative, staleLevel } from './staleness';

/**
 * Stale-data banner for the Command header. The last successful update time is passed in from useProjections().
 * It must NOT open its own useQuery on the projections key: an observer without a queryFn takes part in
 * invalidation refetches ("No queryFn was passed") and races the real observer.
 */
export function StaleBanner({ updatedAt, now: nowProp }: { updatedAt?: number; now?: number }) {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const at = updatedAt;
  if (!at) return null;
  const age = (nowProp ?? tick) - at;
  const level = staleLevel(age);
  if (level === 'fresh') return null;
  return (
    <span role="alert" data-testid="stale-warning" data-level={level} className={`cmd-stale cmd-stale--${level}`}>
      <span aria-hidden="true">{level === 'red' ? '⛔' : '⚠'}</span> Data last updated {formatRelative(age)}
      {level === 'red' ? ': do not rely on it' : ''}
    </span>
  );
}
