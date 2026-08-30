import { expect, test, type Page } from '@playwright/test';
import { chooseStarter, dockEntry, havenBoard, placeCard, registerRaw } from './support';

/**
 * The Vale Pass, in a real browser.
 *
 * The interesting half — the day's ceiling stopping the points, a tier paying once per
 * column, the premium column refused until the track is taken up, the crystals leaving
 * exactly once — is pinned in `pass.test.ts` against a real database, where the clock can be
 * handed a Monday and a Tuesday and a purse can be filled. None of it is reachable from one
 * browser session on an account that has just registered.
 *
 * What only a browser can answer is whether the season *reads*, and the last test is the one
 * that matters: **the day's ceiling has to be on the screen.** That number is the whole
 * design, and a ceiling nobody can see is indistinguishable from favour that has quietly
 * stopped arriving — which is the one way this feature looks broken while working perfectly.
 */

/** A season shaped like the shipped one, for the two tests about *drawing* one. */
const SEASON = {
  ok: true,
  rev: 1,
  data: {
    pass: {
      today: '2026-08-10',
      claimable: 1,
      passes: [
        {
          passKey: 'pass_probe',
          name: 'A Season',
          description: 'Everything you do in the vale earns favour.',
          bannerAsset: '',
          season: '2026-08-01',
          points: 1_200,
          pointsToday: 250,
          dailyCap: 600,
          live: true,
          endsOn: '2026-08-31',
          claimsCloseOn: '2026-09-03',
          unlocked: false,
          unlockCost: 900,
          rules: [{ label: 'Each battle won', points: 30 }],
          tiers: [
            {
              index: 0,
              points: 500,
              free: { silver: 12_000 },
              premium: { crystals: 20 },
              reached: true,
              freeClaimed: false,
              premiumClaimed: false,
              premiumLocked: true,
            },
            {
              index: 1,
              points: 1_000,
              free: { energy: 60 },
              premium: { crystals: 20 },
              reached: true,
              freeClaimed: true,
              premiumClaimed: false,
              premiumLocked: true,
            },
            {
              index: 2,
              points: 1_500,
              free: { silver: 12_000 },
              premium: { crystals: 20 },
              reached: false,
              freeClaimed: false,
              premiumClaimed: false,
              premiumLocked: true,
            },
          ],
        },
      ],
    },
  },
};

test.describe('the Vale Pass', () => {
  test('is a shrouded promise to a warden who has not earned it', async ({ page }) => {
    await registerRaw(page, 'e2epass', 'Seasongoer');
    await chooseStarter(page);

    await dockEntry(page, 'Vale Pass').click();
    const entry = placeCard(page, 'Vale Pass');
    await expect(entry).toBeVisible({ timeout: 15_000 });
    await expect(entry).toHaveAttribute('aria-disabled', 'true');
  });

  test('says what it is for before it opens, rather than only when', async ({ page }) => {
    await registerRaw(page, 'e2epass2', 'Trackwalker');
    await chooseStarter(page);

    // No navigation: the Haven is where a fresh account lands and its rail draws every place
    // in the vale, so the board is already on screen. Pressing the dock first is worse than
    // unnecessary — the starter dialog is modal at this moment and eats the click, which
    // reads as a 270-second timeout rather than a failure.
    await page
      .getByRole('button', { name: /^haven$/i })
      .first()
      .click();
    const board = havenBoard(page, 'Vale Pass');
    await expect(board).toBeVisible({ timeout: 15_000 });
    // Why, not only when. A locked card that trades its sentence for "Opens at level 7" is
    // the defect C12c fixed across the whole registry.
    await expect(board).toContainText(/season/i);
  });

  /**
   * The screen itself, on an account the server would gate.
   *
   * Both halves are stubbed and both stubs are the point rather than a shortcut. The
   * snapshot is raised so the *card* opens, which is how a level-7 account reaches the
   * screen — the gate has its own test above. The season is stubbed because a real one
   * needs a month of play, and what is being measured here is the **screen**: whether the
   * ceiling is drawn, whether both rails are, and whether the purchase says its price.
   */
  async function openSeason(page: Page, options: { live?: boolean } = {}): Promise<void> {
    await page.route('**/api/player', async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as {
        data?: { player?: { level: number }; unlocks?: Record<string, boolean> };
      };
      if (body.data?.player) body.data.player.level = 20;
      if (body.data?.unlocks) body.data.unlocks.valePass = true;
      await route.fulfill({ response, json: body });
    });
    const season = structuredClone(SEASON);
    season.data.pass.passes[0]!.live = options.live ?? true;
    await page.route('**/api/vale-pass', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(season),
      });
    });
  }

  test('draws the season, both rails, and the day’s ceiling', async ({ page }) => {
    await openSeason(page);
    await registerRaw(page, 'e2epass3', 'Favourbearer');
    await chooseStarter(page);

    await dockEntry(page, 'Vale Pass').click();
    await placeCard(page, 'Vale Pass').click();

    await expect(page.getByRole('heading', { name: /vale pass/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // The number the whole design rests on, in the words a player reads.
    await expect(page.getByText(/250 of 600 today/i).first()).toBeVisible({ timeout: 15_000 });
    // And the distance to the next rung, which is the other half of "how am I doing".
    await expect(page.getByText(/to tier 3/i).first()).toBeVisible();

    // Two rails, not one list: the free column and the season's own, drawn as parallel
    // tracks so the two rungs at the same favour line up.
    await expect(page.getByText(/open to everybody/i).first()).toBeVisible();
    await expect(page.getByText(/season’s own track/i).first()).toBeVisible();

    // The purchase says its price on the button as well as in the sentence, because the
    // price is the decision and the count is the obvious half (C20's rule for the Mistgate).
    await expect(page.getByText(/900 crystals/i).first()).toBeVisible();
  });

  test('offers no purchase once the season has closed', async ({ page }) => {
    // The flag rather than a second `page.route` for the same pattern: Playwright matches
    // the most recently registered handler first, so a second one registered *before*
    // `openSeason` is silently overridden — which is a stub that looks installed and is not.
    await openSeason(page, { live: false });
    await registerRaw(page, 'e2epass4', 'Lateseason');
    await chooseStarter(page);

    await dockEntry(page, 'Vale Pass').click();
    await placeCard(page, 'Vale Pass').click();

    // A permanently disabled button on a closed season reads as something broken; the
    // sentence that replaces it says which of the two reasons it is (C20's rule again).
    await expect(page.getByText(/season has closed/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /take it up/i })).toHaveCount(0);
  });
});
