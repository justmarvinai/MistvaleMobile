import { expect, test, type Page } from '@playwright/test';
import { chooseStarter, openCampaignStage, pickTeam, registerRaw } from './support';

/**
 * The decisions a fight is supposed to let a player make.
 *
 * Everything here has been in the engine's contract since P3 — `BattleAction.target`, every
 * skill's `targeting` and `cooldown`, every status's `kind` and `description` — and none of
 * it had ever reached the screen. A hotbar slot was an icon, a status was a four-pixel pip,
 * and who a skill landed on was the AI's business.
 */

/** Registers, takes a starter, and stands in a fight waiting for a command. */
async function intoAFight(page: Page, who: string): Promise<void> {
  await registerRaw(page, who, 'Tactician');
  await chooseStarter(page);
  await page
    .getByRole('button', { name: /^campaign$/i })
    .first()
    .click();
  await openCampaignStage(page, '1-1');
  const teamDialog = page.getByRole('dialog', { name: /stage 1/i });
  await pickTeam(teamDialog);
  await teamDialog.getByRole('button', { name: /into the mist/i }).click();
  await expect(page.locator('.fui-actionbar [role="button"]').first()).toBeVisible({
    timeout: 30_000,
  });
}

test.describe('a fight a player can make decisions in', () => {
  test('a skill says what it does before it is spent', async ({ page }) => {
    test.slow();
    await intoAFight(page, 'e2etip');

    await page.locator('.fui-actionbar [role="button"]').first().hover();
    const tip = page.locator('.fui-tooltip');
    await expect(tip).toBeVisible({ timeout: 10_000 });

    // The three questions a player asks before spending a turn.
    await expect(tip, 'who it lands on').toContainText(/One enemy|All enemies|Self|ally/i);
    await expect(tip, 'what it costs in turns').toContainText(/Cooldown/i);
    await expect(tip, 'and the skill own words').not.toHaveText(/^\s*$/);
  });

  test('the player picks who a skill lands on, and who auto concentrates on', async ({ page }) => {
    test.slow();
    await intoAFight(page, 'e2epick');

    // The overlay marks every unit on the field; enemies are the ones worth picking.
    const enemies = page.locator('[data-selected][data-focused] > button');
    await expect(enemies.first()).toBeVisible({ timeout: 15_000 });

    const before = await page.locator('[data-selected="true"]').count();
    expect(before, 'nothing is chosen for you').toBe(0);

    // Pick the last mark on the field — an enemy, since allies come first.
    await enemies.last().click();
    await expect(page.locator('[data-selected="true"]')).toHaveCount(1);
    await expect(
      page.locator('[data-focused="true"]'),
      'the same gesture tells auto-battle where to concentrate',
    ).toHaveCount(1);

    // Picking the same one again is how a player says "choose for me".
    await enemies.last().click();
    await expect(page.locator('[data-selected="true"]')).toHaveCount(0);
    await expect(page.locator('[data-focused="true"]')).toHaveCount(0);
  });

  test('Auto can be turned off again, and hands control back', async ({ page }) => {
    test.slow();
    await intoAFight(page, 'e2eauto');

    const auto = page.locator('.fui-battlectl__auto');
    await auto.click();
    await expect(auto).toHaveClass(/is-on/);

    // It used to resolve the whole fight in one request, so pressing it again had nothing
    // left to cancel: the button said "off" and the battle played itself out regardless.
    await auto.click();
    await expect(auto).not.toHaveClass(/is-on/);

    await expect
      .poll(
        async () => {
          if (await page.locator('.fui-actionbar [role="button"]').first().isVisible()) {
            return 'in control';
          }
          const over = page.getByRole('dialog', { name: /victory|defeat|withdrawn/i });
          return (await over.isVisible()) ? 'over' : 'playing';
        },
        { timeout: 60_000 },
      )
      // Either the fight came back to the player, or those few auto turns finished it.
      .not.toBe('playing');
  });
});
