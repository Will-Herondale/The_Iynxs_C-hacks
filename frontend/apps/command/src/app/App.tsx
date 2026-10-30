import { AppShell } from '@setu/ui';
import type { ApiClient } from '@setu/contract';
import { ApiProvider } from '../data';
import { SelectionProvider } from './selection';
import { LayerProvider } from './layers';
import { Header } from './Header';
import { FeaturePanelSlot, FeedSlot, LeftSlot, MapSlot } from './slots';

export function App({ client }: { client?: ApiClient } = {}) {
  return (
    <ApiProvider {...(client ? { client } : {})}>
      <SelectionProvider>
        <LayerProvider>
          <div className="cmd-root">
            <AppShell
              header={<Header />}
              nav={<LeftSlot />}
              main={<MapSlot />}
              aside={
                <>
                  <FeaturePanelSlot />
                  <FeedSlot />
                </>
              }
            />
          </div>
        </LayerProvider>
      </SelectionProvider>
    </ApiProvider>
  );
}
