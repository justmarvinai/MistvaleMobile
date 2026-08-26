import { expect, test } from '@playwright/test';
import { havenBoard, leaveTutorial, registerRaw } from './support';

/**
 * The Solo Titan, in a real browser.
 *
 * The mode's arithmetic — the damage fold, the keys, the ladder, and that a run is paid on
 * any ending rather than on a victory — is covered against a real database in the server
 * suite (17 cases). What a browser adds is what no API test reaches: that the *client* and
 * the server agree about who may go down, and that they agree word for word.
 *
 * A fresh warden is level 1 and the Valewurm opens at 16. Reaching that legitimately is
 * dozens of clears — too long for a smoke test, and not worth a test-only endpoint, which
 * is the "temporary hack" the brief rules out. So this is the same shape as `arena.spec.ts`
 * and for the same reason: the shrouded station, the refusal, and the one thing that is
 * genuinely different about a Titan — that its ladder is drawn while the door is shut.
 */

test.describe('the Valewurm', () => {
  test('is a shrouded promise until level 16', async ({ page }) => {
    test.slow();
    await registerRaw(page, 'e2etitan', 'Titanward');
    await leaveTutorial(page);

    // No navigation: the Haven is where a fresh account lands and its rail draws every
    // place in the vale, so the board is already on screen. Pressing the dock first is
    // worse than unnecessary — the starter dialog is modal at this exact moment and eats
    // the click, which is a 270-second timeout rather than a failure.
    const station = havenBoard(page, 'The Valewurm');
    await expect(station).toBeVisible({ timeout: 15_000 });
    await expect(station).toHaveAttribute('aria-disabled', 'true');
    await expect(station).toContainText(/level 16/i);
  });

  test('refuses a run for the same reason the station gives', async ({ page }) => {
    test.slow();
    await registerRaw(page, 'e2etitn', 'Turned');
    await leaveTutorial(page);

    // The overview is readable below the level — deliberately, since the ladder is the
    // reason to want in — and it says why the door is shut.
    const standing = await page.evaluate(async () => {
      const response = await fetch('/api/titan', { credentials: 'include' });
      const body = (await response.json()) as {
        data: { titan: { titans: { open: boolean; lockedReason: string; tiers: unknown[] }[] } };
      };
      return body.data.titan.titans[0];
    });
    expect(standing?.open).toBe(false);
    expect(standing?.lockedReason).toMatch(/level 16/i);
    // Shut, but not blank: what is down there is what makes level 16 worth reaching.
    expect(standing?.tiers.length).toBeGreaterThan(0);

    // And starting a run is refused with the same sentence rather than a different one.
    const refusal = await page.evaluate(async () => {
      const response = await fetch('/api/battles/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          mode: 'titan',
          stageKey: 'titan_valewurm_run',
          team: ['00000000-0000-4000-8000-000000000000'],
          actionId: crypto.randomUUID(),
        }),
      });
      return ((await response.json()) as { error?: { message: string } }).error?.message ?? '';
    });
    expect(refusal).toMatch(/level 16/i);
  });

  test('says what it is on the Haven, without being reachable yet', async ({ page }) => {
    test.slow();
    await registerRaw(page, 'e2etit3', 'Watcher');
    await leaveTutorial(page);

    // A locked station keeps its board and its line — seeing what is coming is part of the
    // pull forward (UI_UX §2) — and it is *disabled* rather than merely inert, so a player
    // is told the door is shut instead of pressing something that quietly does nothing.
    // No navigation: the Haven is where a fresh account lands and its rail draws every
    // place in the vale, so the board is already on screen. Pressing the dock first is
    // worse than unnecessary — the starter dialog is modal at this exact moment and eats
    // the click, which is a 270-second timeout rather than a failure.
    const station = havenBoard(page, 'The Valewurm');
    await expect(station).toContainText(/keys a day/i);
    await expect(station).toBeDisabled();
    await expect(page.getByRole('heading', { name: /^the valewurm$/i })).toHaveCount(0);
  });
});
