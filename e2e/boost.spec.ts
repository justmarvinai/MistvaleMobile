import { expect, test, type Page } from '@playwright/test';
import { chooseStarter, dismissUnlocks, registerRaw } from './support';

/**
 * The XP boost badge, and a bar that has gone past its cap (C24).
 *
 * Both are top-bar readings the server owns and the client draws, so what a browser adds
 * over the unit tests is exactly one thing: that the number and the state reach the screen
 * at all. The arithmetic behind them is pinned elsewhere — `xpBoost.test.ts` for when a
 * boost counts as running, `boost.test.ts` for how long is left, and the server suite for
 * what a boosted fight actually pays.
 *
 * The lit states are driven by **rewriting the session response**, not by a database poke.
 * A fresh account has no boost and twenty energy, and the only in-game route to either is
 * days of play; intercepting the one endpoint the shell reads its player from is the
 * honest way to ask "given this state, what does the bar say" without pretending to test
 * the grant, which the server tests already do against a real database.
 */

/**
 * Serves the real player snapshot with its own fields overwritten.
 *
 * `/api/player` rather than `/api/auth/me`: the shell signs in through the second and then
 * keeps the top bar fed from the first, which re-fetches on every action. Patching the
 * sign-in response alone changed nothing on screen — the snapshot arriving a moment later
 * simply overwrote it — which is how this spec first passed a boost through and watched the
 * badge stay dark.
 */
async function withPlayer(page: Page, patch: Record<string, unknown>): Promise<void> {
  await page.route('**/api/player', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { data?: { player?: Record<string, unknown> } };
    if (body.data?.player) Object.assign(body.data.player, patch);
    else throw new Error(`no player on the snapshot: ${JSON.stringify(body).slice(0, 200)}`);
    await route.fulfill({ response, json: body });
  });
}

const energyCell = (page: Page) => page.locator('.fui-topbar__res').first();
const badge = (page: Page) => page.getByRole('img', { name: /XP boost/i });

test.describe('the top bar', () => {
  test('shows the boost dim, and the bar inside its cap, on a fresh account', async ({ page }) => {
    test.slow();
    await registerRaw(page, 'e2ebst', 'Boost');
    await chooseStarter(page);
    await dismissUnlocks(page);

    // Drawn even when it is not running, and that is deliberate: a badge that appeared
    // only while active would teach nobody that the boost exists.
    await expect(badge(page), 'the badge is on screen from the first minute').toBeVisible();
    await expect(badge(page)).toHaveAttribute('aria-label', 'XP boost not running');

    await expect(energyCell(page)).toContainText('20/20');
  });

  test('lights the boost with the time left on it', async ({ page }) => {
    test.slow();
    await registerRaw(page, 'e2ebst2', 'Boost2');
    await chooseStarter(page);
    await dismissUnlocks(page);

    await withPlayer(page, { xpBoost: { until: new Date(Date.now() + 5_400_000).toISOString() } });
    await page.reload();

    // The multiplier comes from the content bundle, so this also proves the badge is
    // reading the same config key the server pays by rather than a number of its own.
    await expect(badge(page)).toHaveAttribute(
      'aria-label',
      /XP boost running, \+25% champion experience, 1h 29m left/,
    );
    await expect(badge(page)).toContainText('1h 29m');
  });

  test('reads a banked bar as what is held against the cap it passed', async ({ page }) => {
    test.slow();
    await registerRaw(page, 'e2ebst3', 'Boost3');
    await chooseStarter(page);
    await dismissUnlocks(page);

    await withPlayer(page, {
      energy: { value: 2_437, cap: 20, regenSeconds: 180, nextTickAt: null, fullAt: null },
    });
    await page.reload();

    // `2,437 / 20`, which is the honest reading and the one this genre uses. The cell used
    // to be handed `max: value` so it could draw a full bar, and it then said
    // "2,437 / 2,437" — a cap that does not exist, over a bank called a full bar.
    await expect(energyCell(page)).toContainText('2,437/20');
    await expect(energyCell(page), 'and it does not invent a cap').not.toContainText('2,437/2,437');
  });
});
