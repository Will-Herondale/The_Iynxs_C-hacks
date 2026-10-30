import type { ApiClient } from '@setu/contract';
import { createApiClient } from '@setu/api-client';
import { createApiClientWithMock } from '@setu/mock-backend';

/** The only place the backend adapter is chosen. Mode: VITE_API_MODE (default mock). */
export function createAppClient(): ApiClient {
  return import.meta.env.VITE_API_MODE === 'http' ? createApiClient({ mode: 'http' }) : createApiClientWithMock();
}
