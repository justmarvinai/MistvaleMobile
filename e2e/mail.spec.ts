import { expect, test, type Page } from '@playwright/test';
import { leaveTutorial } from './support';

/**
 * Mail and news, in a real browser.
 *
 * The claim rules and the composer are pinned against a real database (22 cases in
 * `mail.test.ts`). What a browser adds is the part no API test reaches: that the top bar
 * actually leads somewhere, that an empty inbox says so rather than rendering nothing, and
 * that the news post a fresh account is meant to read is the one it gets.
 */

const password = 'a-good-long-password';

function unique(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

test.describe('mail and news', () => {
  test('opens an empty satchel from the top bar and says so plainly', async ({ page }) => {
    test.slow();
    await register(page, 'e2eml', 'Postless');

    await page.getByRole('button', { name: 'Mail' }).click();
    await expect(page.getByText(/nothing has arrived/i)).toBeVisible({ timeout: 15_000 });
    // Nothing waiting, so nothing shouting about it either.
    await expect(page.getByText(/collect all/i)).toHaveCount(0);
  });

  test('shows the welcome post to somebody who has just arrived', async ({ page }) => {
    test.slow();
    await register(page, 'e2enw', 'Newsy');

    await page.getByRole('button', { name: 'News' }).click();
    const dialog = page.getByRole('dialog', { name: /news/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(/welcome to the vale/i)).toBeVisible();
    await expect(dialog.getByText(/pinned/i)).toBeVisible();
    // Markdown-lite renders as text: the asterisks never reach the player.
    await expect(dialog.getByText(/\*\*/)).toHaveCount(0);
  });

  test('refuses a claim on somebody else’s message', async ({ page }) => {
    test.slow();
    await register(page, 'e2emg', 'Grabby');

    const refusal = await page.evaluate(async () => {
      const response = await fetch('/api/mail/00000000-0000-4000-8000-000000000000/claim', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actionId: 'e2e-mail-theft-0001' }),
      });
      const body = (await response.json()) as { error?: { code: string } };
      return { status: response.status, code: body.error?.code };
    });

    expect(refusal.status).toBe(404);
    expect(refusal.code).toBe('NOT_FOUND');
  });

  test('turns an anonymous caller away from the inbox', async ({ page }) => {
    await page.goto('/');

    // Only `/api` is probed here. The composer lives under `/admin/api`, which the game
    // client's dev server does not proxy — nginx joins the two origins in production, so a
    // browser assertion about it would pass only where it is never run. The rank gate on
    // the composer is pinned server-side instead (`mail.test.ts`).
    const statuses = await page.evaluate(async () => {
      const inbox = await fetch('/api/mail', { credentials: 'omit' });
      const claimAll = await fetch('/api/mail/claim-all', {
        method: 'POST',
        credentials: 'omit',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actionId: 'e2e-anon-mail-0001' }),
      });
      const news = await fetch('/api/news', { credentials: 'omit' });
      return [inbox.status, claimAll.status, news.status];
    });
    expect(statuses).toEqual([401, 401, 401]);
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
