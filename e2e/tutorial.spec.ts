import { expect, test, type Page } from '@playwright/test';
import { leaveTutorial, resolveBattle } from './support';

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

    // The one place in the suite where the playback itself is the subject.
    //
    // Auto resolves the whole fight in a single response, and the results modal used to
    // open on *that* — about three seconds in, on top of a HUD still reading "Turn 0".
    // Every battle in the game gave its outcome away before it was watched, and the cold
    // open's tuned near-death beat was never once seen. So: the fight must be visibly
    // under way with the outcome still hidden.
    const results = page.getByRole('dialog', { name: 'Results' });
    await expect(page.getByText(/^Wave \d+ · Turn [1-9]/)).toBeVisible({ timeout: 30_000 });
    await expect(results).toBeHidden();

    // And Skip is the deliberate way past the rest of it — the battle's own Skip, not the
    // Wardenmaster's, which is why the two are named apart.
    await page.getByRole('button', { name: /^skip$/i }).click();
    await expect(results).toBeVisible({ timeout: 30_000 });
    await expect(results).toContainText(/victory/i);

    // The results sit *over* the parchment — the overlay is deliberately below modals so
    // the starter choice can land on top of it — so they are read and dismissed first.
    await results.getByRole('button', { name: /^close$/i }).click();
    await expect(results).toBeHidden({ timeout: 20_000 });

    // The step it was waiting on is finished, so Continue lights up.
    const advance = overlay.getByRole('button', { name: /continue/i });
    await expect(advance).toBeEnabled({ timeout: 30_000 });
    await advance.click();

    await expect(overlay).toContainText('2 / 15', { timeout: 20_000 });
  });

  test('marks the things a step can point at', async ({ page }) => {
    test.slow();
    await arrive(page, 'e2th');
    // Off the battle screen, which is a takeover and deliberately has no dock — the keys
    // a later step names live on the shell the player spends the rest of the game in.
    await leaveTutorial(page);
    await expect(page.getByRole('dialog', { name: /choose your first champion/i })).toBeVisible({
      timeout: 20_000,
    });

    const marked = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-mv-highlight]'), (node) =>
        node.getAttribute('data-mv-highlight'),
      ),
    );
    // The dock the script sends people around, and the modal step three points at.
    expect(marked).toContain('dock:campaign');
    expect(marked).toContain('dock:depths');
    expect(marked).toContain('modal:starter-choice');
  });

  test('celebrates the first thing the script opens', async ({ page }) => {
    test.slow();
    test.setTimeout(240_000);
    await arrive(page, 'e2tc');

    const overlay = page.getByRole('region', { name: 'Tutorial' });
    await expect(overlay).toBeVisible({ timeout: 20_000 });

    // Step 1: the cold open. It pays nothing — the account is still level 1 after it.
    await page.getByRole('button', { name: /meet them on the road/i }).click();
    await resolveBattle(page);
    const results = page.getByRole('dialog', { name: 'Results' });
    await expect(results).toBeVisible({ timeout: 60_000 });
    await results.getByRole('button', { name: /^close$/i }).click();
    await advance(page);

    // Step 2: the Wardenmaster's greeting, and the first XP of the game.
    await advance(page);

    // Step 3: the starter choice. Sixty more XP takes the account to level 2, which is
    // where the calendar opens — the first gate the game has ever crossed for anybody.
    const starterDialog = page.getByRole('dialog', { name: /choose your first champion/i });
    await expect(starterDialog).toBeVisible({ timeout: 30_000 });
    await starterDialog
      .getByRole('button', { name: /^choose /i })
      .first()
      .click();
    await starterDialog.getByRole('button', { name: /stand together/i }).click();
    await expect(starterDialog).toBeHidden({ timeout: 20_000 });
    await advance(page);

    const celebration = page.getByRole('dialog', { name: /the mist thins/i });
    await expect(celebration).toBeVisible({ timeout: 30_000 });
    await expect(celebration).toContainText(/level 2/i);
    await expect(celebration).toContainText(/calendar/i);

    // And it is a one-off: dismissed, it does not come back on a reload.
    await celebration.getByRole('button', { name: /later/i }).click();
    await expect(celebration).toBeHidden();
    await page.reload();
    await expect(celebration).toBeHidden({ timeout: 20_000 });
  });

  test('a skip is final, and the overlay does not come back', async ({ page }) => {
    test.slow();
    await arrive(page, 'e2ts');

    const overlay = page.getByRole('region', { name: 'Tutorial' });
    await expect(overlay).toBeVisible({ timeout: 20_000 });

    await overlay.getByRole('button', { name: /skip tutorial/i }).click();
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

/**
 * Closes the open step once the server agrees it is finished.
 *
 * One click, always. What the step paid appears on the *next* step's card rather than
 * behind an acknowledgement, so there is no second gate to get past.
 */
async function advance(page: Page): Promise<void> {
  const button = page
    .getByRole('region', { name: 'Tutorial' })
    .getByRole('button', { name: /continue/i });
  await expect(button).toBeEnabled({ timeout: 30_000 });
  await button.click();
}

/** Registers a fresh warden and leaves them exactly where the script puts them. */
async function arrive(page: Page, account: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('tab', { name: 'New warden' }).click();
  await page.getByLabel('Account name').fill(unique(account));
  await page.getByLabel('Profile name').fill(unique('Warden'));
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Take up the lantern' }).click();
}
