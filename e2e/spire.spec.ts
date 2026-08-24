import { expect, test } from '@playwright/test';
import { chooseStarter, registerRaw } from './support';

/**
 * The Mistspire, in a real browser.
 *
 * The climb itself — floor order, keys spent on a clear, the monthly anchor, the landings —
 * is pinned in `spire.test.ts` against a real database, where a climb can be put on floor
 * nine without fighting eight floors first. None of that is reachable from one browser
 * session on a level-one account, and a spec that tried would be a slow way to test the
 * server twice.
 *
 * What only a browser can answer is the part that is *about* the browser: the tower is
 * named where a player would look for it, it says the level that opens it rather than going
 * quiet, and the ward — the whole mechanic — reads as a sentence rather than a key.
 */

test.describe('the mistspire', () => {
  test('is named in the dock, with the level that opens it', async ({ page }) => {
    await registerRaw(page, 'e2espire', 'Climber');
    await chooseStarter(page);

    const entry = page.getByRole('navigation').getByRole('button', { name: /the mistspire/i });
    await expect(entry).toBeVisible({ timeout: 15_000 });
    await expect(entry).toBeDisabled();
  });

  test('says what it is for on an account that cannot climb yet', async ({ page }) => {
    await registerRaw(page, 'e2espire2', 'Novice');
    await chooseStarter(page);

    await page
      .getByRole('button', { name: /^haven$/i })
      .first()
      .click();
    const board = page.getByRole('button', { name: /the mistspire/i }).first();
    await expect(board).toBeVisible({ timeout: 15_000 });
    // The board says what the tower *asks for* — a broad roster — rather than only its
    // name, because "Mistspire" tells a new player nothing about why they would go.
    await expect(page.getByText(/warded/i).first()).toBeVisible();
    await expect(page.getByText(/level 16/i).first()).toBeVisible();
  });
});
