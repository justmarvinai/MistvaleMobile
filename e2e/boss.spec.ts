import { expect, test } from '@playwright/test';
import { chooseStarter, enterStageOneOne, registerRaw, resolveBattle } from './support';

/**
 * The battle screen, and the frame a boss puts on it.
 *
 * Two things only a browser can answer. The **layout** is the owner's reference (C26b):
 * Auto and the speed ladder at bottom-left, the acting champion's skills at bottom-right —
 * which is a claim about where two elements sit relative to each other and to the window,
 * and no unit test has a window. And the **boss frame**: a health bar across the top and a
 * rail down the right naming what the creature can do. Every ingredient of that has been in
 * the game for phases — `isBoss` since P3, an enemy's skills since P1, `bossMechanics` since
 * P6 — and none of it had ever reached the fight, which is exactly the class of gap this
 * project keeps finding by looking rather than by reasoning.
 *
 * Reaching a boss costs seven fights, because bosses stand at the end of a chapter and a
 * stage opens only when the one before it is cleared. The walk is done with the results
 * screen's own **Next** button (C26a), which is the shortest road there *and* a second run
 * over that button — a fresh account has enough energy for the chapter because clearing
 * stages levels it and a level refills the bar.
 *
 * What it deliberately does **not** assert is the rule that the plate in the middle skips
 * the boss the bar already names. Whether the boss is the first enemy still standing at the
 * moment a spec looks depends on which escorts are alive, so an assertion here would pass
 * for reasons that have nothing to do with the rule — it is pinned in `focus.test.ts`
 * instead, which is where a rule with no window in it belongs.
 */

test.describe('the battle screen', () => {
  test('puts Auto on the left hand and the skills on the right', async ({ page }) => {
    test.slow();
    await registerRaw(page, 'e2ehud', 'Framer');
    await chooseStarter(page);
    await enterStageOneOne(page);

    const auto = page.getByRole('button', { name: /^auto$/i });
    const bar = page.locator('.fui-actionbar').first();
    await expect(auto).toBeVisible();
    await expect(bar).toBeVisible({ timeout: 30_000 });

    const window = page.viewportSize();
    const autoBox = await auto.boundingBox();
    const barBox = await bar.boundingBox();
    expect(autoBox, 'Auto is on screen').not.toBeNull();
    expect(barBox, 'the hotbar is on screen').not.toBeNull();
    if (!autoBox || !barBox || !window) throw new Error('nothing to measure');

    // Left hand and right hand, both low. Measured against each other and against the
    // window rather than against a pixel, because the numbers are content — the ladder
    // grows a rung as the account earns one, and the hotbar grows with the champion.
    expect(autoBox.x + autoBox.width / 2, 'Auto sits left of centre').toBeLessThan(
      window.width / 2,
    );
    expect(barBox.x, 'the hotbar sits right of centre').toBeGreaterThan(window.width / 2);
    expect(autoBox.y, 'Auto is in the lower half').toBeGreaterThan(window.height / 2);
    expect(barBox.y, 'the hotbar is in the lower half').toBeGreaterThan(window.height / 2);
  });

  test('frames the warlord with a health bar and what it can do', async ({ page }) => {
    test.setTimeout(600_000);
    await registerRaw(page, 'e2eboss', 'Chapterer');
    await chooseStarter(page);
    await enterStageOneOne(page);

    const results = page.getByRole('dialog', { name: /victory|defeat|withdrawn/i });
    const next = results.getByRole('button', { name: /^next · \d+ energy$/i });
    const bossBar = page.locator('.fui-boss');

    // Six ordinary stages, and the negative asserted on every one of them: an ordinary wave
    // draws no boss frame at all.
    for (let stage = 1; stage <= 6; stage += 1) {
      await expect(bossBar).toHaveCount(0);
      await resolveBattle(page);
      await expect(results).toBeVisible({ timeout: 60_000 });
      await expect(next).toBeVisible({ timeout: 20_000 });
      await next.click();
      await expect(results).toBeHidden({ timeout: 60_000 });
      await expect(page.getByRole('button', { name: /^auto$/i })).toBeVisible({ timeout: 60_000 });
    }

    // The fight is run alongside the assertion rather than before it: there is no moment
    // after a battle when the boss is still on the field to look at.
    const fight = resolveBattle(page);
    await expect(bossBar).toBeVisible({ timeout: 240_000 });

    // **And not before the player can see him.** The warlord is authored in the *last* wave
    // of his stage, so a frame that appears while the pips still read wave one is the frame
    // reading the server's board — which Auto keeps two waves ahead of the animation. The
    // first cut did exactly that and drew a full boss frame over wave one already saying
    // `0 / 235`, giving away the creature and the fight at once (P10a).
    await expect(page.locator('.fui-waves')).toContainText('3 / 3');

    // Named, with a health bar under it, and a rail saying what it can do — its skills out
    // of content, hoverable, and the mechanics that had been stated in the team chooser
    // (D8) and nowhere else once the fight began.
    await expect(bossBar.locator('.fui-boss__name')).not.toBeEmpty();
    await expect(bossBar.locator('.fui-boss__fill')).toBeVisible();
    const rail = page.getByRole('complementary', { name: /^what .+ can do$/i });
    await expect(rail).toBeVisible();
    expect(await rail.getByRole('listitem').count(), 'the rail names something').toBeGreaterThan(0);

    await fight;
    await expect(results).toBeVisible({ timeout: 60_000 });
  });
});
