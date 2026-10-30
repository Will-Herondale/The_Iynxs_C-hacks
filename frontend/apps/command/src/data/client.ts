import type { ApiClient } from '@setu/contract';
import { createApiClient } from '@setu/api-client';

/** The only place the backend adapter is chosen: real HTTP API (VITE_API_URL, default http://localhost:8080). */
export function createAppClient(): ApiClient {
  const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8080';
  return createApiClient({ mode: 'http', baseUrl });
}
