import { expect, test } from '@playwright/test';
import { goToScreen, registerRaw } from './support';

/**
 * What a player sees when a screen throws.
 *
 * React unmounts the whole tree when a render throws and nothing catches it: a white page,
 * no dock, no way back but a manual reload. Mistvale had no error boundary anywhere, over
 * sixteen screens whose content comes from a database an operator edits live — a malformed
 * entity reaching a render path is the failure this design makes *most* likely, not a
 * hypothetical one.
 *
 * The break here is inflicted from outside the app, by answering one endpoint with a shape
 * the client does not expect. Nothing in the client knows it is being tested.
 */

test.describe('a screen that breaks', () => {
  test('takes itself down and leaves the rest of the game standing', async ({ page }) => {
    await registerRaw(page, 'e2eboom', 'Unbroken');

    const starter = page.getByRole('dialog', { name: /choose your first champion/i });
    await expect(starter).toBeVisible({ timeout: 20_000 });
    await starter
      .getByRole('button', { name: /^choose /i })
      .first()
      .click();
    await starter.getByRole('button', { name: /stand together/i }).click();
    await expect(starter).toBeHidden({ timeout: 15_000 });

    // An object where the roster expects a list. It survives the fetch — the client does
    // not re-validate what the server sends — and dies in the Champions screen's first
    // `champions.filter`, which is exactly how a bad content edit would arrive.
    await page.route('**/api/player/champions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { champions: { nonsense: true } }, rev: 1 }),
      });
    });

    await goToScreen(page, 'Roster');

    const fallback = page.getByRole('alert');
    await expect(fallback).toBeVisible({ timeout: 15_000 });
    await expect(fallback).toContainText(/the mist closed over this/i);

    // The point of the screen-level boundary: the frame around it is untouched, so the
    // player walks out rather than reloading.
    await expect(page.locator('nav')).toBeVisible();
    await page.unroute('**/api/player/champions');
    await page
      .getByRole('button', { name: /^haven$/i })
      .first()
      .click();
    await expect(page.getByRole('alert')).toHaveCount(0);

    // And walking back in re-mounts it, now that the endpoint is honest again.
    await goToScreen(page, 'Roster');
    await expect(page.getByRole('button', { name: /lv \d+/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
