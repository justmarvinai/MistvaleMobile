import { expect, test, type Page } from '@playwright/test';

/**
 * The first hour, in a real browser.
 *
 * The engine underneath is covered exhaustively against a real database (28 cases in
 * `tutorial.test.ts`). What a browser adds is the half that has no server in it: that a
 * fresh account is *taken* to the cold open rather than dropped on an empty screen, that
 * the parchment says what the step says, that the highlight finds the thing it names, and
 * that Continue is dark until the server agrees the step is done.
 *
 * This is the one spec that does **not** skip the tutorial — every other one does, because
 * they are about something else.
 */

const password = 'a-good-long-password';

function unique(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

test.describe('the tutorial', () => {
  test('opens on the Wardenmaster and the fight he is pointing at', async ({ page }) => {
    test.slow();
    await arrive(page, 'e2tu');

    const overlay = page.getByRole('region', { name: 'Tutorial' });
    await expect(overlay).toBeVisible({ timeout: 20_000 });
    await expect(overlay).toContainText('The Wardenmaster');
    await expect(overlay).toContainText('1 / 15');
    await expect(overlay).toContainText('Something on the road');

    // Step one is a fight, so the overlay took the player to it — and the battle screen
    // offers the only door into a battle nobody brings a team to.
    await expect(page.getByRole('button', { name: /meet them on the road/i })).toBeVisible();
    // Nothing can be continued past yet: the fight has not happened.
    await expect(overlay.getByRole('button', { name: /not yet|go and do it/i })).toBeDisabled();
  });

  test('walks the cold open and lets the player move on afterwards', async ({ page }) => {
    test.slow();
    test.setTimeout(180_000);
    await arrive(page, 'e2tw');

    const overlay = page.getByRole('region', { name: 'Tutorial' });
    await expect(overlay).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: /meet them on the road/i }).click();
    // The borrowed three are on the field, and the account still owns nobody.
    await expect(page.getByRole('button', { name: /^auto$/i })).toBeVisible({ timeout: 30_000 });
    const roster = await page.evaluate(async () => {
      const response = await fetch('/api/player/champions', { credentials: 'include' });
      const body = (await response.json()) as { data?: { champions: unknown[] } };
      return body.data?.champions.length ?? -1;
    });
    expect(roster).toBe(0);

    await page.getByRole('button', { name: /^auto$/i }).click();
    // A win, and it paid nothing — the results screen is the cue that it is over.
    await expect(page.getByText(/victory/i).first()).toBeVisible({ timeout: 120_000 });

    // The step it was waiting on is finished, so Continue lights up.
    const advance = overlay.getByRole('button', { name: /continue/i });
    await expect(advance).toBeEnabled({ timeout: 30_000 });
    await advance.click();

    await expect(overlay).toContainText('2 / 15', { timeout: 20_000 });
  });

  test('points at the thing the step names', async ({ page }) => {
    test.slow();
    await arrive(page, 'e2th');

    const overlay = page.getByRole('region', { name: 'Tutorial' });
    await expect(overlay).toBeVisible({ timeout: 20_000 });

    // Step one has no highlight — it is a fight, not a signpost — so the dim covers
    // everything and there is no ring. What matters is that the mechanism is wired: the
    // dock's tiles carry the keys a later step points at.
    const marked = await page.evaluate(() =>
      [...document.querySelectorAll('[data-mv-highlight]')].map((node) =>
        node.getAttribute('data-mv-highlight'),
      ),
    );
    expect(marked).toContain('dock:campaign');
    expect(marked).toContain('dock:depths');
  });

  test('a skip is final, and the overlay does not come back', async ({ page }) => {
    test.slow();
    await arrive(page, 'e2ts');

    const overlay = page.getByRole('region', { name: 'Tutorial' });
    await expect(overlay).toBeVisible({ timeout: 20_000 });

    await overlay.getByRole('button', { name: /^skip$/i }).click();
    await expect(overlay).toContainText(/final/i);
    await overlay.getByRole('button', { name: /skip anyway/i }).click();
    await expect(overlay).toBeHidden({ timeout: 20_000 });

    // Still gone after a reload — the decision is the server's, not the tab's.
    await page.reload();
    await expect(page.getByRole('dialog', { name: /choose your first champion/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(overlay).toBeHidden();
  });
});

/** Registers a fresh warden and leaves them exactly where the script puts them. */
async function arrive(page: Page, account: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('tab', { name: 'New warden' }).click();
  await page.getByLabel('Account name').fill(unique(account));
  await page.getByLabel('Profile name').fill(unique('Warden'));
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Take up the lantern' }).click();
}
