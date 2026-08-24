import { expect, test } from '@playwright/test';
import { chooseStarter, registerRaw } from './support';

/**
 * The mill, in a real browser.
 *
 * **What this deliberately does not do is depend on a relic dropping.** The best a fresh
 * account can reach is campaign 1-1, whose relic chance is 0.42 — so a spec that farmed
 * until something fell would be a coin flip wearing a green tick, and the flake would land
 * on whoever ran the suite next rather than on the person who wrote it.
 *
 * So the round trips — dismantling for dust, the price climbing per reroll, a refusal
 * leaving nothing spent, the ceiling — are covered where they can be covered *exactly*:
 * ten tests in `reforge.test.ts` against a real database and the real seed, and the
 * arithmetic in `stats.test.ts`. The panel itself was walked by hand against a running box
 * before it shipped.
 *
 * What is left here is the part only a browser can answer and a fresh account can reach:
 * that the currency the whole feature runs on is *visible* somewhere, and that the screen
 * still says what it is for. Both are the kind of thing a refactor quietly drops.
 */

test.describe('the mill', () => {
  test('says how much dust the vault holds, and what the vault is for', async ({ page }) => {
    await registerRaw(page, 'e2emill', 'Grinder');
    await chooseStarter(page);

    await page
      .getByRole('button', { name: /^relics$/i })
      .first()
      .click();

    const capacity = page.getByRole('group', { name: /vault capacity/i });
    await expect(capacity).toBeVisible({ timeout: 15_000 });

    // Dust has no place in the currency rail — that is for the three the whole game spends
    // — but it is earned on this screen and spent on this screen, so this is the one place
    // that has to say how much there is. Zero is the honest answer for a new warden, and
    // the row being *there* at zero is the point: it is how the feature is discovered.
    await expect(capacity.getByText(/0 reliquary dust/i)).toBeVisible();

    // And the screen still names every road out of the vault. Grinding is a fourth one,
    // and a tagline that lists three of four teaches a player the fourth does not exist.
    await expect(page.getByText(/wear it, forge it, grind it down, or sell it on/i)).toBeVisible();
  });

  test('keeps reforging behind the same gate as the forge', async ({ page }) => {
    // Reforging *is* the forge by another route, so it opens when the forge opens. A level-1
    // warden offered a button the server would refuse is the shape this project does not
    // ship, and the sentence saying why is on the screen rather than in a tooltip.
    await registerRaw(page, 'e2emill2', 'Novice');
    await chooseStarter(page);

    await page
      .getByRole('button', { name: /^relics$/i })
      .first()
      .click();
    await expect(page.getByText(/the forge opens at account level 3/i)).toBeVisible({
      timeout: 15_000,
    });
  });
});
