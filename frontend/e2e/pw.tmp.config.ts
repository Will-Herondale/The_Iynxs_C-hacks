import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ testDir: './tests', testMatch: /(pwa-offline|a11y|live-smoke)\.spec\.ts/, timeout: 90000, workers: 1,
  use: { baseURL: 'http://localhost:4173', permissions: ['geolocation'], geolocation: { latitude: 26.1, longitude: 91.7 } },
  projects: [{ name: 'pwa', use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4173' } }] });
