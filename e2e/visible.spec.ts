import { expect, test } from '@playwright/test';
import { chooseStarter, dismissUnlocks, expectOnTop, registerRaw, resolveBattle } from './support';

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
    // Named by the library's own classes since the design rework, which is the more honest
    // question anyway — these assert that the widget a player looks at is the topmost
    // thing at its own centre, not that a wrapper of ours exists.
    await expectOnTop(page, '.fui-waves', 'the wave pips');
    await expectOnTop(page, '.fui-battlectl', 'the battle controls');
    await expectOnTop(page, '.fui-actionbar', 'the skill bar');

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
    // An action slot is the library's `Slot`: a `role="button"` cell rather than a
    // `<button>`, because a hotbar slot also takes a drag and a right-click.
    const skills = page.locator('.fui-actionbar [role="button"]');
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

  test('nothing is drawn outside the box that holds it', async ({ page }) => {
    test.slow();
    // Two bugs the owner found on the same day, and they are the same bug: the library's
    // `ArtifactCard` is a fixed 236px and its `ChampionCard` a fixed 150px — everything
    // inside them, down to the font sizes, is derived from that number, so neither can be
    // stretched to a column. A grid cell wider than the card leaves anything laid out
    // *beside* it — the Forge and Lock buttons under a relic — visibly wider than the card
    // it belongs to; a holder at `width: 100%` puts four painted champion cards in a
    // column, one per row, because a full-width flex item never wraps.
    //
    // Neither shows up as an error, a failed assertion or a broken image. Only measurement
    // finds them, so this measures.
    await registerRaw(page, 'e2efit', 'Measurer');
    await chooseStarter(page);

    // Relics, because the vault is where the mismatch showed and an empty vault proves
    // nothing. A stage does not always drop one, so it is farmed until it does.
    for (let run = 0; run < 4; run += 1) {
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
      await resolveBattle(page);
      // Back out of the result, or the dock is not on screen to navigate with.
      await page
        .getByRole('button', { name: /back to the campaign/i })
        .click()
        .catch(() => undefined);
      await dismissUnlocks(page);

      const held = await page.evaluate(async () => {
        const response = await fetch('/api/player/gear', { credentials: 'include' });
        const body = (await response.json()) as { data?: { gear?: unknown[] } };
        return body.data?.gear?.length ?? 0;
      });
      if (held > 0) break;
    }

    let measured = 0;
    for (const screen of ['Campaign', 'Champions', 'Relics']) {
      const nav = page
        .getByRole('navigation')
        .getByRole('button', { name: new RegExp(`^${screen}`, 'i') })
        .first();
      // A screen still shrouded for a young account is not a screen to measure.
      if ((await nav.getAttribute('aria-disabled')) === 'true') continue;
      await nav.click();
      await page.waitForTimeout(1200);

      // The page itself never scrolls sideways.
      const spill = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(spill, `${screen} scrolls sideways`).toBeLessThanOrEqual(0);

      // And every painted card fits the box laid out around it.
      const found = await page.evaluate(() => {
        const misfits: { card: string; holder: string; diff: number }[] = [];
        const cards = document.querySelectorAll('.fui-artifact, .fui-champ');
        for (const card of cards) {
          // Walk past the React bridge, which is `display: contents` on purpose so the
          // library's element becomes the flex or grid item its parent expects. It has no
          // box, so measuring it measures nothing — which is how the first draft of this
          // test passed against the very bug it was written for.
          let holder = card.parentElement;
          while (holder && getComputedStyle(holder).display === 'contents') {
            holder = holder.parentElement;
          }
          if (!holder || holder === card) continue;
          const diff = Math.round(
            holder.getBoundingClientRect().width - card.getBoundingClientRect().width,
          );
          // Three shapes, and only two of them are wrong.
          //
          // A *grid of cards* is wider than any one card and that is what a grid is — every
          // child is a card, each sits at its own size, nothing disagrees.
          // A *wrapper holding a card and something else* — the Forge and Lock buttons under
          // a relic — must be the card's width, or the something else draws wider than the
          // card it belongs to.
          //
          // Only the second is measurable from here. A one-card grid and a stretched list
          // item are the same shape to a measurement, so widening the rule to catch the
          // third flagged every grid in the game. The second is the class that recurs
          // anyway: every screen that puts a control beside a card has it to get wrong.
          const kin = Array.from(holder.children).filter(
            (child) =>
              child.matches('.fui-artifact, .fui-champ') ||
              child.querySelector('.fui-artifact, .fui-champ'),
          ).length;
          const others = holder.childElementCount - kin;
          if (diff > 8 && others > 0) {
            misfits.push({
              card: card.className.split(' ')[1] ?? '',
              holder: (holder.className || holder.tagName).toString().slice(0, 60),
              diff,
            });
          }
        }
        return { measured: cards.length, misfits: misfits.slice(0, 4) };
      });
      expect(found.misfits, `${screen}: a painted card is adrift in its holder`).toEqual([]);
      measured += found.measured;
    }

    // A green run that measured nothing is not a green run. Both card types have to have
    // been on screen for this test to have said anything at all.
    expect(measured, 'painted cards actually measured').toBeGreaterThan(0);
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

    // And the cards, which `document.images` cannot see: since the design rework a
    // champion's face is a CSS background on the library's card, so an `<img>` sweep
    // reports a clean page while every card on it is an empty frame — which is exactly
    // what a ×10 pull of art-pending champions was. Every card must name a picture, and
    // the picture must load.
    const cards = page.locator('.fui-champ__art');
    expect(await cards.count(), 'champion cards on the roster').toBeGreaterThan(0);

    const artless = await page.evaluate(async () => {
      const urls = Array.from(document.querySelectorAll('.fui-champ__art'), (el) => {
        const image = getComputedStyle(el).backgroundImage;
        return /url\(["']?(.+?)["']?\)/.exec(image)?.[1] ?? null;
      });
      const loads = await Promise.all(
        Array.from(new Set(urls)).map(
          (url) =>
            new Promise<string | null>((resolve) => {
              if (!url) return resolve('(no background image)');
              const probe = new Image();
              probe.onload = () => resolve(null);
              probe.onerror = () => resolve(url);
              probe.src = url;
            }),
        ),
      );
      return loads.filter((entry): entry is string => entry !== null);
    });
    expect(artless, 'champion cards with no picture').toEqual([]);
  });

  test('the icon sprite is inlined, so icons take the colour around them', async ({ page }) => {
    await registerRaw(page, 'e2evis4', 'Iconoclast');
    await chooseStarter(page);
    // Injected into the document rather than referenced externally: `currentColor` does not
    // cross into an external SVG in every browser.
    await expect(page.locator('#mv-icon-sprite')).toHaveCount(1, { timeout: 15_000 });
    const symbols = await page.locator('#mv-icon-sprite symbol').count();
    expect(symbols, 'symbols in the sprite').toBeGreaterThan(50);

    // And something is actually using it. Asked on the champion *sheet* since the design
    // rework: the shell's icons are the library's painted art and its glyph masks now, and
    // the card's are too, so the sprite's remaining job is the symbols inside a sheet — the
    // lock, the favourite mark, a relic slot's silhouette.
    await page
      .getByRole('navigation')
      .getByRole('button', { name: /Champions/ })
      .click();
    await page
      .getByRole('button', { name: /lv \d+/i })
      .first()
      .click();
    await expect(page.locator('svg use').first()).toBeVisible({ timeout: 15_000 });
  });
});
