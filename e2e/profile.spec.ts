import { expect, test, type Page } from '@playwright/test';
import { leaveTutorial, unique } from './support';

/**
 * The public profile card, in a real browser.
 *
 * The card's contents and every showcase and avatar rule are pinned against a real database
 * (24 cases in `profile.test.ts`). What a browser adds is that the chip in the top bar
 * actually opens it — the card is only worth having if there is a way to it — and that a
 * chosen face reaches the two places it has to reach.
 */

const password = 'a-good-long-password';

test.describe('the profile card', () => {
  test('opens from the top-bar chip, and offers the owner their four', async ({ page }) => {
    test.slow();
    const profileName = await register(page, 'e2epr', 'Cardholder');

    await page.getByRole('button', { name: /your profile card/i }).click();

    const dialog = page.getByRole('dialog', { name: new RegExp(profileName, 'i') });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(/known for/i)).toBeVisible();
    await expect(dialog.getByText(/unblooded/i)).toBeVisible();

    // The starter is on the card without anybody having chosen it — a blank card would
    // teach a new player nothing.
    await expect(dialog.getByText(/lv \d+/i).first()).toBeVisible();

    // And the owner is offered the picker, which somebody else's card would not show.
    await dialog.getByRole('button', { name: /choose your four/i }).click();
    await expect(dialog.getByText(/up to four/i)).toBeVisible();

    // The picker draws the roster's own card, like every other place a champion is
    // chosen. It used to be a list of names and star counts — the one view in the game
    // that showed a player nothing about the four they were choosing to be seen by.
    // The accessible name is the card's, composed in `ui/ChampionCard`.
    await expect(
      dialog.getByRole('button', { name: /lv \d+ of \d+.*power/i }).first(),
    ).toBeVisible();
  });

  test('shows what a warden did, and never what they hold', async ({ page }) => {
    test.slow();
    await register(page, 'e2epv', 'Private');

    const card = await page.evaluate(async () => {
      const me = await fetch('/api/player', { credentials: 'include' });
      const body = (await me.json()) as { data?: { player?: { id?: string } } };
      const id = body.data?.player?.id ?? '';
      const response = await fetch(`/api/profiles/${id}`, { credentials: 'include' });
      return { status: response.status, text: await response.text() };
    });

    expect(card.status).toBe(200);
    // The card is public to every signed-in player, so a wallet on it would be a leak.
    expect(card.text).not.toContain('"silver"');
    expect(card.text).not.toContain('"crystals"');
    expect(card.text).not.toContain('"accountName"');
    expect(card.text).toContain('"championsOwned"');
  });

  test('wears a champion you own, on the card and on the bar, across a reload', async ({
    page,
  }) => {
    test.slow();
    const profileName = await register(page, 'e2eav', 'Facewearer');

    const chip = page.getByRole('button', { name: /your profile card/i });
    await chip.click();
    const dialog = page.getByRole('dialog', { name: new RegExp(profileName, 'i') });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    // A fresh account wears its own initial, so the chip has no portrait in it yet.
    await expect(chip.locator('img')).toHaveCount(0);

    await dialog.getByRole('button', { name: /choose your face/i }).click();
    await expect(dialog.getByText(/any champion you own/i)).toBeVisible();

    // The way back is offered beside the faces, because a player who tried a portrait and
    // disliked it needs somewhere to press that is not "a different champion".
    await expect(dialog.getByRole('button', { name: /no portrait/i })).toBeVisible();

    // One press chooses and saves — there is nothing to weigh about a face — and it lands
    // back on the card, wearing it.
    await dialog
      .getByRole('button', { name: /lv \d+ of \d+.*power/i })
      .first()
      .click();
    await expect(dialog.getByRole('button', { name: /choose your face/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog.locator('img').first()).toBeVisible();

    // The bar above every screen is the place a player was trying to change.
    await dialog.getByRole('button', { name: /^close$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(chip.locator('img')).toHaveCount(1, { timeout: 15_000 });

    // And it is the server's, not a flash of local state: a reload has to bring it back.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible({ timeout: 30_000 });
    await expect(chip.locator('img')).toHaveCount(1, { timeout: 20_000 });
  });

  test('turns an anonymous caller away from the card and the showcase', async ({ page }) => {
    await page.goto('/');

    const statuses = await page.evaluate(async () => {
      const card = await fetch('/api/profiles/00000000-0000-4000-8000-000000000000', {
        credentials: 'omit',
      });
      const showcase = await fetch('/api/player/showcase', {
        method: 'PUT',
        credentials: 'omit',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ championIds: [] }),
      });
      const avatar = await fetch('/api/player/avatar', {
        method: 'PUT',
        credentials: 'omit',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ championKey: null }),
      });
      return [card.status, showcase.status, avatar.status];
    });
    expect(statuses).toEqual([401, 401, 401]);
  });
});

/**
 * Registers a fresh warden, takes the first starter, and returns the profile name **the
 * server stored** — which is not always the one typed, since the field has a length cap
 * and a unique suffix is long. Asserting against the typed name would be asserting against
 * something that never existed.
 */
async function register(page: Page, account: string, profile: string): Promise<string> {
  const profileName = unique(profile);
  await page.goto('/');
  await page.getByRole('tab', { name: 'New warden' }).click();
  await page.getByLabel('Account name').fill(unique(account));
  await page.getByLabel('Profile name').fill(profileName);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Take up the lantern' }).click();

  // Out of the tutorial, and deliberately: the script opens on a borrowed fight and only
  // reaches the starter choice three steps later, which is right for a player and wrong
  // for a suite about something else. `tutorial.spec.ts` is where the script is walked.
  await leaveTutorial(page);

  const starterDialog = page.getByRole('dialog', { name: /choose your first champion/i });
  await expect(starterDialog).toBeVisible({ timeout: 20_000 });
  await starterDialog
    .getByRole('button', { name: /^choose /i })
    .first()
    .click();
  await starterDialog.getByRole('button', { name: /stand together/i }).click();
  await expect(starterDialog).toBeHidden({ timeout: 20_000 });

  const stored = await page.evaluate(async () => {
    const response = await fetch('/api/player', { credentials: 'include' });
    const body = (await response.json()) as { data?: { player?: { profileName?: string } } };
    return body.data?.player?.profileName ?? '';
  });
  expect(stored, `registered as ${profileName}`).not.toBe('');
  return stored;
}
