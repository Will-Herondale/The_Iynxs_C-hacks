import type { ApiClient } from '@setu/contract';
import { createHttpApiClient } from './http.js';

export * from '@setu/contract';
export { createHttpApiClient };

export type ApiMode = 'mock' | 'http';

export interface CreateApiClientOptions {
  mode: ApiMode;
  /** Required for mode 'mock'. Use createApiClientWithMock from @setu/mock-backend. */
  mockAdapter?: ApiClient;
  /** For mode 'http' (stub until contract sign-off). */
  baseUrl?: string;
  /** For mode 'http': reports server event records skipped for failing contract validation. */
  onSkippedRecords?: (info: { skipped: number; total: number; firstIssue?: string }) => void;
}

export function createApiClient(opts: CreateApiClientOptions): ApiClient {
  if (opts.mode === 'http') return createHttpApiClient({ baseUrl: opts.baseUrl, ...(opts.onSkippedRecords ? { onSkippedRecords: opts.onSkippedRecords } : {}) });
  if (opts.mode === 'mock') {
    if (!opts.mockAdapter) {
      throw new Error("createApiClient({mode:'mock'}) needs a mockAdapter; use createApiClientWithMock from @setu/mock-backend");
    }
    return opts.mockAdapter;
  }
  throw new Error(`Unknown API mode: ${String((opts as { mode: unknown }).mode)}`);
}

/** Parse VITE_API_MODE-style values; anything unrecognised falls back to 'mock'. */
export function resolveApiMode(value: unknown): ApiMode {
  return value === 'http' ? 'http' : 'mock';
}
