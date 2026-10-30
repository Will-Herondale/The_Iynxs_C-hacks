import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { setuMockRelay } from '@setu/mock-backend/relay';

export default defineConfig({
  plugins: [react(), setuMockRelay(process.env.SETU_RELAY_PORT ? { port: Number(process.env.SETU_RELAY_PORT) } : {})],
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
});
