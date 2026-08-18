import { expect, test, type Page } from '@playwright/test';
import { PASSWORD, unique, leaveTutorial } from './support';

/**
 * A brand-new account, on every screen it can reach.
 *
 * The zero-content pass (ROADMAP P9). Everything else in the suite tests a feature with
 * its content present; this one tests the state every account passes through and most
 * bugs hide in — no champions, no relics, no clears, no silver, nothing farmed, nothing
 * unlocked. A screen that assumes a first element, a highest star or a non-empty list
 * throws here and nowhere else, and it throws for every player on their first evening.
 *
 * What it asserts is deliberately shallow and broad: each screen renders, says something,
 * and does not put an error in front of somebody who has done nothing wrong. Depth belongs
 * in the specs that own each feature.
 */

/** Every dock destination a level-1 account can actually open. */
const OPEN_AT_LEVEL_ONE = ['Haven', 'Campaign', 'Champions', 'Relics', 'Mistgate'] as const;

/** Shrouded at level 1 — the mist-teasers, which must say when they open rather than sulk. */
const SHROUDED_AT_LEVEL_ONE = [
  { label: 'The Depths', level: 10 },
  { label: 'Arena', level: 8 },
  { label: 'Chronicle', level: 9 },
  { label: 'Bazaar', level: 5 },
  { label: 'Quests', level: 4 },
  { label: 'Missions', level: 4 },
  { label: 'Events', level: 7 },
  { label: 'Calendar', level: 2 },
] as const;

test.describe('a brand-new account', () => {
  test('can open every screen it is allowed into, with nothing in any of them', async ({
    page,
  }) => {
    test.slow();
    test.setTimeout(180_000);
    await arrive(page);

    for (const label of OPEN_AT_LEVEL_ONE) {
      await page.getByRole('button', { name: label, exact: true }).first().click();
      // Something rendered, and it is not an error. `alert` is what every screen in the
      // client uses to report a failure, so its absence is the assertion that matters.
      await expect(page.getByRole('main')).not.toBeEmpty();
      await expect(page.getByRole('alert')).toHaveCount(0);
    }
  });

  test('shows the shrouded stations, each saying when it opens', async ({ page }) => {
    test.slow();
    await arrive(page);

    for (const { label, level } of SHROUDED_AT_LEVEL_ONE) {
      const tile = page.getByRole('button', { name: label, exact: true }).first();
      await expect(tile, label).toHaveAttribute('aria-disabled', 'true');
      // A locked door that does not say when it opens is just a locked door.
      await expect(tile, label).toHaveAttribute('title', new RegExp(`level ${level}`, 'i'));
    }
  });

  test('opens the errands in the top bar with nothing in them', async ({ page }) => {
    test.slow();
    await arrive(page);

    await page.getByRole('button', { name: 'Mail' }).click();
    await expect(page.getByRole('main')).toContainText(/nothing has arrived/i);
    await expect(page.getByRole('alert')).toHaveCount(0);

    await page.getByRole('button', { name: 'News' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /close/i }).first().click();

    await page.getByRole('button', { name: /your profile card/i }).click();
    // A card for somebody who has done nothing still has to be a card: a level, an arena
    // standing they have never fought for, and a furthest stage that is a dash.
    await expect(page.getByRole('dialog')).toContainText(/level\s*1/i);
    await expect(page.getByRole('dialog')).toContainText(/unblooded/i);
  });

  test('has an empty vault and an unwalked map, and says so plainly', async ({ page }) => {
    test.slow();
    await arrive(page);

    // Nothing has dropped yet, and the copy has to say where relics come from rather than
    // leaving a blank grid.
    await page.getByRole('button', { name: 'Relics', exact: true }).first().click();
    await expect(page.getByRole('main')).toContainText(/no relics yet/i);

    // The map is drawn but nothing on it has been cleared.
    await page.getByRole('button', { name: 'Campaign', exact: true }).first().click();
    await expect(page.getByRole('main')).toContainText(/veilwood fringe/i);

    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  /**
   * There is deliberately no test for an empty *roster*.
   *
   * It cannot be reached: the starter choice is a modal with no dismiss, so an account
   * with no champions is always looking at the one screen that fixes that. The Champions
   * screen keeps its "No champions yet" copy as a guard rather than a state — if a future
   * change ever makes an empty roster reachable, the screen already has something to say.
   */
});

/** A fresh warden, out of the tutorial, with or without a starter chosen. */
async function arrive(page: Page, options: { starter?: boolean } = {}): Promise<void> {
  await page.goto('/');
  await page.getByRole('tab', { name: 'New warden' }).click();
  await page.getByLabel('Account name').fill(unique('e2new'));
  await page.getByLabel('Profile name').fill(unique('Fresh'));
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Take up the lantern' }).click();
  await leaveTutorial(page);

  const starterDialog = page.getByRole('dialog', { name: /choose your first champion/i });
  await expect(starterDialog).toBeVisible({ timeout: 20_000 });
  if (options.starter === false) return;

  await starterDialog
    .getByRole('button', { name: /^choose /i })
    .first()
    .click();
  await starterDialog.getByRole('button', { name: /stand together/i }).click();
  await expect(starterDialog).toBeHidden({ timeout: 20_000 });
}
