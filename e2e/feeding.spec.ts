import { expect, test } from '@playwright/test';
import { chooseStarter, registerRaw } from './support';

/**
 * Feeding a champion, in a real browser.
 *
 * This file exists because the picker shipped unable to select anything and nothing
 * caught it. The library's `ChampionCard` emits **two** events for one press when it is
 * selectable — `champion:select` and then `champion:click` — and the wrapper was wired to
 * both, so every card selected itself and immediately deselected itself. The count stayed
 * at "0 selected", the Feed button never enabled, and the tutorial stopped dead at the
 * step that asks a player to feed a champion. Forty tests drove the game past it, because
 * none of them ever opened the picker.
 *
 * The arithmetic of feeding is covered at the API level (`progression.test.ts`, against a
 * real database). What only a browser can prove is that a press reaches the state: that
 * choosing a champion counts it, that choosing it again lets it go, and that the button
 * that spends them is enabled by exactly the same fact.
 *
 * The food comes from a real ×10 at the brood banner, paid for with the welcome grant a
 * real account receives — no test-only endpoint, because a back door on the production
 * server is exactly the sort of "temporary" hack the project forbids.
 */

test.describe('feeding a champion', () => {
  test('counts what is chosen, lets it go again, and spends it', async ({ page }) => {
    test.slow();
    await registerRaw(page, 'e2efeed', 'Feeder');
    await chooseStarter(page);

    // ── Something to feed ─────────────────────────────────────────────────
    await page
      .getByRole('button', { name: /^mistgate$/i })
      .first()
      .click();
    await page.getByRole('tab', { name: /faded sigil/i }).click();
    const tenPull = page.getByRole('button', { name: /summon ×10/i });
    await expect(tenPull).toBeEnabled({ timeout: 15_000 });
    await tenPull.click();

    const reveal = page.getByRole('dialog', { name: /summon results/i });
    await expect(reveal).toBeVisible({ timeout: 20_000 });
    await reveal.getByRole('button', { name: /^skip$/i }).click();
    await reveal.getByRole('button', { name: /take them in/i }).click();
    await expect(reveal).toBeHidden({ timeout: 15_000 });

    // ── The picker ────────────────────────────────────────────────────────
    await page
      .getByRole('navigation')
      .getByRole('button', { name: /^champions/i })
      .click();
    // Counted before the picker opens: it holds champion cards of its own, and they would
    // be counted too.
    const roster = () => page.getByRole('button', { name: /lv \d+ of \d+/i });
    await expect(roster().first()).toBeVisible({ timeout: 15_000 });
    const before = await roster().count();

    // ── The sheet reads what is held ──────────────────────────────────────
    //
    // Every material cost on the champion sheet — the brews the level ladder spends, the
    // essences the ascension ladder spends, the shards the awakening ladder spends — is
    // priced against the inventory store, and nothing on the way here ever filled it: it
    // was loaded by the relic screens alone. A player who came straight from the Haven was
    // told they were short the whole amount of everything, brews they had just won
    // included. Asserted as the request rather than as a number, because what is held on a
    // fresh account is a drop roll and this is about the read happening at all.
    const readsItems = page.waitForRequest(
      (request) => request.url().includes('/api/player/items'),
      { timeout: 15_000 },
    );

    // The strongest is the starter — the brood are food and sort below it.
    await roster().first().click();
    await readsItems;

    // The level ladder's own button. It said "Feed for experience" until the four ladders
    // landed and the words moved to the row above it.
    await page.getByRole('button', { name: /^feed$/i }).click();

    // By the dialog's own name, not by its text: the champion sheet underneath carries the
    // button that opened this one, so a text filter matches both.
    const picker = page.getByRole('dialog', { name: /feed for experience/i });
    await expect(picker).toBeVisible({ timeout: 15_000 });
    const food = picker.locator('.fui-champ');
    await expect(food.first()).toBeVisible({ timeout: 15_000 });

    const feed = picker.getByRole('button', { name: /^feed$/i });
    await expect(picker.getByText(/^0 selected$/)).toBeVisible();
    await expect(feed).toBeDisabled();

    // One press, one selection — the regression itself.
    await food.nth(0).click();
    await expect(picker.getByText(/^1 selected$/)).toBeVisible({ timeout: 5_000 });
    await expect(feed).toBeEnabled();

    await food.nth(1).click();
    await expect(picker.getByText(/^2 selected$/)).toBeVisible({ timeout: 5_000 });

    // And it is a toggle, not a ratchet.
    await food.nth(1).click();
    await expect(picker.getByText(/^1 selected$/)).toBeVisible({ timeout: 5_000 });
    await expect(feed).toBeEnabled();

    // ── The picker fits inside its own frame ──────────────────────────────
    //
    // It did not: the painted card is a fixed 150px and the grid's tracks were 128px, so
    // every row drew out through the ornament and the dialog grew a horizontal scrollbar.
    const spill = await page.evaluate(() => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
      const dialog = dialogs[dialogs.length - 1];
      const grid = dialog?.querySelector('.fui-champ')?.closest('div[class*="grid"]');
      if (!dialog || !grid) return null;
      return {
        outside: Math.round(
          grid.getBoundingClientRect().right - dialog.getBoundingClientRect().right,
        ),
        sideways: grid.scrollWidth - grid.clientWidth,
      };
    });
    expect(spill, 'the picker has a grid inside a dialog').not.toBeNull();
    expect(spill!.outside, 'card grid drawn past the dialog edge').toBeLessThanOrEqual(0);
    expect(spill!.sideways, 'card grid scrolls sideways').toBe(0);

    // ── And *all* the food is really eaten ────────────────────────────────
    //
    // This used to feed one, which is the half of it that worked. Selecting three and
    // spending three is the owner's report and a much older bug underneath it: the React
    // bridge kept `optionsRef` in an effect keyed on a shallow comparison that skips
    // functions, so a render changing only a closure never refreshed it. The Feed button's
    // one other moving prop is `disabled`, which flips on the *first* pick — so every pick
    // after that left the handler behind, and pressing Feed sent whatever had been chosen
    // when the button stopped being disabled. Exactly one champion, every time.
    //
    // It looked like a broken feed and was a broken bridge, under every painted control in
    // the game. Asserted here because this is the screen where a stale handler is visible
    // as a wrong *number* rather than as nothing happening.
    await food.nth(1).click();
    await food.nth(2).click();
    await expect(picker.getByText(/^3 selected$/)).toBeVisible({ timeout: 5_000 });

    await feed.click();
    await expect(picker).toBeHidden({ timeout: 20_000 });
    await expect.poll(async () => roster().count(), { timeout: 20_000 }).toBe(before - 3);
  });
});
