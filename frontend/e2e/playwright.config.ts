import { defineConfig, devices } from '@playwright/test';

const FRONTEND_DIR = new URL('..', import.meta.url).pathname;
const reuse = !process.env.CI;

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // The mock relay (5199) is shared mutable state, so tests run serially.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Headless Chromium has no GPS; without this lat/lng stay empty and the report form refuses to submit.
    permissions: ['geolocation'],
    geolocation: { latitude: 26.1445, longitude: 91.7362 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, grepInvert: /@pwa/ },
    // The service worker only registers in production builds, so @pwa tests run against `vite preview`.
    { name: 'pwa', use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4173' }, grep: /@pwa/ },
  ],
  webServer: [
    { command: 'npm run build -w @setu/field && npx vite preview --port 4173 --strictPort', cwd: FRONTEND_DIR + 'apps/field', url: 'http://localhost:4173', reuseExistingServer: reuse, timeout: 180_000 },
    { command: 'npm run dev -w @setu/field', cwd: FRONTEND_DIR, url: 'http://localhost:5173', reuseExistingServer: reuse, timeout: 120_000 },
    { command: 'npm run dev -w @setu/command', cwd: FRONTEND_DIR, url: 'http://localhost:5174', reuseExistingServer: reuse, timeout: 120_000 },
  ],
});
