import { expect, test, type Page } from '@playwright/test';

/**
 * Timed events, in a real browser.
 *
 * The schedule arithmetic and the ladder are covered against a real database (26 cases
 * across `schedule.test.ts` and `events.test.ts`). What a browser adds is the part no API
 * test reaches: that the client and the server agree about who may see what is running,
 * and that the framework answers at all — which, for a system with no scheduler, is the
 * thing most likely to be quietly broken.
 */

const password = 'a-good-long-password';

function unique(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

test.describe('events', () => {
  test('is a shrouded promise until the account has grown into it', async ({ page }) => {
    test.slow();
    await register(page, 'e2ev', 'Unfeted');

    const station = page.getByRole('button', { name: /events/i }).first();
    await expect(station).toBeVisible({ timeout: 15_000 });
    await expect(station).toHaveAttribute('aria-disabled', 'true');
    await expect(station).toHaveAttribute('title', /level 7/i);
  });

  test('answers with the server’s own day, and no ladder a level-1 account can see', async ({
    page,
  }) => {
    test.slow();
    await register(page, 'e2eb', 'Early');

    const view = await page.evaluate(async () => {
      const response = await fetch('/api/events', { credentials: 'include' });
      const body = (await response.json()) as {
        data?: { events: { today: string; claimable: number; events: unknown[] } };
      };
      return { status: response.status, events: body.data?.events };
    });

    expect(view.status).toBe(200);
    expect(view.events?.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Every seeded event that a level-1 account could reach still scores nothing yet, so
    // there is nothing waiting and the dock stays quiet.
    expect(view.events?.claimable).toBe(0);
  });

  test('refuses a milestone nobody has scored for', async ({ page }) => {
    test.slow();
    await register(page, 'e2em', 'Greedy');

    const refusal = await page.evaluate(async () => {
      const response = await fetch('/api/events/event_champion_training/claim', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ milestone: 0, actionId: 'e2e-unearned-0001' }),
      });
      const body = (await response.json()) as { error?: { code: string } };
      return { status: response.status, code: body.error?.code };
    });

    // Either the ladder refuses it (running, unscored) or the window does (not running).
    // Both are correct refusals; what must never happen is a payout.
    expect([400, 403]).toContain(refusal.status);
    expect(['VALIDATION', 'LOCKED_CONTENT']).toContain(refusal.code);
  });

  test('turns an anonymous caller away from every endpoint', async ({ page }) => {
    await page.goto('/');

    const statuses = await page.evaluate(async () => {
      const list = await fetch('/api/events', { credentials: 'omit' });
      const claim = await fetch('/api/events/event_champion_training/claim', {
        method: 'POST',
        credentials: 'omit',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ milestone: 0, actionId: 'e2e-anon-0001' }),
      });
      return [list.status, claim.status];
    });
    expect(statuses).toEqual([401, 401]);
  });
});

/** Registers a fresh warden and takes the first starter on offer. */
async function register(page: Page, account: string, profile: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('tab', { name: 'New warden' }).click();
  await page.getByLabel('Account name').fill(unique(account));
  await page.getByLabel('Profile name').fill(unique(profile));
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Take up the lantern' }).click();

  // Out of the tutorial, and deliberately: the script opens on a borrowed fight and only
  // reaches the starter choice three steps later, which is right for a player and wrong
  // for a suite about something else. `tutorial.spec.ts` is where the script is walked.
  await leaveTutorial(page);

  const starterDialog = page.getByRole('dialog', { name: /choose your first champion/i });
  await expect(starterDialog).toBeVisible({ timeout: 20_000 });
  await starterDialog
    .getByRole('button', { name: /^choose /i })
    .first()
    .click();
  await starterDialog.getByRole('button', { name: /stand together/i }).click();
  await expect(starterDialog).toBeHidden({ timeout: 20_000 });
}

/**
 * Skips the tutorial and reloads, so the account starts where these tests expect it.
 *
 * A skip is final and server-side, so the reload comes back with no overlay and no
 * scripted navigation — the Haven, an empty roster, and the starter choice waiting.
 */
async function leaveTutorial(page: Page): Promise<void> {
  await page.waitForFunction(
    async () => {
      const response = await fetch('/api/tutorial/skip', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        credentials: 'include',
      });
      return response.ok;
    },
    undefined,
    { timeout: 20_000 },
  );
  await page.reload();
}
