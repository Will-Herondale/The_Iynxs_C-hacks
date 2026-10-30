import { describe, expect, it } from 'vitest';
import { parseHash } from './route.js';

describe('parseHash', () => {
  it('defaults to home', () => {
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#/nope')).toEqual({ name: 'home' });
  });
  it('parses params and legacy aliases', () => {
    expect(parseHash('#/report/abc-123')).toEqual({ name: 'report', param: 'abc-123' });
    expect(parseHash('#/households/new')).toEqual({ name: 'households', param: 'new' });
    expect(parseHash('#/queue')).toEqual({ name: 'sync' });
    expect(parseHash('#/household')).toEqual({ name: 'households' });
  });
});
