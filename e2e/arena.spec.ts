import { expect, test, type Page } from '@playwright/test';

/**
 * The Arena, in a real browser.
 *
 * The ladder's arithmetic, matchmaking, settlement and the bot ladder are covered
 * exhaustively against a real database (83 cases across `rating`, `arena` and `bots`).
 * What a browser adds is the part no API test reaches: that the *client* and the server
 * agree about who may walk out onto the sand, and that they agree word for word.
 *
 * A fresh warden is level 1 and the Arena opens at 8, so what a new account sees is the
 * shrouded station rather than the hub. That is the design (GAME_DESIGN §12), and reaching
 * level 8 legitimately is dozens of clears — too long for a smoke test, and not worth a
 * test-only endpoint, which is exactly the "temporary hack" the brief rules out. The hub
 * itself gets its browser pass in P9 with the rest of the first-hour experience.
 */

const password = 'a-good-long-password';

function unique(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

test.describe('the Arena', () => {
  test('is a shrouded promise to a warden who has not earned it', async ({ page }) => {
    test.slow();
    await register(page, 'e2ea', 'Hopeful');

    // Visible, named, and out of reach — ambition a player can see is the point.
    const station = page.getByRole('button', { name: /arena/i }).first();
    await expect(station).toBeVisible({ timeout: 15_000 });
    await expect(station).toHaveAttribute('aria-disabled', 'true');
    await expect(station).toHaveAttribute('title', /level 8/i);
  });

  test('refuses the hub for the same reason the dock gives', async ({ page }) => {
    test.slow();
    await register(page, 'e2aw', 'Turned');

    const refusal = await page.evaluate(async () => {
      const response = await fetch('/api/arena', { credentials: 'include' });
      const body = (await response.json()) as { error?: { code: string; message: string } };
      return { status: response.status, code: body.error?.code, message: body.error?.message };
    });

    // The greyed-out station and the refused request are the same door, word for word.
    expect(refusal.status).toBe(403);
    expect(refusal.code).toBe('LOCKED_CONTENT');
    expect(refusal.message).toBe('The Arena opens at account level 8.');
  });

  test('gates the Hall of Valor with the Arena that pays for it', async ({ page }) => {
    test.slow();
    await register(page, 'e2ah', 'Unvalored');

    const refusal = await page.evaluate(async () => {
      const response = await fetch('/api/hall-of-valor', { credentials: 'include' });
      return response.status;
    });
    expect(refusal).toBe(403);
  });

  test('turns an anonymous caller away from every endpoint', async ({ page }) => {
    await page.goto('/');

    const statuses = await page.evaluate(async () => {
      const paths = ['/api/arena', '/api/arena/leaderboard', '/api/hall-of-valor'];
      return Promise.all(
        paths.map(async (path) => (await fetch(path, { credentials: 'omit' })).status),
      );
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

  const starterDialog = page.getByRole('dialog', { name: /choose your first champion/i });
  await expect(starterDialog).toBeVisible({ timeout: 20_000 });
  // Two steps on purpose: picking a pedestal is not the same act as committing to it.
  await starterDialog
    .getByRole('button', { name: /^choose /i })
    .first()
    .click();
  await starterDialog.getByRole('button', { name: /stand together/i }).click();
  await expect(starterDialog).toBeHidden({ timeout: 20_000 });
}
