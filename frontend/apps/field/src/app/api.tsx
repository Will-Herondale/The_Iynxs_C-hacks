import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { ApiClient } from '@setu/contract';
import { createApiClient } from '@setu/api-client';

/** Backend address from the environment (never hard-coded; the tunnel URL is temporary). */
export const API_BASE_URL: string = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8080';

/** The only backend access point for the app: always the real HTTP API (VITE_API_URL, default http://localhost:8080). */
export function createAppApi(): ApiClient {
  const baseUrl = API_BASE_URL;
  return createApiClient({ mode: 'http', baseUrl });
}

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ api, children }: { api: ApiClient; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi outside ApiProvider');
  return api;
}
