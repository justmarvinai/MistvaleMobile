import { expect, test, type Page } from '@playwright/test';
import { goToScreen, leaveTutorial, openCampaignStage, pickTeam } from './support';

/**
 * A fight the player walked out of, and came back to.
 *
 * This is the worst bug the game has had since the empty battlefield, and the only one that
 * needed an operator to undo. Which screen you are on is a value in a store rather than a
 * URL, so a reload always lands on the Haven; `BattleScreen` is what asks the server to
 * resume a fight, and after a reload it never mounts, so nothing ever asked. The session
 * stayed `active` forever, and every attempt to start anything afterwards answered "You are
 * already in a battle" — about a fight the player could not reach, finish or retreat from.
 * The account was unplayable until somebody reset it by hand.
 *
 * Driven the way it actually happens: start a real fight, reload the tab, and expect to be
 * standing in it. Nothing here mocks anything.
 */

const password = 'a-good-long-password';

const unique = (prefix: string): string =>
  `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** A fresh warden with a starter, standing in a fight on 1-1. */
async function intoAFight(page: Page, account: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('tab', { name: 'New warden' }).click();
  await page.getByLabel('Account name').fill(unique(account));
  await page.getByLabel('Profile name').fill(unique('Warden'));
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Take up the lantern' }).click();

  await leaveTutorial(page);

  const starter = page.getByRole('dialog', { name: /choose your first champion/i });
  await expect(starter).toBeVisible({ timeout: 20_000 });
  await starter
    .getByRole('button', { name: /^choose /i })
    .first()
    .click();
  await starter.getByRole('button', { name: /stand together/i }).click();
  await expect(starter).toBeHidden({ timeout: 15_000 });

  await goToScreen(page, 'Campaign');
  await openCampaignStage(page, '1-1');
  const teamDialog = page.getByRole('dialog', { name: /stage 1/i });
  await pickTeam(teamDialog);
  await teamDialog.getByRole('button', { name: /into the mist/i }).click();
  await expect(page.getByRole('button', { name: /^auto$/i })).toBeVisible({ timeout: 20_000 });
}

test.describe('a fight the browser left', () => {
  test('is still there after a reload, and can be finished', async ({ page }) => {
    test.slow();
    await intoAFight(page, 'e2rec');

    await page.reload();

    // Back in the fight rather than on the Haven: the shell asks for an open battle on
    // sign-in now, and takes the player to it.
    await expect(page.getByRole('button', { name: /^auto$/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /^retreat$/i })).toBeVisible();

    // And it is a real fight, not a husk: retreating ends it and hands the player back.
    await page.getByRole('button', { name: /^retreat$/i }).click();
    const results = page.getByRole('dialog', { name: /victory|defeat|withdrawn/i });
    await expect(results).toBeVisible({ timeout: 30_000 });
  });

  test('never leaves the account unable to start another one', async ({ page }) => {
    test.slow();
    // The symptom the owner reported. Even with the resume above, a client that has somehow
    // lost track of an open fight must not be able to reach a dead end: the next thing the
    // player presses puts them back in the battle instead of refusing them.
    await intoAFight(page, 'e2rec2');

    // Wipe every trace of the fight from the browser, which is the harshest version of
    // closing the tab: a fresh page with no memory, against a server that still holds it.
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        // A browser that refuses storage is a browser this test does not need.
      }
    });
    await page.reload();

    // Whether the shell resumed it or the start below recovered it, the player ends up in a
    // fight and never in front of "You are already in a battle" with nowhere to go.
    await expect(page.getByRole('button', { name: /^auto$/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/already in a battle/i)).toHaveCount(0);

    await page.getByRole('button', { name: /^retreat$/i }).click();
    await expect(page.getByRole('dialog', { name: /victory|defeat|withdrawn/i })).toBeVisible({
      timeout: 30_000,
    });

    // And with the fight closed, a new one opens normally — the account is playable again.
    // "Back to the campaign" has to land on the campaign, which is not free after a reload:
    // there is no history to walk back through, so the resumed fight is entered *from* the
    // room its mode belongs to rather than from wherever the reload happened to land.
    await page.getByRole('button', { name: /back to the campaign/i }).click();
    // The campaign opens on the vale — twelve chapter markers — and the chapter is a page
    // behind one of them, so what proves the screen arrived is the chapter's *name* on the
    // map rather than a heading that only the chapter page has.
    await expect(page.getByRole('main')).toContainText(/veilwood fringe/i, {
      timeout: 15_000,
    });
    await openCampaignStage(page, '1-1');
    const teamDialog = page.getByRole('dialog', { name: /stage 1/i });
    await pickTeam(teamDialog);
    await teamDialog.getByRole('button', { name: /into the mist/i }).click();
    await expect(page.getByRole('button', { name: /^auto$/i })).toBeVisible({ timeout: 25_000 });
  });
});
