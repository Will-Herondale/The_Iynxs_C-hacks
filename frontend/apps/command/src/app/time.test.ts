import { describe, expect, it } from 'vitest';
import { formatClock, formatDateTime, formatDeadline, formatRelative } from './time';

const NOW = Date.parse('2026-10-30T08:00:00Z');
describe('time', () => {
  it('formats Asia/Kolkata clock', () => {
    expect(formatClock('2026-10-30T10:58:49.550Z')).toBe('16:28 IST');
    expect(formatClock('2026-10-30T18:30:00Z')).toBe('00:00 IST');
    expect(formatDateTime('2026-10-30T10:58:49.550Z')).toBe('30 Oct, 16:28 IST');
  });
  it('formats relative', () => {
    expect(formatRelative('2026-10-30T10:47:00Z', NOW)).toBe('in 2h 47m');
    expect(formatRelative('2026-10-30T07:55:00Z', NOW)).toBe('overdue by 5m');
    expect(formatRelative('2026-10-30T08:20:00Z', NOW)).toBe('in 20m');
    expect(formatDeadline('2026-10-30T10:58:49.550Z', NOW)).toBe('16:28 IST, in 2h 58m');
  });
  it('passes through garbage', () => {
    expect(formatClock('nope')).toBe('nope');
  });
});
