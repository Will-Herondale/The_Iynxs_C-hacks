import { createContext, useContext, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ApiClient } from '@setu/contract';
import { createAppClient } from './client';

const ApiContext = createContext<ApiClient | null>(null);

export function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
}

export function ApiProvider({ client, queryClient, children }: { client?: ApiClient; queryClient?: QueryClient; children: ReactNode }) {
  const [api] = useState(() => client ?? createAppClient());
  const [qc] = useState(() => queryClient ?? makeQueryClient());
  return (
    <ApiContext.Provider value={api}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </ApiContext.Provider>
  );
}

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>');
  return api;
}
