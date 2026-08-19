import { expect, test } from '@playwright/test';
import { chooseStarter, expectOnTop, registerRaw } from './support';

/**
 * The screens a player looks at, checked for being *lookable at*.
 *
 * Everything else in this suite drives the game through roles and text, which is the right
 * way to test behaviour and is completely blind to paint. The battle screen shipped with an
 * opaque full-viewport overlay across it — every control present, every assertion green,
 * and nothing on screen but the top bar. This file exists so that cannot happen twice.
 *
 * Deliberately thin. It checks that the things a player must be able to see are the
 * topmost elements at their own centres, and nothing about how they look; pixel
 * comparisons would fail on a font hint and teach everyone to ignore them.
 */

test.describe('what a player can actually see', () => {
  test('the battle screen shows its fight and its controls', async ({ page }) => {
    test.slow();
    await registerRaw(page, 'e2evis', 'Seer');

    const starter = page.getByRole('dialog', { name: /choose your first champion/i });
    await expect(starter).toBeVisible({ timeout: 20_000 });
    await starter
      .getByRole('button', { name: /^choose /i })
      .first()
      .click();
    await starter.getByRole('button', { name: /stand together/i }).click();
    await expect(starter).toBeHidden({ timeout: 15_000 });

    await page
      .getByRole('button', { name: /^campaign$/i })
      .first()
      .click();
    await page.getByRole('button', { name: '1-1', exact: false }).first().click();
    const teamDialog = page.getByRole('dialog', { name: /stage 1/i });
    await teamDialog
      .getByRole('button', { name: /lv \d+/i })
      .first()
      .click();
    await teamDialog.getByRole('button', { name: /into the mist/i }).click();
    await expect(page.getByRole('button', { name: /^auto$/i })).toBeVisible({ timeout: 20_000 });

    // The three things that were covered: the wave readout, the controls, the skill bar.
    await expectOnTop(page, '[class*="wave"]', 'the wave/turn readout');
    await expectOnTop(page, '[class*="controls"]', 'the battle controls');
    await expectOnTop(page, '[class*="bar"]', 'the skill bar');

    // And the canvas the fight is drawn on must be the only one on the page. Two of them
    // is the bug itself: `initStage` binds to the first and the second is dead weight
    // painting over everything.
    expect(await page.locator('canvas').count(), 'exactly one Pixi canvas').toBe(1);
  });

  test('a fight hands the player a turn to take', async ({ page }) => {
    test.slow();
    // Manual play had never worked. `createBattle` builds the board and stops with
    // `awaiting` null and no turn meter moved, and the skill bar is keyed on `awaiting`
    // naming an ally — so a fresh battle had nobody to act with and the bar read
    // "Waiting for the server…" for as long as the player was willing to look at it. The
    // only ways forward were Auto and Retreat, and every test in this suite pressed one
    // of them, which is why nothing caught it in seven phases.
    await registerRaw(page, 'e2eturn', 'Actor');

    const starter = page.getByRole('dialog', { name: /choose your first champion/i });
    await expect(starter).toBeVisible({ timeout: 20_000 });
    await starter
      .getByRole('button', { name: /^choose /i })
      .first()
      .click();
    await starter.getByRole('button', { name: /stand together/i }).click();
    await expect(starter).toBeHidden({ timeout: 15_000 });

    await page
      .getByRole('button', { name: /^campaign$/i })
      .first()
      .click();
    await page.getByRole('button', { name: '1-1', exact: false }).first().click();
    const teamDialog = page.getByRole('dialog', { name: /stage 1/i });
    await teamDialog
      .getByRole('button', { name: /lv \d+/i })
      .first()
      .click();
    await teamDialog.getByRole('button', { name: /into the mist/i }).click();

    // The bar names whoever is up, with their health and their skills — and the player
    // presses one of them, rather than the two buttons that skip the game.
    await expect(page.getByText(/waiting for the server/i)).toHaveCount(0, { timeout: 25_000 });
    const skills = page.locator('[class*="skills"] button');
    await expect(skills.first()).toBeVisible({ timeout: 25_000 });
    const before = await page.getByText(/turn \d+/i).innerText();

    await skills.first().click();
    // A turn was taken: the fight moved, whether that is the counter or the fight ending.
    await expect
      .poll(
        async () => {
          const over = await page.getByText(/the fight is over/i).count();
          if (over > 0) return 'moved';
          const now = await page.getByText(/turn \d+/i).innerText();
          return now === before ? 'stuck' : 'moved';
        },
        { timeout: 25_000 },
      )
      .toBe('moved');
  });

  test('the dock and the top bar are on top of the screen they frame', async ({ page }) => {
    await registerRaw(page, 'e2evis2', 'Framed');
    const starter = page.getByRole('dialog', { name: /choose your first champion/i });
    await expect(starter).toBeVisible({ timeout: 20_000 });
    await starter
      .getByRole('button', { name: /^choose /i })
      .first()
      .click();
    await starter.getByRole('button', { name: /stand together/i }).click();
    await expect(starter).toBeHidden({ timeout: 15_000 });

    await expectOnTop(page, 'header', 'the top bar');
    await expectOnTop(page, 'nav', 'the dock');
  });

  test('every champion has a face, drawn or borrowed', async ({ page }) => {
    // 34 of 37 champions had no avatar file and rendered the browser's broken-image glyph.
    // A portrait is either a loaded image or the placeholder silhouette — never a torn page.
    await registerRaw(page, 'e2evis3', 'Faces');
    const starter = page.getByRole('dialog', { name: /choose your first champion/i });
    await expect(starter).toBeVisible({ timeout: 20_000 });
    await starter
      .getByRole('button', { name: /^choose /i })
      .first()
      .click();
    await starter.getByRole('button', { name: /stand together/i }).click();
    await expect(starter).toBeHidden({ timeout: 15_000 });

    await page
      .getByRole('button', { name: /^champions$/i })
      .first()
      .click();
    await expect(page.getByRole('button', { name: /lv \d+/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    const broken = await page.evaluate(
      () =>
        Array.from(document.images).filter((img) => img.complete && img.naturalWidth === 0).length,
    );
    expect(broken, 'images that failed to load').toBe(0);
  });

  test('the icon sprite is inlined, so icons take the colour around them', async ({ page }) => {
    await registerRaw(page, 'e2evis4', 'Iconoclast');
    await chooseStarter(page);
    // Injected into the document rather than referenced externally: `currentColor` does not
    // cross into an external SVG in every browser.
    await expect(page.locator('#mv-icon-sprite')).toHaveCount(1, { timeout: 15_000 });
    const symbols = await page.locator('#mv-icon-sprite symbol').count();
    expect(symbols, 'symbols in the sprite').toBeGreaterThan(50);

    // And something is actually using it. Asked on a champion card rather than on the
    // Haven since the design rework: the shell's icons are the library's painted art and
    // its glyph masks now, and the sprite's remaining job is the game's own symbols —
    // affinity, role, stat — which live on the cards.
    await page
      .getByRole('navigation')
      .getByRole('button', { name: /Champions/ })
      .click();
    await expect(page.locator('svg use').first()).toBeVisible({ timeout: 15_000 });
  });
});
