import { expect, test, type Page } from '@playwright/test';
import { dockEntry, leaveTutorial, placeCard } from './support';

/**
 * The checklist, in a real browser.
 *
 * Claiming, chests and the first-win bonus are covered exhaustively against a real
 * database (21 cases in `quests.test.ts`). What a browser adds is the part no API test
 * reaches: that the client and the server agree about who may open the screen, and that
 * they refuse in the same words.
 *
 * A fresh warden is level 1 and the checklist opens at 4, so what a new account sees is
 * the shrouded station. Reaching level 4 legitimately is several clears — the claim flow
 * itself gets its browser pass in P9 alongside the rest of the first hour, rather than
 * through a test-only endpoint the brief rules out.
 */

const password = 'a-good-long-password';

function unique(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

test.describe('quests', () => {
  test('is a shrouded promise until the account has grown into it', async ({ page }) => {
    test.slow();
    await register(page, 'e2qs', 'Listless');

    // Two presses since C12: the dock holds hubs, and a place is a card on one.
    await dockEntry(page, 'Quests').click();
    const station = placeCard(page, 'Quests');
    await expect(station).toBeVisible({ timeout: 15_000 });
    await expect(station).toHaveAttribute('aria-disabled', 'true');
    // The hint is *read*, not hovered: a station says when it opens in visible text under
    // its name. It used to be a native `title` as well, which the painted tooltip replaced —
    // and an attribute nobody can see was always the weaker thing to assert.
    await expect(station).toContainText(/level 4/i);
  });

  test('tracks from the first battle, even before it can be claimed', async ({ page }) => {
    test.slow();
    await register(page, 'e2qt', 'Early');

    // The screen is shut at level 1, but the read is not: progress accrues from the first
    // fight so a player's first day is not thrown away by a gate they cannot see.
    const view = await page.evaluate(async () => {
      const response = await fetch('/api/quests', { credentials: 'include' });
      const body = (await response.json()) as {
        data?: { quests: { quests: unknown[]; claimable: number; today: string } };
      };
      return { status: response.status, quests: body.data?.quests };
    });

    expect(view.status).toBe(200);
    expect(view.quests?.quests.length).toBeGreaterThan(0);
    // Nothing is claimable below the gate, so the dock stays quiet rather than
    // advertising a button that would refuse.
    expect(view.quests?.claimable).toBe(0);
    expect(view.quests?.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('refuses a claim in the words the dock uses', async ({ page }) => {
    test.slow();
    await register(page, 'e2qc', 'Impatient');

    const refusal = await page.evaluate(async () => {
      const response = await fetch('/api/quests/daily_campaign_wins/claim', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actionId: 'e2e-too-early-0001' }),
      });
      const body = (await response.json()) as { error?: { code: string; message: string } };
      return { status: response.status, code: body.error?.code, message: body.error?.message };
    });

    expect(refusal.status).toBe(403);
    expect(refusal.code).toBe('LOCKED_CONTENT');
    expect(refusal.message).toBe('Quests open at account level 4.');
  });

  test('turns an anonymous caller away from every endpoint', async ({ page }) => {
    await page.goto('/');

    const statuses = await page.evaluate(async () => {
      const gets = await fetch('/api/quests', { credentials: 'omit' });
      const chest = await fetch('/api/quests/chest', {
        method: 'POST',
        credentials: 'omit',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ period: 'daily', actionId: 'e2e-anon-0001' }),
      });
      return [gets.status, chest.status];
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
