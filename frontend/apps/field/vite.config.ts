import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaOptions } from './pwa.config';
import { setuMockRelay } from '@setu/mock-backend/relay';

export default defineConfig({
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  plugins: [
    react(),
    setuMockRelay(),
    VitePWA(pwaOptions),
  ],
});
