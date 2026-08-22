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
    // The library's control is one button that cycles, and `cycleSpeed` steps over a
    // locked rung — so what a player can reach is exactly what pressing it reaches.
    await enterStageOne(page);
    const speed = page.getByRole('button', { name: /battle speed/i });
    const reachable = new Set<string>();
    for (let press = 0; press < 6; press += 1) {
      reachable.add((await speed.innerText()).trim());
      await speed.click();
      await page.waitForTimeout(120);
    }
    expect([...reachable].sort()).toEqual(['×1', '×2']);

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
