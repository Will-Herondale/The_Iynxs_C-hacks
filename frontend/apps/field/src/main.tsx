import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@setu/ui/tokens.css';
import '@setu/ui/components.css';
import './app/app.css';
import { registerServiceWorker } from './pwa/index.js';
import { ApiProvider, createAppApi } from './app/api.js';
import { App } from './app/App.js';
import { requestPersistence } from './offline/storage.js';
import { startSyncEngine } from './sync/index.js';

document.documentElement.dataset.theme = 'field';
const api = createAppApi();
startSyncEngine(api);
registerServiceWorker();
void requestPersistence();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApiProvider api={api}>
      <App />
    </ApiProvider>
  </StrictMode>,
);
