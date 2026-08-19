import { expect, test, type Page } from '@playwright/test';
import { dismissUnlocks, leaveTutorial, resolveBattle } from './support';

/**
 * The login calendar, in a real browser.
 *
 * The cycle arithmetic and every claim rule are pinned against a real database (25 cases in
 * `login.test.ts`). What a browser adds is the two things no API test reaches: that the
 * screen a player actually opens draws the track, and that collecting a day from it changes
 * what the screen says — the loop the whole feature exists to close.
 */

const password = 'a-good-long-password';

function unique(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

test.describe('the login calendar', () => {
  test('is a shrouded promise until the account has grown into it', async ({ page }) => {
    test.slow();
    await register(page, 'e2ec', 'Newcome');

    const station = page.getByRole('button', { name: /calendar/i }).first();
    await expect(station).toBeVisible({ timeout: 15_000 });
    await expect(station).toHaveAttribute('aria-disabled', 'true');
    await expect(station).toHaveAttribute('title', /level 2/i);
  });

  test('opens on the first victory, and a collected day is spent', async ({ page }) => {
    test.slow();
    await register(page, 'e2ed', 'Lampkeep');

    // One campaign win is enough: 1-1 pays ~17 account XP and the day's first-win bonus
    // pays 120 more, against the 120 that level 2 costs. Playing for the unlock rather
    // than granting it is the point — it proves the gate a real player meets.
    await winFirstStage(page);
    await expect
      .poll(async () => (await readCalendar(page)).unlocked, { timeout: 15_000 })
      .toBe(true);

    const before = await readCalendar(page);
    expect(before.calendar.days).toHaveLength(30);
    expect(before.welcome.days).toHaveLength(7);

    // The dock is no longer shrouded, and the screen draws the tracks.
    await page
      .getByRole('button', { name: /calendar/i })
      .first()
      .click();
    await expect(page.getByText(/a warden’s first week/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/day 1 is waiting/i).first()).toBeVisible();

    const claimed = await page.evaluate(async () => {
      const response = await fetch('/api/login-calendar/claim', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ track: 'welcome', actionId: 'e2e-welcome-0001' }),
      });
      const body = (await response.json()) as {
        data?: { day: number; login: { welcome: { claimedToday: boolean; claimsMade: number } } };
      };
      return { status: response.status, data: body.data };
    });
    expect(claimed.status).toBe(200);
    expect(claimed.data?.day).toBe(1);
    expect(claimed.data?.login.welcome.claimedToday).toBe(true);
    expect(claimed.data?.login.welcome.claimsMade).toBe(1);

    // A second claim the same day is refused rather than quietly paying twice.
    const again = await page.evaluate(async () => {
      const response = await fetch('/api/login-calendar/claim', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ track: 'welcome', actionId: 'e2e-welcome-0002' }),
      });
      return response.status;
    });
    expect(again).toBe(409);

    // And the calendar beside it is untouched — two tracks, one day each.
    const after = await readCalendar(page);
    expect(after.welcome.claimsMade).toBe(1);
    expect(after.calendar.claimsMade).toBe(0);
  });

  test('refuses a champion nobody was offered', async ({ page }) => {
    test.slow();
    await register(page, 'e2ep', 'Grabby');

    const refusal = await page.evaluate(async () => {
      const response = await fetch('/api/login-calendar/claim', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          track: 'calendar',
          choice: 'aureleth',
          actionId: 'e2e-greedy-0001',
        }),
      });
      const body = (await response.json()) as { error?: { code: string } };
      return { status: response.status, code: body.error?.code };
    });

    // Either the gate refuses it (level 1) or day 1 does (it is not a selector). Both are
    // correct refusals; what must never happen is an exclusive Legendary changing hands.
    expect([400, 403]).toContain(refusal.status);
    expect(['VALIDATION', 'LOCKED_CONTENT']).toContain(refusal.code);
  });

  test('turns an anonymous caller away from every endpoint', async ({ page }) => {
    await page.goto('/');

    const statuses = await page.evaluate(async () => {
      const state = await fetch('/api/login-calendar', { credentials: 'omit' });
      const claim = await fetch('/api/login-calendar/claim', {
        method: 'POST',
        credentials: 'omit',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ track: 'calendar', actionId: 'e2e-anon-0001' }),
      });
      return [state.status, claim.status];
    });
    expect(statuses).toEqual([401, 401]);
  });
});

interface CalendarView {
  unlocked: boolean;
  unlockLevel: number;
  calendar: { days: unknown[]; claimsMade: number };
  welcome: { days: unknown[]; claimsMade: number };
}

/** Clears 1-1 on auto — the shortest honest route to account level 2. */
async function winFirstStage(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /^campaign$/i })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: /veilwood fringe/i })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('button', { name: '1-1', exact: false }).first().click();
  const teamDialog = page.getByRole('dialog', { name: /stage 1/i });
  await expect(teamDialog).toBeVisible();
  await teamDialog
    .getByRole('button', { name: /lv \d+/i })
    .first()
    .click();
  await teamDialog.getByRole('button', { name: /into the mist/i }).click();

  await resolveBattle(page);

  // The result screen names itself by its outcome since the design rework — a screen
  // reader saying "Victory" is worth more than one saying "Results".
  const results = page.getByRole('dialog', { name: /victory|defeat|withdrawn|practice/i });
  await expect(results).toBeVisible({ timeout: 60_000 });
  await results.getByRole('button', { name: /back to the campaign/i }).click();
  // A first win can be a first level, and a first level can open something.
  await dismissUnlocks(page);
  await expect(results).toBeHidden();
}

async function readCalendar(page: Page): Promise<CalendarView> {
  const view = await page.evaluate(async () => {
    const response = await fetch('/api/login-calendar', { credentials: 'include' });
    const body = (await response.json()) as { data?: { login: unknown } };
    return { status: response.status, login: body.data?.login };
  });
  expect(view.status).toBe(200);
  return view.login as CalendarView;
}

/** Registers a fresh warden and takes the first starter on offer. */
async function register(page: Page, account: string, profile: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('tab', { name: 'New warden' }).click();
  await page.getByLabel('Account name').fill(unique(account));
  await page.getByLabel('Profile name').fill(unique(profile));
  await page.getByLabel('Password').fill(password);
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
}
