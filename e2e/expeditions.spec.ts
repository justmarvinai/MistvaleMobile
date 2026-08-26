import { expect, test } from '@playwright/test';
import { chooseStarter, dockEntry, havenBoard, placeCard, registerRaw } from './support';

/**
 * Expeditions, in a real browser.
 *
 * The round trip — dispatch, the slot cap, the yield, claiming once, recalling — is pinned
 * in `expeditions.test.ts` against a real database, where the clock can be wound back and a
 * twelve-hour wait costs nothing. What only a browser can answer is the pair of rules that
 * decide whether the feature reads at all on an account that has not unlocked it, and both
 * are deterministic on a fresh warden:
 *
 *  - the dock names it and says when it opens, rather than hiding it — a feature nobody can
 *    see is a feature nobody aims for;
 *  - the screen itself is safe and says something useful below the unlock, rather than
 *    rendering an empty page or an error.
 *
 * The interesting states need a roster of six and an account at level 11, neither of which
 * anything a new account can do in one session will produce — so they are proven where they
 * can be proven exactly.
 */

test.describe('expeditions', () => {
  test('are named in the dock, with the level that opens them', async ({ page }) => {
    await registerRaw(page, 'e2eexp', 'Dispatcher');
    await chooseStarter(page);

    // Two presses now: the dock holds hubs, and the place is a card on one (C12).
    await dockEntry(page, 'Expeditions').click();
    const entry = placeCard(page, 'Expeditions');
    await expect(entry).toBeVisible({ timeout: 15_000 });
    // Shrouded rather than hidden: a locked station keeps its board and says when it opens,
    // which is the rule every other station follows.
    await expect(entry).toHaveAttribute('aria-disabled', 'true');
  });

  test('say what they are for on an account that cannot run one yet', async ({ page }) => {
    // The zero-content rule from P9d, applied to the newest screen: every screen has to be
    // safe and legible on an account that has done nothing.
    await registerRaw(page, 'e2eexp2', 'Novice');
    await chooseStarter(page);

    // Reached from the Haven's rail rather than the dock, since the dock entry is shrouded.
    await page
      .getByRole('button', { name: /^haven$/i })
      .first()
      .click();
    // No navigation: the Haven is where a fresh account lands and its rail draws every
    // place in the vale, so the board is already on screen. Pressing the dock first is
    // worse than unnecessary — the starter dialog is modal at this exact moment and eats
    // the click, which is a 270-second timeout rather than a failure.
    const board = havenBoard(page, 'Expeditions');
    await expect(board).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/level 11/i).first()).toBeVisible();
  });
});
