import { expect, test } from '@playwright/test';
import {
  dismissUnlocks,
  leaveTutorial,
  openCampaignStage,
  pickTeam,
  resolveBattle,
} from './support';

/**
 * The sandbox, in a real browser.
 *
 * Practice is the one affordance that only exists *after* something else has happened — a
 * stage nobody has cleared cannot be practised — so this drives the whole sequence: clear
 * 1-1, come back to it, and find the button that was not there before.
 *
 * Multi-battle deliberately has no browser coverage. It opens at account level 6 and a
 * fresh registration is level 1, so the farm control is genuinely absent here; driving it
 * would mean levelling an account through the UI, which is a slower and less honest test
 * than the server suite's, where the allowance, the trims and the retry are all checked
 * against the ledger. What *is* checked here is that it stays hidden at level 1 — the half
 * a browser can actually see.
 */

const password = 'a-good-long-password';

function unique(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

test.describe('the practice sandbox', () => {
  test('appears once a stage is cleared, and costs nothing when it is used', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('tab', { name: 'New warden' }).click();
    await page.getByLabel('Account name').fill(unique('e2e'));
    await page.getByLabel('Profile name').fill(unique('Warden'));
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Take up the lantern' }).click();

    // Out of the tutorial: this spec is about what comes after it.
    await leaveTutorial(page);

    const starterDialog = page.getByRole('dialog', { name: /choose your first champion/i });
    await expect(starterDialog).toBeVisible({ timeout: 20_000 });
    await starterDialog
      .getByRole('button', { name: /^choose /i })
      .first()
      .click();
    await starterDialog.getByRole('button', { name: /stand together/i }).click();
    await expect(starterDialog).toBeHidden({ timeout: 15_000 });

    await page
      .getByRole('button', { name: /^campaign$/i })
      .first()
      .click();
    // The campaign opens on the vale — twelve chapter markers — and the chapter is a page
    // behind one of them, so what proves the screen arrived is the chapter's *name* on the
    // map rather than a heading that only the chapter page has.
    await expect(page.getByRole('main')).toContainText(/veilwood fringe/i, {
      timeout: 15_000,
    });

    const openStage = async () => {
      await openCampaignStage(page, '1-1');
      const dialog = page.getByRole('dialog', { name: /stage 1/i });
      await expect(dialog).toBeVisible();
      await pickTeam(dialog);
      return dialog;
    };

    // ── Clear it the ordinary way ─────────────────────────────────────────
    // The starter beats 1-1 comfortably, but a fight is a fight: retry rather than let a
    // rare loss fail a test about something else.
    let won = false;
    for (let attempt = 0; attempt < 3 && !won; attempt += 1) {
      const dialog = await openStage();
      await dialog.getByRole('button', { name: /into the mist/i }).click();

      await resolveBattle(page);

      const results = page.getByRole('dialog', { name: /victory|defeat|withdrawn/i });
      await expect(results).toBeVisible({ timeout: 60_000 });
      won = await results.getByText(/victory/i).isVisible();
      await results.getByRole('button', { name: /back to the campaign/i }).click();
      await dismissUnlocks(page);
      await expect(results).toBeHidden();
    }
    expect(won, 'the starter could not clear 1-1 in three attempts').toBe(true);

    // ── Now the sandbox is there ──────────────────────────────────────────
    const dialog = await openStage();
    await expect(dialog.getByText(/no energy, no rewards, no risk/i)).toBeVisible();
    // Farming is level-gated, so a fresh account must not be shown the control at all.
    await expect(dialog.getByText(/farm without watching/i)).toHaveCount(0);

    const energyBefore = await dialog.getByText(/you have \d+/i).textContent();
    await dialog.getByRole('button', { name: /^practise$/i }).click();

    await resolveBattle(page);

    const practiceResults = page.getByRole('dialog', { name: /^practice$/i });
    await expect(practiceResults).toBeVisible({ timeout: 60_000 });
    await expect(practiceResults.getByText(/no energy spent, nothing earned/i)).toBeVisible();
    await practiceResults.getByRole('button', { name: /back to the campaign/i }).click();
    await dismissUnlocks(page);

    // The energy line reads the same as it did before the practice fight, which is the
    // player-visible form of "the sandbox is free".
    const after = await openStage();
    await expect(after.getByText(/you have \d+/i)).toHaveText(energyBefore ?? '');
  });
});
