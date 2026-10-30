import type { ApiClient } from '@setu/contract';
import { ApiProvider } from '../data';
import { SelectionProvider } from './selection';
import { LayerProvider } from './layers';
import { ViewProvider } from './view';
import { SituationSummary } from './SituationSummary';
import { Header } from './Header';
import { Workspace } from './slots';
import { ChangesProvider } from './changes';

export function App({ client }: { client?: ApiClient } = {}) {
  return (
    <ApiProvider {...(client ? { client } : {})}>
      <SelectionProvider>
        <ViewProvider>
          <LayerProvider>
            <ChangesProvider>
              <div className="cmd-root">
                <Header />
                <SituationSummary />
                <Workspace />
              </div>
            </ChangesProvider>
          </LayerProvider>
        </ViewProvider>
      </SelectionProvider>
    </ApiProvider>
  );
}
