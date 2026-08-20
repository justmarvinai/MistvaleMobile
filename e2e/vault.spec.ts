import { expect, test } from '@playwright/test';
import { registerRaw } from './support';

/**
 * The relic vault has a ceiling now (Q5, answered 2026-08-18).
 *
 * A cap is what makes selling and dismantling matter: without one nothing is ever sold,
 * the Bazaar's sink never opens, and the read that lists the vault grows for the life of
 * the account. Bought up in slabs with silver, to a maximum, all three numbers content.
 *
 * What this proves in a browser is the part a unit test cannot: that a player is *told*
 * how full it is, and offered the way out in the same panel.
 */

test.describe('the vault', () => {
  test('says how full it is and what more room costs', async ({ page }) => {
    test.slow();
    await registerRaw(page, 'e2evault', 'Hoarder');

    const starter = page.getByRole('dialog', { name: /choose your first champion/i });
    await expect(starter).toBeVisible({ timeout: 20_000 });
    await starter
      .getByRole('button', { name: /^choose /i })
      .first()
      .click();
    await starter.getByRole('button', { name: /stand together/i }).click();
    await expect(starter).toBeHidden({ timeout: 15_000 });

    await page
      .getByRole('button', { name: /^relics$/i })
      .first()
      .click();

    // The count is loose relics over the cap, not everything owned — equipped relics live
    // on a champion, which is what makes equipping a way to make room. The meter says so in
    // its own label. Scoped to the capacity group — the meter and the two controls that
    // move it — because "In the vault" is also the name of the list's default filter.
    const panel = page.getByRole('group', { name: /vault capacity/i });
    await expect(panel.getByText('0 / 250')).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByText(/loose relics/i)).toBeVisible();

    // …and the way to more of it, priced, in the same group as the number it fixes.
    await expect(page.getByRole('button', { name: /buy 50 slots — 25,000 silver/i })).toBeVisible();
  });

  test('refuses a purchase an empty purse cannot make, in words', async ({ page }) => {
    await registerRaw(page, 'e2evault2', 'Broke');
    const starter = page.getByRole('dialog', { name: /choose your first champion/i });
    await expect(starter).toBeVisible({ timeout: 20_000 });
    await starter
      .getByRole('button', { name: /^choose /i })
      .first()
      .click();
    await starter.getByRole('button', { name: /stand together/i }).click();
    await expect(starter).toBeHidden({ timeout: 15_000 });

    await page
      .getByRole('button', { name: /^relics$/i })
      .first()
      .click();
    const buy = page.getByRole('button', { name: /buy 50 slots/i });
    await expect(buy).toBeVisible({ timeout: 15_000 });
    await buy.click();

    // A new account has nothing; the refusal is the server's sentence, on the screen that
    // asked, rather than a button that silently does nothing.
    await expect(page.getByText(/not enough silver/i)).toBeVisible({ timeout: 15_000 });
  });
});
