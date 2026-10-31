// @vitest-environment jsdom
import { render, cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Mono, Timestamp, formatIST, formatRelative } from './index.js';

afterEach(cleanup);

describe('Mono', () => {
  it('renders children with the mono class', () => {
    render(<Mono data-testid="m">MJ-SH-009</Mono>);
    expect(screen.getByTestId('m').className).toContain('setu-mono');
    expect(screen.getByTestId('m').textContent).toBe('MJ-SH-009');
  });
});

describe('Timestamp', () => {
  it('formats in IST', () => {
    expect(formatIST('2026-10-30T06:30:00Z')).toBe('30 Oct, 12:00 IST');
  });
  it('formats relative time', () => {
    const now = Date.parse('2026-10-30T06:30:00Z');
    expect(formatRelative('2026-10-30T06:25:00Z', now)).toBe('5 min ago');
    expect(formatRelative('2026-10-30T08:30:00Z', now)).toBe('in 2 h');
    expect(formatRelative('2026-10-30T06:30:01Z', now)).toBe('just now');
  });
  it('renders a <time> element with optional relative text', () => {
    render(<Timestamp iso="2026-10-30T06:25:00Z" relative now={Date.parse('2026-10-30T06:30:00Z')} />);
    const el = document.querySelector('time')!;
    expect(el.getAttribute('datetime')).toBe('2026-10-30T06:25:00Z');
    expect(el.textContent).toContain('IST (5 min ago)');
  });
  it('handles invalid input', () => {
    expect(formatIST('nope')).toBe('Invalid time');
  });
});
