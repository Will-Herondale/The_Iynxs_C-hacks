import { defineConfig, devices } from '@playwright/test';

const FRONTEND_DIR = new URL('..', import.meta.url).pathname;
const reuse = !process.env.CI;
export const FAKE_API = 'http://localhost:8099';
const env = { VITE_API_URL: FAKE_API, VITE_API_MODE: 'http' };

// The fake contract server runs in-process (fixtures/index.ts, worker fixture) so tests can reset/tune it.
// It is one shared in-memory store, so everything runs serially in a single worker.
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    permissions: ['geolocation'],
    geolocation: { latitude: 26.1445, longitude: 91.7362 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, grepInvert: /@pwa/ },
    // The service worker only registers in production builds: @pwa tests run against `vite preview`.
    { name: 'pwa', use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4173' }, grep: /@pwa/ },
  ],
  webServer: [
    { command: 'npm run dev -w @setu/field', cwd: FRONTEND_DIR, env, url: 'http://localhost:5173', reuseExistingServer: reuse, timeout: 120_000 },
    { command: 'npm run dev -w @setu/command', cwd: FRONTEND_DIR, env, url: 'http://localhost:5174', reuseExistingServer: reuse, timeout: 120_000 },
    {
      command: 'npx vite build --outDir dist/pwa-e2e && npx vite preview --outDir dist/pwa-e2e --port 4173 --strictPort',
      cwd: FRONTEND_DIR + 'apps/field',
      env,
      url: 'http://localhost:4173',
      reuseExistingServer: reuse,
      timeout: 240_000,
    },
  ],
});
