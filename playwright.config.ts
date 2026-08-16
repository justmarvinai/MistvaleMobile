import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end smoke tests.
 *
 * These drive the real client against the real server and database — the same path a
 * player takes. Run with `pnpm e2e` (requires PostgreSQL and a built or dev client).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // One core in production; keep runs deterministic.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : [['list']],
  // Generous: each flow performs several argon2 hashes, which are deliberately slow.
  timeout: 90_000,

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // The pre-installed browser; never download one at test time.
        launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? undefined },
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
