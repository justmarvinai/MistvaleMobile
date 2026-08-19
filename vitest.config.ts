import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Root Vitest config — runs unit tests across every workspace package.
 * Server integration tests that need PostgreSQL read DATABASE_URL_TEST and
 * skip themselves when it is absent (see apps/server/src/test/db.ts).
 */
export default defineConfig({
  resolve: {
    alias: {
      // The client's own alias, mirrored here. Vitest reads this file rather than the
      // client's Vite config, so without it a test that imports `@/fui/...` — the way
      // every client *source* file does since the design rework — fails to resolve while
      // the same import builds fine.
      '@': fileURLToPath(new URL('./apps/client/src', import.meta.url)),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['{apps,packages,tools}/*/src/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    pool: 'forks',
    poolOptions: {
      // The production box is 1 core; keep local/CI runs predictable.
      forks: { singleFork: true },
    },
  },
});
