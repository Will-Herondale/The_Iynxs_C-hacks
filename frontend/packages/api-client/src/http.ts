import { NotImplementedError, type ApiClient } from '@setu/contract';

const PENDING = 'pending API contract sign-off';

/** Stub: the real HTTP adapter waits for backend sign-off on the contract. */
export function createHttpApiClient(opts: { baseUrl?: string } = {}): ApiClient {
  void opts;
  const fail = (): never => {
    throw new NotImplementedError(PENDING);
  };
  return {
    submitEvents: async () => fail(),
    getEventStatus: async () => fail(),
    getProjections: async () => fail(),
    listEvents: async () => fail(),
    subscribe: () => fail(),
  };
}
