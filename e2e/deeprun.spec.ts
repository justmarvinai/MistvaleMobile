import { expect, test } from '@playwright/test';
import { chooseStarter, dockEntry, placeCard, registerRaw } from './support';

/**
 * The Deep Run, in a real browser.
 *
 * The machine — the doors, the boons, the carried damage, the wipe, the depth payout — is
 * pinned in `deeprun.test.ts` against a real database, where a run's state can be moved to
 * floor nine without fighting eight rooms first. None of that is reachable from one browser
 * session on a level-one account.
 *
 * What only a browser can answer is whether the mode reads before it opens: the Stair takes
 * wardens of level 20, and nothing a new account can do in a session comes near it.
 */

test.describe('the deep run', () => {
  test('is named in the dock, with the level that opens it', async ({ page }) => {
    await registerRaw(page, 'e2estair', 'Delver');
    await chooseStarter(page);

    // Two presses now: the dock holds hubs, and the place is a card on one (C12).
    await dockEntry(page, 'The Sunken Stair').click();
    const entry = placeCard(page, 'The Sunken Stair');
    await expect(entry).toBeVisible({ timeout: 15_000 });
    await expect(entry).toHaveAttribute('aria-disabled', 'true');
  });

  test('says what it is for on an account that cannot go down yet', async ({ page }) => {
    await registerRaw(page, 'e2estair2', 'Novice');
    await chooseStarter(page);

    await page
      .getByRole('button', { name: /^haven$/i })
      .first()
      .click();
    const board = page.getByRole('button', { name: /the sunken stair/i }).first();
    await expect(board).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/level 20/i).first()).toBeVisible();
  });
});
