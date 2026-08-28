import { expect, test } from '@playwright/test';
import { chooseStarter, goToScreen, openCampaignStage, registerRaw } from './support';

/**
 * Setting a lineup, in a real browser.
 *
 * The layout is the owner's reference screen (2026-08-28): the confrontation across the
 * top, the roster underneath. What only a browser can prove about it is that the two sides
 * are *both there and both real* — a layout whose whole argument is "you can see what you
 * are walking into while you choose" is exactly the kind of claim that a unit test cannot
 * check and a stylesheet can silently break.
 *
 * The aura is the other half. Content has carried one on every champion since P1 and the
 * engine has applied it on every fight since P3, and until C22 no screen said what it was.
 * The sentence itself is pinned exactly in `ui/auraText.test.ts` against every combination
 * of the schema's four fields; what is checked here is that a real champion's real aura
 * reaches the real screen.
 *
 * Deterministic on a fresh account: every starter carries an aura, and 1-1 is the first
 * stage of the game.
 */

test.describe('the lineup screen', () => {
  test('puts both sides of the fight on screen while you choose', async ({ page }) => {
    test.slow();
    await registerRaw(page, 'e2eline', 'Marshal');
    await chooseStarter(page);

    await goToScreen(page, 'Campaign');
    await openCampaignStage(page, '1-1');
    const dialog = page.getByRole('dialog', { name: /stage 1/i });
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    const ours = dialog.getByRole('region', { name: /your team/i });
    const theirs = dialog.getByRole('region', { name: /what is waiting/i });
    await expect(ours).toBeVisible();
    await expect(theirs).toBeVisible();

    // Both sides, at once, side by side — which is the entire argument for the layout. A
    // stylesheet that broke the grid would stack them and this is what would catch it.
    const left = await ours.boundingBox();
    const right = await theirs.boundingBox();
    expect(left, 'your side is laid out').not.toBeNull();
    expect(right, 'their side is laid out').not.toBeNull();
    expect(right!.x, 'the opposition is beside your team, not under it').toBeGreaterThan(
      left!.x + left!.width - 1,
    );
    // Equal columns. The first cut had two `.field` classes in one CSS module — the
    // confrontation grid and a filter label — so the later `display: flex` overrode the
    // grid and the sides collapsed to their content inside a 1584px row: 400px against
    // 631px, with 457px of empty panel beside them.
    expect(Math.abs(left!.width - right!.width), 'the two camps are the same size').toBeLessThan(
      12,
    );

    // The enemy waves are named on their own side, before any energy is spent.
    await expect(theirs.getByText(/wave 1/i)).toBeVisible();
    // …and named *once*. The side is already headed "What is waiting"; the panel inside it
    // used to say so again, which is C12c's "a screen says its own name twice" recreated
    // the same afternoon this layout was written.
    await expect(dialog.getByText(/^what is waiting$/i)).toHaveCount(1);

    // ── The leader, and what standing there is worth ──────────────────────
    // Nobody is picked yet, so the aura row says what the slot is *for* rather than
    // pretending a bonus is running.
    await expect(ours.getByText(/whoever stands in slot one/i)).toBeVisible();

    await dialog
      .getByRole('button', { name: /lv \d+/i })
      .first()
      .click();

    // A real champion's real aura, on the screen where the leader is chosen. Every champion
    // in the seed has one, so this is deterministic without naming a stat the seed owns.
    await expect(ours.getByText(/increases .*ally .* by /i)).toBeVisible({ timeout: 10_000 });
    // The gold tag sits on slot one, because the aura above is about whoever is standing
    // there — which is the whole reason the order is the player's to choose.
    await expect(ours.getByText(/^leader$/i)).toBeVisible();
    // And the two sides are comparable at all, which needs a number on each.
    await expect(ours.getByText(/team power/i)).toBeVisible();
  });

  test('narrows the roster with the roster screen’s own controls', async ({ page }) => {
    test.slow();
    await registerRaw(page, 'e2eline2', 'Sifter');
    await chooseStarter(page);

    await goToScreen(page, 'Campaign');
    await openCampaignStage(page, '1-1');
    const dialog = page.getByRole('dialog', { name: /stage 1/i });
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    // "1 of 1" on a fresh account — the count is the screen's own answer to "did that do
    // anything", and it is why a filter is never mistaken for an empty roster (C19).
    const count = dialog.getByText(/^\d+ of \d+$/);
    await expect(count).toBeVisible();
    const total = Number((await count.innerText()).split(' of ')[1]);

    await dialog.getByRole('button', { name: /^filters$/i }).click();
    const filters = dialog.getByRole('group', { name: /narrow the roster/i });
    await expect(filters).toBeVisible();

    // Deterministic whatever the starter was, and it exercises the whole chain: the box,
    // the shared filter, the grid, the count and the empty state's own words.
    await filters.getByLabel('Name').fill('qqzzxx');
    await expect(count).toHaveText(`0 of ${total}`);
    await expect(dialog.getByText(/nothing matches that/i)).toBeVisible();

    // Reset is drawn only once something is narrowed, which is the other half of the rule.
    const reset = dialog.getByRole('button', { name: /^reset$/i });
    await expect(reset).toBeVisible();
    await reset.click();
    await expect(count).toHaveText(`${total} of ${total}`);
    await expect(reset).toBeHidden();
  });
});
