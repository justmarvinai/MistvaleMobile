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

  test('offers a fader for each of the two things that make noise', async ({ page }) => {
    // This asserted the opposite until the owner's audio pack landed: that the panel said
    // out loud there was no soundtrack, which was the honest thing to say while the music
    // bus was a fader with nothing behind it. There are two tracks now, so the sentence had
    // to go and the controls had to stay — both sliders present, neither claiming silence.
    await registerRaw(page, 'e2esnd', 'Listener');

    // `registerRaw` stops with the starter choice open, and that dialog has no dismiss —
    // deliberately, since an account with no champions is always looking at the one screen
    // that fixes that. Its backdrop owns every click until a champion is taken, which is
    // the modal stack working rather than getting in the way.
    const starter = page.getByRole('dialog', { name: /choose your first champion/i });
    await expect(starter).toBeVisible({ timeout: 20_000 });
    await starter
      .getByRole('button', { name: /^choose /i })
      .first()
      .click();
    await starter.getByRole('button', { name: /stand together/i }).click();
    await expect(starter).toBeHidden({ timeout: 15_000 });

    await page
      .getByRole('button', { name: /settings/i })
      .first()
      .click();
    const settings = page.getByRole('dialog', { name: /settings/i });
    await expect(settings).toBeVisible({ timeout: 15_000 });

    await expect(settings.getByRole('slider', { name: /^music$/i })).toBeVisible();
    await expect(settings.getByRole('slider', { name: /^sound effects$/i })).toBeVisible();
    await expect(settings.getByText(/no soundtrack yet/i)).toHaveCount(0);
  });
});
