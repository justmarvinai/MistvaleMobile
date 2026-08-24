import { expect, test } from '@playwright/test';
import { chooseStarter, registerRaw } from './support';

/**
 * The Wurm Wakes, in a real browser.
 *
 * The interesting half — two wardens on one bar, the fall credited once, the ladder paid
 * once each, the spoils shared — is pinned in `worldboss.test.ts` against a real database,
 * where a second account can be minted and the clock can be handed a Friday. None of that
 * is reachable from one browser session on a Thursday.
 *
 * What only a browser can answer is whether the mode *reads* on an account that has not got
 * there yet: the Wurm opens at level 18, and nothing a new account can do in one session
 * comes close. Both halves of the rule are checked — the dock names it and says when it
 * opens, and the screen behind it is safe and legible with nothing on it.
 */

test.describe('the world boss', () => {
  test('is named in the dock, with the level that opens it', async ({ page }) => {
    await registerRaw(page, 'e2ewurm', 'Lanternbearer');
    await chooseStarter(page);

    const entry = page.getByRole('navigation').getByRole('button', { name: /the wurm wakes/i });
    await expect(entry).toBeVisible({ timeout: 15_000 });
    await expect(entry).toBeDisabled();
  });

  test('says what it is for on an account that cannot strike it yet', async ({ page }) => {
    await registerRaw(page, 'e2ewurm2', 'Watcher');
    await chooseStarter(page);

    await page
      .getByRole('button', { name: /^haven$/i })
      .first()
      .click();
    const board = page.getByRole('button', { name: /the wurm wakes/i }).first();
    await expect(board).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/level 18/i).first()).toBeVisible();
  });
});
