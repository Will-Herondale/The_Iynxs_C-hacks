import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { setuMockRelay } from '@setu/mock-backend/relay';

export default defineConfig({
  plugins: [react(), setuMockRelay()],
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
});
