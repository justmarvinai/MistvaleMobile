import { expect, test, type Page } from '@playwright/test';
import {
  chooseStarter,
  dismissUnlocks,
  openCampaignStage,
  pickTeam,
  registerRaw,
  resolveBattle,
} from './support';

/**
 * What a player is allowed to skip watching.
 *
 * Two rules, both the owner's (2026-08-22) and both gated on progress the server owns:
 * a fight can only be jumped to its end on a stage already beaten, and the playback speed
 * climbs past ×2 only for finishing the campaign. Neither touches an outcome — the engine
 * resolves the same fight either way — which is exactly why they are worth a browser test
 * rather than a server one: the whole of both features is what the screen offers.
 */

async function enterStageOne(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /^campaign$/i })
    .first()
    .click();
  await openCampaignStage(page);
  const dialog = page.getByRole('dialog', { name: /stage 1/i });
  await pickTeam(dialog);
  await dialog.getByRole('button', { name: /into the mist/i }).click();
  await expect(page.getByRole('button', { name: /^auto$/i })).toBeVisible({ timeout: 30_000 });
}

/** Auto is a standing preference since B2, so a blind click can turn it *off*. */
async function engageAuto(page: Page): Promise<void> {
  const auto = page.getByRole('button', { name: /^auto$/i });
  if ((await auto.getAttribute('aria-pressed')) !== 'true') await auto.click();
}

test.describe('what a player may skip watching', () => {
  test('Skip arrives with the second visit to a stage, not the first', async ({ page }) => {
    test.slow();
    test.setTimeout(240_000);
    await registerRaw(page, 'e2eplay', 'Playback');
    await chooseStarter(page);

    // ── The speed ladder a fresh account has earned ─────────────────────
    //
    // Every rung is *drawn*, including the two this account has not earned — that is the
    // whole reason the ladder exists, since the library's cycling button could only ever
    // show a rung you already had. So the assertion is about what is shown as well as what
    // can be pressed.
    await enterStageOne(page);
    const rungs = page.getByRole('group', { name: /battle speed/i }).getByRole('button');
    await expect(rungs).toHaveText(['×1', '×2', '×4']);
    await expect(rungs.nth(0)).toBeEnabled();
    await expect(rungs.nth(1)).toBeEnabled();
    await expect(rungs.nth(2)).toBeDisabled();

    // And a locked rung says what earns it, rather than only refusing.
    await expect(rungs.nth(2)).toHaveAccessibleName(/not yet earned/i);

    // ── First visit: no Skip ────────────────────────────────────────────
    await engageAuto(page);
    await page.waitForTimeout(2000);
    await expect(page.getByRole('button', { name: /^skip$/i })).toBeHidden();

    await resolveBattle(page);
    // A defeat records no clear, so the rest of this test would be testing nothing.
    const won = await page
      .getByRole('dialog', { name: /victory/i })
      .isVisible()
      .catch(() => false);
    await page.getByRole('button', { name: /back to the campaign/i }).click();
    await dismissUnlocks(page);
    test.skip(!won, 'the starter lost 1-1; there is no clear to unlock Skip with');

    // ── Second visit: Skip is offered ───────────────────────────────────
    await enterStageOne(page);
    await engageAuto(page);
    await expect(page.getByRole('button', { name: /^skip$/i })).toBeVisible({ timeout: 20_000 });
  });
});
