import { expect, test } from '@playwright/test';
import {
  chooseStarter,
  dismissUnlocks,
  openCampaignStage,
  registerRaw,
  resolveBattle,
} from './support';

/**
 * The game remembers what you sent, and how you like to watch.
 *
 * Every fight in Mistvale used to start from four empty slots, on every stage of every
 * evening — while the four champions a player actually uses change about once a week. The
 * owner's note (2026-08-20) was the plain one: *the game should remember.* Same for Auto
 * and speed, which reset to "off" and "×1" on every new fight and on every reload.
 *
 * None of it is game state: the server still decides every outcome, and it re-checks the
 * team on the way in. What is asserted here is that the *client* stops asking the same
 * question twice (`state/loadoutStore.ts`).
 */

test.describe('the game remembers', () => {
  test('opens the next stage on the team that just fought, and keeps Auto and speed', async ({
    page,
  }) => {
    test.slow();
    await registerRaw(page, 'e2eload', 'Habit');
    await chooseStarter(page);

    // ── Fight 1-1 with a team the player picks by hand ────────────────────
    await page
      .getByRole('button', { name: /^campaign$/i })
      .first()
      .click();
    await openCampaignStage(page, '1-1');

    const first = page.getByRole('dialog', { name: /stage 1/i });
    await expect(first).toBeVisible();
    // Nothing has been sent yet, so nothing is suggested.
    await expect(first.locator('[data-filled="true"]')).toHaveCount(0);

    await first
      .getByRole('button', { name: /lv \d+/i })
      .first()
      .click();
    await expect(first.locator('[data-filled="true"]')).toHaveCount(1);
    await first.getByRole('button', { name: /into the mist/i }).click();

    // ── Auto and ×2, set once, in this fight ──────────────────────────────
    const auto = page.locator('.fui-battlectl__auto');
    await expect(auto).toBeVisible({ timeout: 30_000 });
    await auto.click();
    await expect(auto).toHaveAttribute('aria-pressed', 'true');
    // ×2 off the ladder rather than the library's cycling button, which C8 hid: a rung an
    // account has not earned was invisible on it, so `ui/SpeedLadder` draws them all.
    await page.getByRole('button', { name: /^×2 speed$/i }).click();

    await resolveBattle(page);
    const results = page.getByRole('dialog', { name: /victory|defeat|withdrawn/i });
    await expect(results).toBeVisible({ timeout: 60_000 });
    await results.getByRole('button', { name: /back to the campaign/i }).click();
    await dismissUnlocks(page);
    await expect(results).toBeHidden();

    // ── The next stage opens on the same team ─────────────────────────────
    await openCampaignStage(page, '1-1');
    const second = page.getByRole('dialog', { name: /stage 1/i });
    await expect(second).toBeVisible();
    await expect(
      second.locator('[data-filled="true"]'),
      'the dialog opens on the team that just fought',
    ).toHaveCount(1);
    // And it is a suggestion, not a lock: it can still be emptied.
    await second.locator('[data-filled="true"]').first().click();
    await expect(second.locator('[data-filled="true"]')).toHaveCount(0);
    await second
      .getByRole('button', { name: /^×$|close/i })
      .first()
      .click();

    // ── And the preferences survive a reload, not merely a screen change ──
    await page.reload();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible({ timeout: 30_000 });
    await dismissUnlocks(page);
    await page
      .getByRole('button', { name: /^campaign$/i })
      .first()
      .click();
    await openCampaignStage(page, '1-1');
    const third = page.getByRole('dialog', { name: /stage 1/i });
    await expect(third.locator('[data-filled="true"]'), 'the team survives a reload').toHaveCount(
      1,
    );
    await third.getByRole('button', { name: /into the mist/i }).click();

    // Auto engages itself, and the speed is the one that was chosen — both read off the
    // controls rather than off the store, because the controls are what a player sees.
    await expect(page.locator('.fui-battlectl__auto')).toHaveAttribute('aria-pressed', 'true', {
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: /^×2 speed$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
      { timeout: 15_000 },
    );
  });
});
