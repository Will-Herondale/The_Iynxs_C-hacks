import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@setu/ui/tokens.css';
import '@setu/ui/components.css';
import './app/app.css';
import { App } from './app/App';

document.documentElement.dataset.theme = 'command';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
