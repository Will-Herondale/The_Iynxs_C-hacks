import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@setu/ui/tokens.css';
import '@setu/ui/components.css';
import './app/app.css';
import { registerSW } from 'virtual:pwa-register';
import { ApiProvider, createAppApi } from './app/api.js';
import { App } from './app/App.js';
import { startSyncEngine } from './sync/index.js';

const api = createAppApi();
startSyncEngine(api);
if (import.meta.env.PROD) registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApiProvider api={api}>
      <App />
    </ApiProvider>
  </StrictMode>,
);
