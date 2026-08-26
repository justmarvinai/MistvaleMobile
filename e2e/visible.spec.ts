import { expect, test, type Page } from '@playwright/test';
import {
  chooseStarter,
  dismissUnlocks,
  enterStageOneOne,
  expectOnTop,
  openCampaignStage,
  pickTeam,
  registerRaw,
  resolveBattle,
  setSimpleBattlefield,
  dockEntry,
  goToScreen,
  placeCard,
} from './support';
import { decodePng, litFraction, meanColour } from './pixels';

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
 *
 * One test here does read pixels, and has to: the battlefield is a WebGL canvas and there
 * is no element to point at. It counts how much of the field is not the ground it is drawn
 * on, which is coarse enough to survive any amount of redrawing and exact enough to fail
 * the day the champions stop appearing.
 */

/**
 * A page must never scroll sideways (C12).
 *
 * The rule the owner's mobile-support ask reduces to, and the one thing a narrow window
 * cannot be allowed to do: a document that scrolls horizontally makes every screen behind
 * it feel broken, and the thing that has slipped off the edge is usually the thing being
 * reached for. Two real defects were found this way at 430px — a starter dialog with a
 * `min-width` wider than the phone, whose confirm button ended up *underneath* a champion
 * card, and a top bar carrying nine controls that took the document with it.
 *
 * Measured at a handset, a small tablet and a desktop, because the failure is a *width*
 * rather than a device.
 */
test.describe('no page scrolls sideways', () => {
  for (const [name, viewport] of [
    ['a handset', { width: 430, height: 932 }],
    ['a small tablet', { width: 1024, height: 768 }],
    ['a desktop', { width: 1920, height: 1080 }],
  ] as const) {
    test(`on ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await registerRaw(page, 'e2ewidth', 'Fitter');
      await chooseStarter(page);

      // The Haven, then each hub — the pages every account can reach without unlocks.
      for (const hub of ['Battle', 'Champions', 'Errands'] as const) {
        await page
          .getByRole('navigation')
          .getByRole('button', { name: new RegExp(`^${hub}`, 'i') })
          .click();
        await page.waitForTimeout(400);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(
          overflow,
          `${hub} overflows by ${overflow}px at ${viewport.width}px`,
        ).toBeLessThanOrEqual(0);
      }
    });
  }
});

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
    await openCampaignStage(page, '1-1');
    const teamDialog = page.getByRole('dialog', { name: /stage 1/i });
    await pickTeam(teamDialog);
    await teamDialog.getByRole('button', { name: /into the mist/i }).click();
    await expect(page.getByRole('button', { name: /^auto$/i })).toBeVisible({ timeout: 20_000 });

    // The three things that were covered: the wave readout, the controls, the skill bar.
    // Named by the library's own classes since the design rework, which is the more honest
    // question anyway — these assert that the widget a player looks at is the topmost
    // thing at its own centre, not that a wrapper of ours exists.
    await expectOnTop(page, '.fui-waves', 'the wave pips');
    await expectOnTop(page, '.fui-battlectl', 'the battle controls');

    // The hotbar is the one that has to be *waited* for rather than looked at. Auto appears
    // with the screen, but the skill bar is keyed on the player actually being handed a
    // turn — so between those two moments the fight is playing out its opening and there is
    // no bar in the DOM to be on top of anything. Asserting it straight after Auto is a race
    // this suite happened to win until the page also began streaming a soundtrack.
    await expect(page.locator('.fui-actionbar')).toBeVisible({ timeout: 25_000 });
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
    await openCampaignStage(page, '1-1');
    const teamDialog = page.getByRole('dialog', { name: /stage 1/i });
    await pickTeam(teamDialog);
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
      await openCampaignStage(page, '1-1');
      const teamDialog = page.getByRole('dialog', { name: /stage 1/i });
      await pickTeam(teamDialog);
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
    for (const screen of ['Campaign', 'Roster', 'Relics']) {
      await dockEntry(page, screen).click();
      const nav = placeCard(page, screen);
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
    await goToScreen(page, 'Roster');
    await page
      .getByRole('button', { name: /lv \d+/i })
      .first()
      .click();
    await expect(page.locator('svg use').first()).toBeVisible({ timeout: 15_000 });
  });

  /**
   * A battlefield for the machines the graphics card fails on.
   *
   * Mistvale's battlefield is the one part of the game that needs a graphics context, and a
   * machine can fail to give it a working one in more ways than "it has none": acceleration
   * switched off, a driver the browser has blocklisted, a software renderer that draws the
   * allies and leaves the enemies as ghosts. All of them arrive as the same thing — a
   * correct fight over a black rectangle — and none can be told apart from inside the page.
   *
   * So there is a switch, and this is it working: every champion and every enemy standing on
   * the field as ordinary DOM, with no Pixi scene built at all.
   */
  test('the simple battlefield draws the fight without a graphics context', async ({ page }) => {
    test.slow();
    await registerRaw(page, 'e2esimple', 'Plain');
    await chooseStarter(page);

    // The switch, set the way the settings panel sets it.
    await setSimpleBattlefield(page);
    await dismissUnlocks(page);

    await page
      .getByRole('button', { name: /^campaign$/i })
      .first()
      .click();
    await openCampaignStage(page, '1-1');
    const teamDialog = page.getByRole('dialog', { name: /stage 1/i });
    await pickTeam(teamDialog);
    await teamDialog.getByRole('button', { name: /into the mist/i }).click();

    // Both sides are on the field, in the DOM, where no canvas is involved.
    const fighters = page.locator('[data-side][data-alive]');
    await expect(fighters.first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => await fighters.count(), { timeout: 20_000 }).toBeGreaterThan(1);
    await expect(page.locator('[data-side="ally"][data-alive]')).not.toHaveCount(0);
    await expect(page.locator('[data-side="enemy"][data-alive]')).not.toHaveCount(0);

    // And the screen does not also complain: the browser is drawing on purpose.
    await expect(page.getByText(/battlefield|graphics acceleration/i)).toHaveCount(0);
  });

  /**
   * The wave counter counts.
   *
   * `WaveTracker` takes `current` at construction and paints from its own field after that,
   * so the pips were built on wave one and stayed there for the entire fight — the owner's
   * report was simply "it always only shows Wave 1". It is the same construction-time trap
   * the whole `Fui` bridge exists to manage, and the reason `apply` exists.
   *
   * Asserted on the label rather than on the pips: a player reads "2 / 3".
   */
  test('the wave counter follows the fight', async ({ page }) => {
    test.slow();
    await registerRaw(page, 'e2ewave', 'Waver');
    await chooseStarter(page);

    await page
      .getByRole('button', { name: /^campaign$/i })
      .first()
      .click();
    await openCampaignStage(page, '1-1');
    const teamDialog = page.getByRole('dialog', { name: /stage 1/i });
    await pickTeam(teamDialog);
    await teamDialog.getByRole('button', { name: /into the mist/i }).click();

    const wave = page.locator('.fui-waves');
    await expect(wave).toBeVisible({ timeout: 30_000 });
    await expect(wave, 'a three-wave stage opens on the first').toContainText('1 / 3');

    // Let the server fight it, and watch the counter move off wave one.
    await resolveBattle(page);
    await expect
      .poll(async () => (await wave.textContent())?.replace(/\s+/g, ' ') ?? '', {
        timeout: 60_000,
      })
      .not.toContain('1 / 3');
  });

  /**
   * The champions are on the board.
   *
   * This is the one thing in the game that no DOM assertion can reach, and it is the thing
   * that broke: on the owner's box every fight rendered a turn order, a set of health bars
   * and an empty field, because the unit art was not in the release and `attachSprite` gave
   * up when no frame loaded. Every test here passed throughout.
   *
   * Two halves, and the second is the important one. With art, the field has champions on
   * it. **Without** art — every sprite request refused, which is exactly the broken box —
   * the field still has bodies on it, because a unit whose own art will not load now falls
   * back to the shared silhouette. A fight is allowed to look plain. It is not allowed to
   * be empty.
   */
  for (const art of ['published', 'missing'] as const) {
    test(`the battlefield has bodies on it when the art is ${art}`, async ({ page }) => {
      test.slow();
      if (art === 'missing') {
        await page.route('**/sprites/**', (route) => route.fulfill({ status: 404, body: '' }));
      }

      await registerRaw(page, `e2epx${art[0]}`, `Pix${art[0]}`);
      await chooseStarter(page);

      await page
        .getByRole('button', { name: /^campaign$/i })
        .first()
        .click();
      await openCampaignStage(page, '1-1');
      const teamDialog = page.getByRole('dialog', { name: /stage 1/i });
      await pickTeam(teamDialog);
      await teamDialog.getByRole('button', { name: /into the mist/i }).click();

      // The fight is up once the hotbar names somebody to act with.
      await expect(page.locator('.fui-actionbar [role="button"]').first()).toBeVisible({
        timeout: 30_000,
      });
      // Sprites are loaded and attached a frame or two after the board arrives.
      await expect
        .poll(async () => Math.round((await litOnTheField(page)) * 1000), { timeout: 20_000 })
        .toBeGreaterThan(4);
    });
  }

  /**
   * The ground reaches the sides of the window.
   *
   * The scene *contains* its 960×540 design canvas rather than cropping it, which is the
   * right call for a composition with a side at each edge — but the floor was drawn exactly
   * as wide as that canvas, so in any window wider than 16:9 it stopped in the middle of the
   * screen with black either side. That is what the owner sent a screenshot of, and it is
   * invisible at the suite's usual viewport because 1440×900 fits the field exactly.
   *
   * Both renderers, because the fix is two fixes — a bled rectangle in the scene, a negative
   * inset in the stylesheet — and either can regress on its own. They are asked in different
   * ways on purpose. The painted floor is pixels and nothing else, so it is read as pixels.
   * The browser's floor is an element, and reading *it* as pixels would be dishonest: with
   * the simple battlefield on, no battle scene is built, so what shows through the gaps is
   * the ambient mist — bright enough to answer the question for it and pass either way.
   */
  test('the painted ground reaches the sides of a wide window', async ({ page }) => {
    test.slow();
    // 32:14. Wide enough that the field is letterboxed by about 180px at each side, which
    // is where the black bars were.
    await page.setViewportSize({ width: 1600, height: 700 });

    await registerRaw(page, 'e2egp', 'GrndP');
    await chooseStarter(page);
    await enterStageOneOne(page);

    // Asked as the horizon step at the edge itself, at one x, rather than by comparing an
    // edge against the middle of the screen: the field is lit with a lateral falloff, so the
    // floor is genuinely darker at the sides than in the centre and an equality there would
    // fail on a fix that works. Two patches 70px apart in the same column are on the same
    // part of that gradient, and the only thing between them is the horizon.
    //
    // With the floor reaching the edge that step is about seven points — the void behind the
    // letterbox against the ground plate, `#0c0a09` against `#171310`. Without it there is no
    // step at all, because both patches are the void.
    const patch = async (x: number, y: number): Promise<number> =>
      meanColour(decodePng(await page.screenshot({ clip: { x, y, width: 30, height: 30 } })))[0];

    for (const [edge, x] of [
      ['right', 1570],
      ['left', 0],
    ] as const) {
      const sky = await patch(x, 250);
      const floor = await patch(x, 320);
      expect(floor - sky, `the floor reaches the ${edge} edge`).toBeGreaterThan(3);
    }
  });

  test('the browser-drawn ground reaches the sides of a wide window', async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 1600, height: 700 });

    await registerRaw(page, 'e2egs', 'GrndS');
    await chooseStarter(page);
    await setSimpleBattlefield(page);
    await dismissUnlocks(page);
    await enterStageOneOne(page);

    const field = page.locator('[data-battlefield="simple"]');
    const ground = page.locator('[data-ground]');
    await expect(ground).toHaveCount(1);

    const fieldBox = await field.boundingBox();
    const groundBox = await ground.boundingBox();
    expect(fieldBox, 'the field is laid out').not.toBeNull();
    expect(groundBox, 'the ground is laid out').not.toBeNull();
    // The floor is clipped by the field, so it can be wider but never narrower: the
    // 960×540 canvas it lives in is 356px narrower than this window.
    expect(groundBox?.width ?? 0).toBeGreaterThanOrEqual(fieldBox?.width ?? Infinity);
  });
});

/**
 * How much of the battlefield is not the ground.
 *
 * Sampled from the middle band of the viewport — under the enemy plate and the turn order,
 * above the hotbar — so the HUD's own paint cannot answer the question for the canvas. Two
 * champions at this size cover a couple of percent of it, which is why the bar is set at
 * four parts in a thousand: comfortably above the ground plate's own variation, and far
 * below anything a drawn unit contributes.
 */
async function litOnTheField(page: Page): Promise<number> {
  const box = page.viewportSize() ?? { width: 1280, height: 720 };
  const shot = await page.screenshot({
    clip: {
      x: 0,
      y: Math.round(box.height * 0.3),
      width: box.width,
      height: Math.round(box.height * 0.45),
    },
  });
  return litFraction(decodePng(shot));
}
