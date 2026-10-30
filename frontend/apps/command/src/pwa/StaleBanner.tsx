import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PROJECTIONS_KEY } from '../data';
import { formatRelative, staleLevel } from './staleness';

/**
 * Stale-data banner for the Command header. Reads the projections query's last successful
 * update time (observer is disabled: it never fetches, only watches).
 */
export function StaleBanner({ updatedAt, now: nowProp }: { updatedAt?: number; now?: number }) {
  const q = useQuery({ queryKey: PROJECTIONS_KEY, enabled: false });
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const at = updatedAt ?? (q.dataUpdatedAt || undefined);
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
