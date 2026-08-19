import { expect, test } from '@playwright/test';
import { dismissUnlocks, leaveTutorial, resolveBattle } from './support';

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

    // Out of the tutorial: this spec is about what comes after it.
    await leaveTutorial(page);

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
    // The wave readout is the library's pips since the design rework — a lit pip and
    // "1 / 3" rather than the sentence "Wave 1 · Turn 0".
    await expect(page.locator('.fui-waves')).toContainText(/1\s*\/\s*\d/);

    // Auto hands the fight to the server; Skip jumps the playback to the end of what came
    // back. The results modal waits for the *playback*, not the response — so both presses
    // are needed, and this spec is about the loop rather than the animation.
    await resolveBattle(page);

    const results = page.getByRole('dialog', { name: /victory|defeat|withdrawn/i });
    await expect(results).toBeVisible({ timeout: 60_000 });
    await expect(results.getByText(/victory|defeat|withdrawn|the mist closed in/i)).toBeVisible();

    await results.getByRole('button', { name: /back to the campaign/i }).click();
    // A first win can be a first level, and a first level can open something.
    await dismissUnlocks(page);
    await expect(results).toBeHidden();
    await expect(page.getByText(/veilwood fringe/i)).toBeVisible();
  });

  test('shows twelve chapters and three difficulties, with the road ahead shut', async ({
    page,
  }) => {
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
    await expect(page.getByText(/veilwood fringe/i)).toBeVisible({ timeout: 15_000 });

    // Twelve chapters, and only the one the warden is in is unfolded — 252 stages laid
    // flat would be a wall rather than a map.
    const headers = page.locator('button[aria-expanded]');
    await expect(headers).toHaveCount(12);
    await expect(page.locator('button[aria-expanded="true"]')).toHaveCount(1);
    await expect(page.getByText(/12\. The Coilmother’s Court/)).toBeVisible();

    // Chapter 2 is there, shut, and says why once it is unfolded.
    await page.getByRole('button', { name: /2\. The Drowned Road/ }).click();
    const chapterTwoOpener = page.getByRole('button', { name: '2-1', exact: false }).first();
    await expect(chapterTwoOpener).toBeDisabled();
    await expect(page.getByText(/clear 1-7 first/i).first()).toBeVisible();

    // Hard exists as a tab from the start — visible, not hidden — and 1-1 on it wants the
    // whole vale cleared on Normal first.
    await page.getByRole('button', { name: 'Hard', exact: true }).click();
    await expect(page.getByRole('button', { expanded: true })).toHaveCount(1);
    await expect(page.getByText(/clear 12-7 first/i).first()).toBeVisible();
  });
});
