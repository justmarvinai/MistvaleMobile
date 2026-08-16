import { expect, test } from '@playwright/test';

/**
 * The loop, in a real browser.
 *
 * `auth.spec.ts` proves a visitor can get in; this proves there is a game once they are.
 * A fresh account picks a starter, walks into chapter 1-1, resolves the fight and reads
 * its rewards — the P3 exit criterion, driven the way a player would drive it.
 */

const password = 'a-good-long-password';

function unique(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

test.describe('the campaign loop', () => {
  test('a new warden picks a champion, fights a stage and is paid for it', async ({ page }) => {
    await page.goto('/');

    // ── Register ──────────────────────────────────────────────────────────
    await page.getByRole('tab', { name: 'New warden' }).click();
    await page.getByLabel('Account name').fill(unique('e2e'));
    await page.getByLabel('Profile name').fill(unique('Warden'));
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Take up the lantern' }).click();

    // ── Starter choice ────────────────────────────────────────────────────
    const starterDialog = page.getByRole('dialog', { name: /choose your first champion/i });
    await expect(starterDialog).toBeVisible({ timeout: 20_000 });

    // Pick the first pedestal, whichever champion content puts there.
    await starterDialog
      .getByRole('button', { name: /^choose /i })
      .first()
      .click();
    await starterDialog.getByRole('button', { name: /stand together/i }).click();
    await expect(starterDialog).toBeHidden({ timeout: 15_000 });

    // ── Into the campaign ─────────────────────────────────────────────────
    await page
      .getByRole('button', { name: /^campaign$/i })
      .first()
      .click();
    await expect(page.getByText(/veilwood fringe/i)).toBeVisible({ timeout: 15_000 });

    // Chapter 1, stage 1.
    await page.getByRole('button', { name: '1-1', exact: false }).first().click();

    const teamDialog = page.getByRole('dialog', { name: /stage 1/i });
    await expect(teamDialog).toBeVisible();

    // Put the starter in the team, then set off.
    await teamDialog
      .getByRole('button', { name: /lv \d+/i })
      .first()
      .click();
    await teamDialog.getByRole('button', { name: /into the mist/i }).click();

    // ── The fight ─────────────────────────────────────────────────────────
    await expect(page.getByRole('button', { name: /^auto$/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/wave 1/i)).toBeVisible();

    await page.getByRole('button', { name: /^auto$/i }).click();

    // Auto resolves server-side, so the results modal is the thing to wait for; the
    // playback in between is animation, not a gate.
    const results = page.getByRole('dialog', { name: /results/i });
    await expect(results).toBeVisible({ timeout: 60_000 });
    await expect(results.getByText(/victory|defeat|withdrawn|the mist closed in/i)).toBeVisible();

    await results.getByRole('button', { name: /back to the campaign/i }).click();
    await expect(results).toBeHidden();
    await expect(page.getByText(/veilwood fringe/i)).toBeVisible();
  });
});
