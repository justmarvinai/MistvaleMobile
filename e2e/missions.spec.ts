import { expect, test, type Page } from '@playwright/test';
import { leaveTutorial } from './support';

/**
 * The Valewarden's Path, in a real browser.
 *
 * The chain's arithmetic — arcs opening, progress accruing across shut arcs, and the
 * eighty-step walk to Aureleth — is covered against a real database (13 cases in
 * `missions.test.ts`). What a browser adds is what no API test reaches: that the client
 * and the server agree about who may walk the Path, and that the road ahead is visible
 * from the very first battle.
 */

const password = 'a-good-long-password';

function unique(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

test.describe('missions', () => {
  test('is a shrouded promise until the account has grown into it', async ({ page }) => {
    test.slow();
    await register(page, 'e2ms', 'Unpathed');

    const station = page.getByRole('button', { name: /missions/i }).first();
    await expect(station).toBeVisible({ timeout: 15_000 });
    await expect(station).toHaveAttribute('aria-disabled', 'true');
    // The hint is *read*, not hovered: a station says when it opens in visible text under
    // its name. It used to be a native `title` as well, which the painted tooltip replaced —
    // and an attribute nobody can see was always the weaker thing to assert.
    await expect(station).toContainText(/level 4/i);
  });

  test('lays out the whole road from the first day', async ({ page }) => {
    test.slow();
    await register(page, 'e2mp', 'Walker');

    const view = await page.evaluate(async () => {
      const response = await fetch('/api/missions', { credentials: 'include' });
      const body = (await response.json()) as {
        data?: {
          missions: {
            total: number;
            currentArc: number;
            claimable: number;
            title: string | null;
            arcs: { arc: number; name: string; open: boolean }[];
          };
        };
      };
      return { status: response.status, missions: body.data?.missions };
    });

    expect(view.status).toBe(200);
    expect(view.missions?.total).toBe(80);
    expect(view.missions?.arcs).toHaveLength(10);
    // The first arc is open and the rest are named but shut — a road you can see is the
    // reason to walk it (GAME_DESIGN §9).
    expect(view.missions?.arcs[0]?.open).toBe(true);
    expect(view.missions?.arcs[9]?.open).toBe(false);
    expect(view.missions?.arcs[9]?.name).toBe('Court of the Coilmother');
    expect(view.missions?.currentArc).toBe(1);
    expect(view.missions?.title).toBeNull();
  });

  test('refuses a claim nobody has earned', async ({ page }) => {
    test.slow();
    await register(page, 'e2mc', 'Hasty');

    const refusal = await page.evaluate(async () => {
      const response = await fetch('/api/missions/m01_first_blood/claim', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actionId: 'e2e-unearned-0001' }),
      });
      const body = (await response.json()) as { error?: { code: string } };
      return { status: response.status, code: body.error?.code };
    });

    expect(refusal.status).toBe(400);
    expect(refusal.code).toBe('VALIDATION');
  });

  test('turns an anonymous caller away from every endpoint', async ({ page }) => {
    await page.goto('/');

    const statuses = await page.evaluate(async () => {
      const list = await fetch('/api/missions', { credentials: 'omit' });
      const claim = await fetch('/api/missions/m01_first_blood/claim', {
        method: 'POST',
        credentials: 'omit',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actionId: 'e2e-anon-0001' }),
      });
      return [list.status, claim.status];
    });
    expect(statuses).toEqual([401, 401]);
  });
});

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
