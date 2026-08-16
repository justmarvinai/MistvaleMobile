import { defineConfig } from 'vitest/config';

/**
 * Root Vitest config — runs unit tests across every workspace package.
 * Server integration tests that need PostgreSQL read DATABASE_URL_TEST and
 * skip themselves when it is absent (see apps/server/src/test/db.ts).
 */
export default defineConfig({
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
