import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { setuMockRelay } from '@setu/mock-backend/relay';

export default defineConfig({
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  plugins: [
    react(),
    setuMockRelay(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'SETU Field',
        short_name: 'SETU',
        start_url: '/',
        display: 'standalone',
        theme_color: '#0b5cad',
        background_color: '#ffffff',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        navigateFallback: 'index.html',
        // dev relay snippet is injected into index.html at serve time only
      },
      devOptions: { enabled: false },
    }),
  ],
});
