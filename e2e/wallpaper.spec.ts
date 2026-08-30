import { expect, test, type Page } from '@playwright/test';
import { chooseStarter, enterStageOneOne, goToScreen, registerRaw } from './support';
import { decodePng, differingFraction, litFraction } from './pixels';

/**
 * The tab paintings (C23).
 *
 * Six of them, one per dock slot, behind a dark wash and under the fog. Which tab gets
 * which is decided by `ui/tabScenery` and checked in its own unit test, because that is a
 * *mapping* and a browser is a slow way to read a map. What only a browser can answer is
 * the other half, and both halves of it have bitten this project before:
 *
 *  - **Did the art actually arrive?** These publish into a gitignored tree, exactly like
 *    the champion sprites whose absence B2 found on the owner's box after ten phases — and
 *    like the title backdrop, they fail *quietly*: the screen simply shows the ground it
 *    always did, which looks deliberate rather than broken.
 *  - **Is the game still readable over them?** The paintings are lit night markets and
 *    burning fields. C18 shipped exactly this bug on the title screen, where the art was
 *    drawn over the entire sign-in form and the first guard passed anyway.
 */

/** Every published painting, and the tab it belongs to. `tabScenery` is the source. */
const PAINTINGS = [
  { tab: 'Haven', file: 'tab_haven_wallpaper' },
  { tab: 'Battle', file: 'tab_combat_wallpaper' },
  { tab: 'Champions', file: 'tab_champions_wallpaper' },
  { tab: 'Errands', file: 'tab_errands_wallpaper' },
  { tab: 'Mistgate', file: 'tab_mistgate_wallpaper' },
  // Reachable only from level 5, so it is decoded below rather than navigated to. The
  // painting existing is the half a browser is needed for; which tab it lands on is
  // `tabScenery`'s own test.
  { tab: null, file: 'tab_bazaar_wallpaper' },
] as const;

/** The layer holding the tab's painting: the one element whose URL says which it is. */
const wallpaperLayer = 'div[style*="/wallpapers/"]';

test.describe('the tab paintings', () => {
  test('all six are published', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /enter the vale/i })).toBeVisible({
      timeout: 20_000,
    });

    // Asked by **decoding** each file rather than fetching it, which is the whole point:
    // a missing file answers 200 with the game's own HTML — `try_files` is right for a
    // route and a lie about a file — so a status check passes against precisely the
    // failure it exists to catch. An HTML document does not decode as an image.
    for (const painting of PAINTINGS) {
      const width = await page.evaluate(
        (src) =>
          new Promise<number>((resolve) => {
            const image = new Image();
            image.onload = () => resolve(image.naturalWidth);
            image.onerror = () => resolve(0);
            image.src = src;
          }),
        `/wallpapers/${painting.file}.jpg`,
      );
      expect(width, `${painting.file} is published — run \`pnpm assets\``).toBeGreaterThan(0);
    }
  });

  test('each tab draws its own, and the game reads over it', async ({ page }) => {
    test.slow();
    await registerRaw(page, 'e2ewall', 'Painter');
    await chooseStarter(page);

    for (const painting of PAINTINGS) {
      if (!painting.tab) continue;
      await goToScreen(page, painting.tab);

      const layer = page.locator(wallpaperLayer);
      await expect(layer, `${painting.tab} is painted`).toHaveCount(1);
      await expect(layer, `${painting.tab} draws ${painting.file}`).toHaveAttribute(
        'style',
        new RegExp(`/wallpapers/${painting.file}\\.jpg`),
      );

      // And it is on the *screen*, not merely in the document.
      //
      // The first cut of this spec stopped at the line above, and it passed for a whole
      // release with the paintings invisible: the shared canvas cleared to an opaque colour
      // and, once it was correctly stacked in front of them, covered every one. An element
      // carrying the right URL says nothing about whether anybody can see it.
      expect(
        await wallpaperContribution(page),
        `${painting.tab}'s painting reaches the screen`,
      ).toBeGreaterThan(0.08);
    }

    // And the shell is still on top of it. `expectOnTop` cannot answer this and it is worth
    // knowing why: `elementFromPoint` skips anything with `pointer-events: none`, which the
    // whole backdrop is, so it reports the heading as topmost while a painting covers it
    // completely — the exact hole C18 found on the title screen. So this reads pixels.
    // Measured on the Mistgate: 11.8% of the heading's box is near-white as shipped, and
    // exactly 0.0% with the backdrop's stacking order lifted over the shell. The threshold
    // sits well clear of both, because the failure is total rather than gradual.
    const heading = decodePng(
      await page.getByRole('heading', { name: 'The Mistgate' }).screenshot(),
    );
    expect(litFraction(heading, 150), 'the title is painted, not buried').toBeGreaterThan(0.05);
  });

  /**
   * And the room is still there once the fighting starts (C28b).
   *
   * The battle screen is the one place in the game with something of its own on the canvas,
   * and the scene used to open by clearing the whole of it to an opaque near-black before
   * laying the floor over the bottom. That was written before C23 put a painting behind
   * every tab and was never reconciled with it, so the Combat painting was published,
   * loaded, correctly stacked — and covered, in the only room a player spends real time in.
   *
   * The tell was that the *fallback* renderer looked better: `DomBattlefield` has only ever
   * drawn the floor, so the simple battlefield showed the room above the horizon while the
   * painted one showed a void. Two renderers meant to be the same fight.
   *
   * Asked of the band above the horizon, because below it there is a floor and there is
   * supposed to be. At 1440×900 the scene is contained to 1440×810 from y=45, so its 230th
   * row of 540 lands at y=390. Measured: the painting is **87%** of the band between the
   * top bar and the horizon, and **0.79%** with the opaque sky put back.
   */
  test('the room shows through a fight', async ({ page }) => {
    test.slow();
    await registerRaw(page, 'e2ewallb', 'Battler');
    await chooseStarter(page);
    await enterStageOneOne(page);

    const width = page.viewportSize()?.width ?? 1440;
    await expect
      .poll(
        async () =>
          Math.round(
            (await wallpaperContribution(page, { x: 0, y: 120, width, height: 260 })) * 100,
          ),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(40);
  });
});

/**
 * How much of the window the tab's painting is actually contributing.
 *
 * Shoot the page, hide the painting, shoot it again: what changed is the painting's own
 * contribution, and a painting nobody can see contributes nothing. The same measurement as
 * `visible.spec.ts` makes of the canvas, in the other direction — the two layers are a
 * stack, and each of them has now covered the other once.
 *
 * Measured at 1440×900: 31% of the window on the Haven, 25% on Champions and Errands, and
 * 17% at the Mistgate, whose screen carries the most opaque panelling. With the stage's
 * opaque clear colour put back — the state the owner reported — the Haven falls to 4.6%,
 * so the bar sits between the two with room on both sides rather than at zero.
 *
 * A clip narrows it to one region, which the battle screen needs: the fight covers the
 * bottom of its own window on purpose, and the question there is only about the band above
 * the horizon.
 */
async function wallpaperContribution(
  page: Page,
  clip?: { x: number; y: number; width: number; height: number },
): Promise<number> {
  const setHidden = (hidden: boolean) =>
    page.evaluate((hide) => {
      const layer = document.querySelector('div[style*="/wallpapers/"]');
      if (layer instanceof HTMLElement) layer.style.visibility = hide ? 'hidden' : '';
    }, hidden);

  const shot = () => (clip ? page.screenshot({ clip }) : page.screenshot());
  const painted = decodePng(await shot());
  await setHidden(true);
  const bare = decodePng(await shot());
  await setHidden(false);
  return differingFraction(painted, bare);
}
