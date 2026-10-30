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
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'npm run dev -w @setu/field', cwd: FRONTEND_DIR, url: 'http://localhost:5173', reuseExistingServer: reuse, timeout: 120_000 },
    { command: 'npm run dev -w @setu/command', cwd: FRONTEND_DIR, url: 'http://localhost:5174', reuseExistingServer: reuse, timeout: 120_000 },
  ],
});
