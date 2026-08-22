import { expect, test, type Page } from '@playwright/test';
import { leaveTutorial, resolveBattle } from './support';

/**
 * The first hour, in a real browser.
 *
 * The engine underneath is covered exhaustively against a real database (28 cases in
 * `tutorial.test.ts`). What a browser adds is the half that has no server in it: that a
 * fresh account is *taken* to the cold open rather than dropped on an empty screen, that
 * the parchment says what the step says, that the highlight finds the thing it names, and
 * that Continue is dark until the server agrees the step is done.
 *
 * This is the one spec that does **not** skip the tutorial — every other one does, because
 * they are about something else.
 */

const password = 'a-good-long-password';

function unique(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

test.describe('the tutorial', () => {
  test('opens on the Wardenmaster and the fight he is pointing at', async ({ page }) => {
    test.slow();
    await arrive(page, 'e2tu');

    const overlay = page.getByRole('region', { name: 'Tutorial' });
    await expect(overlay).toBeVisible({ timeout: 20_000 });
    await expect(overlay).toContainText('The Wardenmaster');
    await expect(overlay).toContainText('1 / 15');
    await expect(overlay).toContainText('Something on the road');

    // Step one is a fight, so the overlay took the player to it — and the battle screen
    // offers the only door into a battle nobody brings a team to.
    await expect(page.getByRole('button', { name: /meet them on the road/i })).toBeVisible();
    // Nothing can be continued past yet: the fight has not happened.
    await expect(overlay.getByRole('button', { name: /not yet|go and do it/i })).toBeDisabled();
  });

  test('points at things without dimming any of the game', async ({ page }) => {
    test.slow();
    // Two rounds of the same complaint, and the second settled it. The overlay used to dim
    // everything around whatever it pointed at — a hole cut in a scrim — which fell back to
    // one full-viewport pane on a step with nothing to point at, and that is the modal this
    // overlay is deliberately not. That got fixed. The owner then said the remaining dim was
    // still wrong: highlight the target and leave the game alone. So there is no scrim at
    // all now, and this asks for the strong version — not "no pane covers everything" but
    // "no pane covers anything".
    await arrive(page, 'e2dim');
    await expect(page.getByRole('region', { name: 'Tutorial' })).toBeVisible({ timeout: 20_000 });

    /** Everything the overlay draws that paints a translucent dark over the page. */
    const dimming = async (): Promise<number> =>
      page.evaluate(() => {
        const overlay = document.querySelector('[aria-label="Tutorial"]');
        if (!overlay) return -1;
        return Array.from(overlay.querySelectorAll('*')).filter((el) => {
          const box = el.getBoundingClientRect();
          if (box.width < 40 || box.height < 40) return false;
          const rgba = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(
            getComputedStyle(el).backgroundColor,
          );
          if (!rgba) return false;
          const alpha = rgba[4] === undefined ? 1 : Number(rgba[4]);
          // The card is opaque parchment and is meant to be. A scrim is the other thing: a
          // large, part-transparent dark rectangle sitting over the game.
          const dark = Number(rgba[1]) + Number(rgba[2]) + Number(rgba[3]) < 200;
          return dark && alpha > 0 && alpha < 0.95;
        }).length;
      });

    expect(await dimming(), 'the overlay dims part of the screen').toBe(0);

    // …and the fight it points at is not behind one either.
    await page.getByRole('button', { name: /meet them on the road/i }).click();
    await expect(page.getByRole('button', { name: /^auto$/i })).toBeVisible({ timeout: 25_000 });
    expect(await dimming(), 'the overlay dims part of the fight').toBe(0);
  });

  test('is heard as well as read, and the Vale has a soundtrack', async ({ page }) => {
    test.slow();
    // The owner's bug, and the reason the fill learned to backfill. `portrait` and `sound`
    // were new *fields* on the fifteen tutorial steps that already existed, and a plain seed
    // only ever added new *entities* — so on his install every step carried an empty string
    // for both. It failed in total silence: the schema defaults a missing key to '', so the
    // content parsed, the client asked for nothing, and nothing anywhere said why.
    //
    // Asserted at the network, because that is the only place the whole chain is visible:
    // the field is populated, the channel unlocked on a real gesture, the fader above zero,
    // and the published file actually served. An `Audio` element is never in the DOM, so
    // there is nothing to query for.
    const asked: string[] = [];
    page.on('request', (request) => asked.push(new URL(request.url()).pathname));

    await arrive(page, 'e2snd');
    await expect(page.getByRole('region', { name: 'Tutorial' })).toBeVisible({ timeout: 25_000 });

    await expect
      .poll(() => asked.filter((path) => path.startsWith('/audio/')), { timeout: 20_000 })
      .toEqual(
        expect.arrayContaining([
          '/audio/tutorial/tutorial_step_1.mp3',
          '/audio/music/combat_campaign_depths_arena.mp3',
        ]),
      );

    // And they are real files rather than the SPA's index.html, which is what an unpublished
    // path answers with and which an <audio> element reports as an ordinary decode failure.
    for (const path of [
      '/audio/tutorial/tutorial_step_1.mp3',
      '/portraits/wardenmaster_avatar.jpg',
    ]) {
      const response = await page.request.get(path);
      expect(response.status(), path).toBe(200);
      expect(response.headers()['content-type'], path).not.toContain('text/html');
    }
  });

  test('speaks with a face, and lets the player shove it out of the way', async ({ page }) => {
    test.slow();
    // The card sits over the game and points at things, so sooner or later it points at
    // something underneath itself. Moving it is the only answer that always works.
    await arrive(page, 'e2drag');
    const overlay = page.getByRole('region', { name: 'Tutorial' });
    await expect(overlay).toBeVisible({ timeout: 20_000 });

    // The Wardenmaster's own face, published from assets/ui/misc_avatars — the thing that
    // makes the line read as somebody saying it rather than as a tooltip. Full height and
    // attached to the card's left edge since the owner's mock: at 48px in the corner of a
    // header he was a favicon.
    const face = overlay.locator('img').first();
    await expect(face).toBeVisible();
    const portrait = (await face.boundingBox())!;
    expect(
      await face.evaluate((img) => (img as HTMLImageElement).naturalWidth),
      'the portrait actually loaded',
    ).toBeGreaterThan(0);

    const handle = overlay.getByRole('button', { name: /move the wardenmaster/i });
    // The card is the handle's grandparent — handle → text column → card — said directly.
    // Reaching for it with `filter({ has })` is ambiguous when the handle is itself a div:
    // the filter matches the handle as well as its ancestors, and `.last()` then picks the
    // wrong one or nothing at all.
    const card = handle.locator('xpath=../..');
    const before = await card.boundingBox();
    expect(before, 'the card is laid out').not.toBeNull();
    // He reaches both of the card's own edges: `align-self: stretch` doing its job. Setting
    // an explicit `height: 100%` beside it silently turns that off — the card's height is
    // auto, so the percentage is too — and left him ending ninety pixels short of the
    // buttons. Measured against the card's *inside*, since the painted frame is a real 2px
    // border and the picture is meant to sit within it rather than over it.
    const frame = await card.evaluate((el) => {
      const style = getComputedStyle(el);
      return parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    });
    expect(portrait.height, 'the portrait is the full height of the card').toBeCloseTo(
      before!.height - frame,
      0,
    );

    const grip = (await handle.boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(140, 140, { steps: 8 });
    await page.mouse.up();

    const after = (await card.boundingBox())!;
    expect(after.x, 'the card moved horizontally').not.toBeCloseTo(before!.x, 0);
    expect(after.y, 'the card moved vertically').not.toBeCloseTo(before!.y, 0);
    // And it is still on screen: a panel dragged past the edge would be unrecoverable, since
    // there is no scrollbar out there.
    const viewport = page.viewportSize()!;
    expect(after.x).toBeGreaterThanOrEqual(0);
    expect(after.y).toBeGreaterThanOrEqual(0);
    expect(after.x + after.width).toBeLessThanOrEqual(viewport.width);
    expect(after.y + after.height).toBeLessThanOrEqual(viewport.height);

    // The keyboard reaches it too — a card only a mouse can move is a card some players
    // cannot move at all.
    await handle.focus();
    await page.keyboard.press('ArrowRight');
    expect((await card.boundingBox())!.x).toBeGreaterThan(after.x);
  });

  test('walks the cold open and lets the player move on afterwards', async ({ page }) => {
    test.slow();
    test.setTimeout(180_000);
    await arrive(page, 'e2tw');

    const overlay = page.getByRole('region', { name: 'Tutorial' });
    await expect(overlay).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: /meet them on the road/i }).click();
    // The borrowed three are on the field, and the account still owns nobody.
    await expect(page.getByRole('button', { name: /^auto$/i })).toBeVisible({ timeout: 30_000 });
    const roster = await page.evaluate(async () => {
      const response = await fetch('/api/player/champions', { credentials: 'include' });
      const body = (await response.json()) as { data?: { champions: unknown[] } };
      return body.data?.champions.length ?? -1;
    });
    expect(roster).toBe(0);

    await page.getByRole('button', { name: /^auto$/i }).click();

    // The one place in the suite where the playback itself is the subject.
    //
    // Auto resolves the whole fight in a single response, and the results modal used to
    // open on *that* — about three seconds in, on top of a HUD still reading "Turn 0".
    // Every battle in the game gave its outcome away before it was watched, and the cold
    // open's tuned near-death beat was never once seen. So: the fight must be visibly
    // under way with the outcome still hidden.
    const results = page.getByRole('dialog', { name: /victory|defeat|withdrawn/i });
    // The wave and the turn are separate readouts since the design rework — pips for the
    // one, a count for the other — so the turn is asked for on its own.
    await expect(page.getByText(/^Turn [1-9]/)).toBeVisible({ timeout: 30_000 });
    await expect(results).toBeHidden();

    // The rest of it is fought rather than skipped. Since C7 a fight can only be jumped to
    // its end on a stage already beaten, and the cold open records no clear at all — so it
    // is the one battle in the game that is *never* skippable. That is deliberate: the
    // tutorial's own "Skip tutorial" is the way past the tutorial, and it takes the cold
    // open with it. `resolveBattle` presses Auto and waits, which is what a player who
    // does not want to watch actually has.
    await resolveBattle(page);
    await expect(results).toBeVisible({ timeout: 30_000 });
    await expect(results).toContainText(/victory/i);

    // The results sit *over* the parchment — the overlay is deliberately below modals so
    // the starter choice can land on top of it — so they are read and dismissed first.
    await results.getByRole('button', { name: /back to the campaign/i }).click();
    await expect(results).toBeHidden({ timeout: 20_000 });

    // The step it was waiting on is finished, so Continue lights up.
    const advance = overlay.getByRole('button', { name: /continue/i });
    await expect(advance).toBeEnabled({ timeout: 30_000 });
    await advance.click();

    await expect(overlay).toContainText('2 / 15', { timeout: 20_000 });
  });

  test('marks the things a step can point at', async ({ page }) => {
    test.slow();
    await arrive(page, 'e2th');
    // Off the battle screen, which is a takeover and deliberately has no dock — the keys
    // a later step names live on the shell the player spends the rest of the game in.
    await leaveTutorial(page);
    await expect(page.getByRole('dialog', { name: /choose your first champion/i })).toBeVisible({
      timeout: 20_000,
    });

    const marked = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-mv-highlight]'), (node) =>
        node.getAttribute('data-mv-highlight'),
      ),
    );
    // The dock the script sends people around, and the modal step three points at.
    expect(marked).toContain('dock:campaign');
    expect(marked).toContain('dock:depths');
    expect(marked).toContain('modal:starter-choice');
  });

  test('celebrates the first thing the script opens', async ({ page }) => {
    test.slow();
    test.setTimeout(240_000);
    await arrive(page, 'e2tc');

    const overlay = page.getByRole('region', { name: 'Tutorial' });
    await expect(overlay).toBeVisible({ timeout: 20_000 });

    // Step 1: the cold open. It pays nothing — the account is still level 1 after it.
    await page.getByRole('button', { name: /meet them on the road/i }).click();
    await resolveBattle(page);
    const results = page.getByRole('dialog', { name: /victory|defeat|withdrawn/i });
    await expect(results).toBeVisible({ timeout: 60_000 });
    await results.getByRole('button', { name: /back to the campaign/i }).click();
    await advance(page);

    // Step 2: the Wardenmaster's greeting, and the first XP of the game.
    await advance(page);

    // Step 3: the starter choice. Sixty more XP takes the account to level 2, which is
    // where the calendar opens — the first gate the game has ever crossed for anybody.
    const starterDialog = page.getByRole('dialog', { name: /choose your first champion/i });
    await expect(starterDialog).toBeVisible({ timeout: 30_000 });
    await starterDialog
      .getByRole('button', { name: /^choose /i })
      .first()
      .click();
    await starterDialog.getByRole('button', { name: /stand together/i }).click();
    await expect(starterDialog).toBeHidden({ timeout: 20_000 });
    await advance(page);

    const celebration = page.getByRole('dialog', { name: /the mist thins/i });
    await expect(celebration).toBeVisible({ timeout: 30_000 });
    await expect(celebration).toContainText(/level 2/i);
    await expect(celebration).toContainText(/calendar/i);

    // And it is a one-off: dismissed, it does not come back on a reload.
    await celebration.getByRole('button', { name: /later/i }).click();
    await expect(celebration).toBeHidden();
    await page.reload();
    await expect(celebration).toBeHidden({ timeout: 20_000 });
  });

  test('a skip is final, and the overlay does not come back', async ({ page }) => {
    test.slow();
    await arrive(page, 'e2ts');

    const overlay = page.getByRole('region', { name: 'Tutorial' });
    await expect(overlay).toBeVisible({ timeout: 20_000 });

    await overlay.getByRole('button', { name: /skip tutorial/i }).click();
    await expect(overlay).toContainText(/final/i);
    await overlay.getByRole('button', { name: /skip anyway/i }).click();
    await expect(overlay).toBeHidden({ timeout: 20_000 });

    // Still gone after a reload — the decision is the server's, not the tab's.
    await page.reload();
    await expect(page.getByRole('dialog', { name: /choose your first champion/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(overlay).toBeHidden();
  });
});

/**
 * Closes the open step once the server agrees it is finished.
 *
 * One click, always. What the step paid appears on the *next* step's card rather than
 * behind an acknowledgement, so there is no second gate to get past.
 */
async function advance(page: Page): Promise<void> {
  const button = page
    .getByRole('region', { name: 'Tutorial' })
    .getByRole('button', { name: /continue/i });
  await expect(button).toBeEnabled({ timeout: 30_000 });
  await button.click();
}

/** Registers a fresh warden and leaves them exactly where the script puts them. */
async function arrive(page: Page, account: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('tab', { name: 'New warden' }).click();
  await page.getByLabel('Account name').fill(unique(account));
  await page.getByLabel('Profile name').fill(unique('Warden'));
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Take up the lantern' }).click();
}
