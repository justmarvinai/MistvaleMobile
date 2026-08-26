import { expect, test } from '@playwright/test';
import { chooseStarter, goToScreen, leaveTutorial, registerRaw } from './support';

/**
 * Saved relic sets, and acting on a filter instead of on a click per relic.
 *
 * Both features are proven against a real database in the server suite — thirteen cases
 * covering the plan, the double-apply, the sold relic, the full vault and a forge run that
 * runs out of silver. What a browser adds is the half no API test reaches: that the
 * controls are *there*, that they say what they will do before they are pressed, and that
 * a fresh account with nothing in the vault gets sentences rather than dead buttons.
 *
 * Deliberately driven on an empty vault, the same choice `vault.spec.ts` makes and for the
 * same reason: a relic drop is a 42% roll, and a test about a toolbar should not be a test
 * about luck.
 */

test.describe('the vault’s bulk actions', () => {
  test('narrows the list and offers to act on what is left', async ({ page }) => {
    test.slow();
    await registerRaw(page, 'e2ebulk', 'Sorter');
    await leaveTutorial(page);
    await chooseStarter(page);

    await goToScreen(page, 'Relics');
    await expect(page.getByRole('heading', { name: /^the vault$/i })).toBeVisible({
      timeout: 15_000,
    });

    // Rarity and set are the two axes a hundred relics are actually sorted along, and the
    // shortlist they produce is what the bulk actions act on.
    const refine = page.getByRole('group', { name: /narrow the list/i });
    await expect(refine).toBeVisible();
    await expect(refine.getByLabel(/rarity/i)).toBeVisible();
    await expect(refine.getByLabel('Set')).toBeVisible();
    await expect(refine.getByText(/unforged only/i)).toBeVisible();

    // The count is the list, and the button says the same number — so "select all" always
    // means the thing the player is looking at rather than everything they own.
    await expect(refine.getByText('0 of 0')).toBeVisible();
    await expect(refine.getByRole('button', { name: /select these 0/i })).toBeDisabled();
  });
});

test.describe('saved relic sets', () => {
  test('offers to save a build, and says what to do first when there is none', async ({ page }) => {
    test.slow();
    await registerRaw(page, 'e2esets', 'Packer');
    await leaveTutorial(page);
    await chooseStarter(page);

    await page
      .getByRole('button', { name: /^champions$/i })
      .first()
      .click();
    // A champion card's one stable accessible name is the sentence it composes about
    // itself, and "Lv n of m" is the part of it every champion has.
    const roster = page.getByRole('button', { name: /lv \d+ of \d+/i });
    await expect(roster.first()).toBeVisible({ timeout: 15_000 });
    await roster.first().click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible({ timeout: 20_000 });
    await sheet.getByRole('tab', { name: /relics/i }).click();

    const sets = sheet.getByRole('region', { name: /saved relic sets/i });
    await expect(sets).toBeVisible();
    // The empty state teaches the feature rather than reporting an absence.
    await expect(sets.getByText(/gear a champion the way you want them/i)).toBeVisible();
    // And the one action is refused for a champion wearing nothing — an empty set could
    // only ever do nothing, and finding that out later is a worse minute.
    await expect(sets.getByRole('button', { name: /save what is worn/i })).toBeDisabled();
  });
});
