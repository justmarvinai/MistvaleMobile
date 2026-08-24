import { expect, test } from '@playwright/test';
import { chooseStarter, registerRaw } from './support';

/**
 * Narrowing a roster, and a Haven that stays quiet.
 *
 * The rules themselves are unit-tested (`rosterFilter.test.ts`, `whatsReady.test.ts`) —
 * both are pure functions, and that is where "not at cap means the *rank's* cap" belongs.
 * What only a browser can prove is that the controls reach them: that typing in the box
 * narrows the grid, that the count and the empty state agree with each other, and that
 * Reset puts back what was there. The screen's own history is the argument for checking —
 * the collection's picker shipped unable to select anything (`feeding.spec.ts`) because
 * nothing ever pressed it.
 *
 * The champions come from a real ×10 paid for with the welcome grant, as everywhere else
 * in this suite: no test-only endpoint, because a back door on the production server is
 * exactly the sort of "temporary" hack the project forbids.
 */

test.describe('the roster', () => {
  test('narrows, says so, and comes back', async ({ page }) => {
    test.slow();
    await registerRaw(page, 'e2erost', 'Sorter');
    await chooseStarter(page);

    // ── Something to narrow ───────────────────────────────────────────────
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

    await page
      .getByRole('navigation')
      .getByRole('button', { name: /^champions/i })
      .click();

    const filters = page.getByRole('group', { name: /narrow the roster/i });
    await expect(filters).toBeVisible({ timeout: 15_000 });

    // The count is the screen's own answer to "did that do anything", so every assertion
    // below reads it rather than counting cards — a card is a painted component and its
    // shape is the library's business.
    const count = filters.getByText(/^\d+ of \d+$/);
    const total = Number((await count.innerText()).split(' of ')[1]);
    expect(total).toBeGreaterThan(1);
    await expect(count).toHaveText(`${total} of ${total}`);

    // Every picker offers what the account holds and nothing else, so each has at least
    // "Any" and the one value a starter guarantees.
    for (const label of ['Faction', 'Element', 'Rarity', 'Role']) {
      const select = filters.getByLabel(label);
      expect(await select.locator('option').count()).toBeGreaterThan(1);
    }

    // ── A search that matches nothing ─────────────────────────────────────
    // Deterministic whatever the ×10 rolled, and it exercises the whole chain at once:
    // the box, the filter, the grid, the count and the empty state's own words.
    await filters.getByLabel('Name').fill('qqzzxx');
    await expect(count).toHaveText(`0 of ${total}`);
    await expect(page.getByText(/nothing matches that/i)).toBeVisible();

    // ── And Reset puts the roster back ────────────────────────────────────
    // Reset is drawn only once something is narrowed, which is the other half of the rule.
    const reset = filters.getByRole('button', { name: /^reset$/i });
    await expect(reset).toBeVisible();
    await reset.click();
    await expect(count).toHaveText(`${total} of ${total}`);
    await expect(reset).toBeHidden();
  });
});

test.describe('the Haven card', () => {
  test('is not drawn for an account with nothing waiting', async ({ page }) => {
    // The rule that decides whether the card is worth reading at all: a card that says
    // "0 quests, 0 keys, 0 runs" every morning is one a player stops reading by the second
    // week, and then the two mornings it has something on it are the two nobody looks.
    // A brand-new warden is below every unlock the card reports on, so there is nothing —
    // and nothing is what must be drawn.
    await registerRaw(page, 'e2eready', 'Quiet');
    await chooseStarter(page);

    await expect(page.getByRole('heading', { name: /haven/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('region', { name: /what is waiting/i })).toHaveCount(0);
  });
});
