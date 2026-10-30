import { describe, expect, it } from 'vitest';
import { NotImplementedError, type ApiClient } from '@setu/contract';
import { createApiClient, resolveApiMode } from './index.js';

describe('createApiClient', () => {
  it('http stub throws NotImplementedError from every method', async () => {
    const c = createApiClient({ mode: 'http' });
    for (const call of [
      () => c.submitEvents([]), () => c.getEventStatus([]), () => c.getProjections(), () => c.listEvents(),
    ]) {
      const err = await call().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(NotImplementedError);
      expect((err as Error).message).toBe('pending API contract sign-off');
    }
    expect(() => c.subscribe(() => {})).toThrow(NotImplementedError);
  });
  it('mock mode returns the injected adapter and requires one', () => {
    const adapter = {} as ApiClient;
    expect(createApiClient({ mode: 'mock', mockAdapter: adapter })).toBe(adapter);
    expect(() => createApiClient({ mode: 'mock' })).toThrow();
  });
  it('resolveApiMode defaults to mock', () => {
    expect(resolveApiMode(undefined)).toBe('mock');
    expect(resolveApiMode('http')).toBe('http');
  });
});
