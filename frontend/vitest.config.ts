import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const src = (p: string) => fileURLToPath(new URL(`./packages/${p}/src/index.ts`, import.meta.url));

// Tests resolve workspace packages from source so they do not depend on a prior build.
export default defineConfig({
  resolve: {
    alias: {
      '@setu/contract': src('contract'),
      '@setu/api-client': src('api-client'),
      '@setu/mock-backend': src('mock-backend'),
      '@setu/ui': src('ui'),
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.{ts,tsx}', 'packages/*/test/**/*.test.{ts,tsx}', 'apps/*/src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
