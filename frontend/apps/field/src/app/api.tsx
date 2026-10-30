import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { ApiClient } from '@setu/contract';
import { createApiClient } from '@setu/api-client';
import { createApiClientWithMock } from '@setu/mock-backend';

/** The only backend access point for the app. Mode comes from VITE_API_MODE (default mock). */
export function createAppApi(): ApiClient {
  return import.meta.env.VITE_API_MODE === 'http' ? createApiClient({ mode: 'http' }) : createApiClientWithMock();
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
