import type { ApiClient } from '@setu/contract';
import { ApiProvider } from '../data';
import { SelectionProvider } from './selection';
import { ViewProvider } from './view';
import { SituationSummary } from './SituationSummary';
import { Header } from './Header';
import { Workspace } from './slots';
import { ChangesProvider } from './changes';
import { ApiStatus } from './ApiStatus';

export function App({ client }: { client?: ApiClient } = {}) {
  return (
    <ApiProvider {...(client ? { client } : {})}>
      <SelectionProvider>
        <ViewProvider>
          <ChangesProvider>
            <div className="cmd-root">
              <Header />
              <ApiStatus />
              <SituationSummary />
              <Workspace />
            </div>
          </ChangesProvider>
        </ViewProvider>
      </SelectionProvider>
    </ApiProvider>
  );
}
