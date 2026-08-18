import { expect, test } from '@playwright/test';
import { registerRaw } from './support';

/**
 * The settings that used to write to the server and change nothing on screen.
 *
 * A control that looks connected, persists what you tell it, and has no effect is
 * invisible to every unit test in the repository — the store updates, the request
 * succeeds, and nothing about the game is different. Two of them shipped that way and
 * both were closed in P10: the volume sliders (P10c) and this one.
 */

test.describe('preferences', () => {
  test('reduce motion reaches the document, and lifting it lets go', async ({ page }) => {
    await registerRaw(page, 'e2eset', 'Quiet');
    const root = page.locator('html');

    // Nothing set until somebody asks. The stylesheet still honours the machine's own
    // `prefers-reduced-motion` independently of this — the attribute is the *game's*
    // answer, for a player who wants a calmer interface without changing their whole OS.
    await expect(root).not.toHaveAttribute('data-mv-motion', 'reduced');

    const setMotion = (reducedMotion: boolean): Promise<unknown> =>
      page.evaluate(async (value) => {
        const response = await fetch('/api/player/settings', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ reducedMotion: value }),
          credentials: 'include',
        });
        return response.ok;
      }, reducedMotion);

    expect(await setMotion(true)).toBe(true);
    await page.reload();
    await expect(root).toHaveAttribute('data-mv-motion', 'reduced', { timeout: 20_000 });

    expect(await setMotion(false)).toBe(true);
    await page.reload();
    await expect(root).not.toHaveAttribute('data-mv-motion', 'reduced');
  });

  test('says out loud that there is no soundtrack yet', async ({ page }) => {
    // The music bus, its fader and the stored setting are all real; there is no track.
    // A slider that does nothing without saying so is worse than no slider, and this is
    // the sentence that keeps it honest until a track exists (USER_QUESTIONS Q4).
    await registerRaw(page, 'e2esnd', 'Listener');

    await page
      .getByRole('button', { name: /settings/i })
      .first()
      .click();
    const settings = page.getByRole('dialog', { name: /settings/i });
    await expect(settings).toBeVisible({ timeout: 15_000 });

    await expect(settings.getByRole('slider', { name: /^music$/i })).toBeVisible();
    await expect(settings.getByText(/no soundtrack yet/i)).toBeVisible();
  });
});
