import { expect, test } from '@playwright/test';
import { chooseStarter, registerRaw } from './support';

/**
 * Imprint and Standing, in a real browser.
 *
 * The ladders are pinned in `standing.test.ts` and the counting in `account.test.ts`, both
 * exactly. What is left for a browser is the pair of rules that decide whether either
 * feature is *legible*, and both of them are about what happens when a player has earned
 * nothing yet:
 *
 *  - Standing is drawn from the first champion, with the first tier named — it is how the
 *    system is discovered, and a panel that appears only once it is already paying would
 *    teach nobody to aim for it.
 *  - The **Collection** column is drawn only when there is something in it. A fifth column
 *    of dashes costs a fifth of the table's width and teaches nothing.
 *
 * Both are deterministic on a fresh account, which is the point: the interesting states
 * (four copies, a full tier) need a collection nothing a new warden can do in one session
 * will build, so they are proven against the database rather than farmed for here.
 */

test.describe('a collection', () => {
  test('names what breadth is worth from the very first champion', async ({ page }) => {
    await registerRaw(page, 'e2estand', 'Collector');
    await chooseStarter(page);

    await page
      .getByRole('button', { name: /^champions$/i })
      .first()
      .click();

    // Standing is words rather than an action, so it lives behind the title bar's info
    // button — the rule every screen has followed since B1.
    await page
      .getByRole('button', { name: /your champions/i })
      .first()
      .click();

    const panel = page.getByText(/holding 1 champion\b/i);
    await expect(panel).toBeVisible({ timeout: 15_000 });
    // …and says what the first tier wants, which is the only reason to read it at zero.
    await expect(page.getByText(/\d+ more for the next tier/i)).toBeVisible();
  });

  test('leaves the collection column off a champion that has earned none', async ({ page }) => {
    await registerRaw(page, 'e2estand2', 'Novice');
    await chooseStarter(page);

    await page
      .getByRole('button', { name: /^champions$/i })
      .first()
      .click();
    await page.getByText('Anuria', { exact: true }).first().click();

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('columnheader', { name: /masteries/i })).toBeVisible({
      timeout: 15_000,
    });
    // One copy of one champion earns nothing on either ladder, so the column is not drawn.
    await expect(sheet.getByRole('columnheader', { name: /collection/i })).toHaveCount(0);
    // Nor is the imprint card: a single copy is every champion's starting state and says
    // nothing worth a panel.
    await expect(sheet.getByRole('region', { name: /imprint/i })).toHaveCount(0);
  });
});
