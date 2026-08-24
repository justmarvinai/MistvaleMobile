import { expect, test } from '@playwright/test';
import { chooseStarter, registerRaw } from './support';

/**
 * Trials, in a real browser.
 *
 * The mechanics — the par paid once, the chain, the same seed twice, multi-battle refused —
 * are pinned in `trials.test.ts` against a real database, where a clear can be recorded at
 * any turn count without playing sixteen turns of a puzzle. What only a browser can answer
 * is whether the mode *reads* on an account that has not reached it, and that is
 * deterministic on a fresh warden: trials open at level 9, and nothing a new account can do
 * in one session gets there.
 *
 * Both halves matter. A locked station has to stay visible and say when it opens — a feature
 * nobody can see is a feature nobody aims for — and the screen behind it has to be safe and
 * legible with nothing on it, which is P9d's zero-content rule applied to the newest screen.
 */

test.describe('trials', () => {
  test('are named in the dock, with the level that opens them', async ({ page }) => {
    await registerRaw(page, 'e2etrial', 'Solver');
    await chooseStarter(page);

    const entry = page.getByRole('navigation').getByRole('button', { name: /^trials$/i });
    await expect(entry).toBeVisible({ timeout: 15_000 });
    await expect(entry).toBeDisabled();
  });

  test('say what they are for on an account that cannot attempt one yet', async ({ page }) => {
    await registerRaw(page, 'e2etrial2', 'Apprentice');
    await chooseStarter(page);

    await page
      .getByRole('button', { name: /^haven$/i })
      .first()
      .click();
    const board = page.getByRole('button', { name: /trials/i }).first();
    await expect(board).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/level 9/i).first()).toBeVisible();
  });
});
