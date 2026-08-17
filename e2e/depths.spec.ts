import { expect, test, type Page } from '@playwright/test';
import { leaveTutorial } from './support';

/**
 * The Depths, in a real browser.
 *
 * The rotation arithmetic, the gates and the drops are covered exhaustively against a real
 * database (`depths.test.ts`, 17 cases). What a browser adds is the part no API test can
 * reach: that the *client* and the server agree about who may go down there.
 *
 * A fresh warden is level 1, and the Depths open at 10 — so what a new account sees is the
 * shrouded station, not the hub. That is the design (GAME_DESIGN §12), and reaching level
 * 10 legitimately is roughly a hundred clears of 1-1: too long for a smoke test, and not
 * worth a test-only endpoint to shortcut, which is exactly the "temporary hack" the brief
 * rules out. The hub and floor picker are therefore driven from the API here, and will get
 * their own browser pass in P9 alongside the rest of the first-hour experience.
 */

const password = 'a-good-long-password';

function unique(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

test.describe('the Depths', () => {
  test('are a shrouded promise to a warden who has not earned them', async ({ page }) => {
    test.slow();
    await register(page, 'e2ed', 'Delver');

    // Visible, named, and out of reach — ambition a player can see is the point.
    const station = page.getByRole('button', { name: /the depths/i }).first();
    await expect(station).toBeVisible({ timeout: 15_000 });
    await expect(station).toHaveAttribute('aria-disabled', 'true');
    await expect(station).toHaveAttribute('title', /level 10/i);
  });

  test('answer the hub with today’s rotation and every keep’s standing', async ({ page }) => {
    test.slow();
    await register(page, 'e2eh', 'Sounder');

    const depths = await readDepths(page);

    // Ten keeps: four relic, one pit, five springs.
    expect(depths.dungeons).toHaveLength(10);

    // The server names its own game-day, so the hub and the rotation cannot disagree.
    expect(depths.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(depths.weekday).toBeGreaterThanOrEqual(0);
    expect(depths.weekday).toBeLessThanOrEqual(6);

    // A new account is inside its grace period, so no spring is shut *for the day* —
    // they are shut for the level, which is a different sentence and says so.
    expect(depths.graceUntil).not.toBeNull();
    const hollow = depths.dungeons.find((entry) => entry.dungeonKey === 'wyrms_hollow')!;
    expect(hollow.open).toBe(false);
    expect(hollow.lockedReason).toMatch(/level 12/);
    expect(hollow.highestFloor).toBe(0);

    const mist = depths.dungeons.find((entry) => entry.dungeonKey === 'spring_mist')!;
    expect(mist.lockedReason).toMatch(/level 10/);
  });

  test('refuse a floor for the same reason the hub gives', async ({ page }) => {
    test.slow();
    await register(page, 'e2er', 'Refused');

    const refusal = await page.evaluate(async () => {
      const roster = await fetch('/api/player/champions', { credentials: 'include' });
      const champions = ((await roster.json()) as { data: { champions: { id: string }[] } }).data
        .champions;
      const response = await fetch('/api/battles/start', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'dungeon',
          stageKey: 'wyrms_hollow_f01',
          team: [champions[0]!.id],
        }),
      });
      const body = (await response.json()) as { error?: { code: string; message: string } };
      return { status: response.status, code: body.error?.code, message: body.error?.message };
    });

    // The greyed-out door and the refused request are the same door, word for word.
    expect(refusal.status).toBe(403);
    expect(refusal.code).toBe('LOCKED_CONTENT');
    expect(refusal.message).toBe('Opens at account level 12.');
  });

  test('publish their floors into the content bundle the client renders from', async ({ page }) => {
    test.slow();
    await page.goto('/');

    // 120 floors across ten keeps, every one of them an ordinary stage — which is what
    // lets the Depths reuse the campaign's unlocks, stars and results screen wholesale.
    const bundle = await page.evaluate(async () => {
      const response = await fetch('/api/content');
      const body = (await response.json()) as {
        data: {
          dungeons: { key: string; kind: string; floors: number; openDays: number[] }[];
          stages: { key: string; mode: string; parentKey: string }[];
        };
      };
      return body.data;
    });

    expect(bundle.dungeons).toHaveLength(10);

    // Named by the modes that *are* the Depths rather than by "not campaign": the cold
    // open is a `tutorial` stage, and a filter phrased as an exclusion quietly counted it.
    const floors = bundle.stages.filter((stage) =>
      ['dungeon', 'springs', 'proving'].includes(stage.mode),
    );
    expect(floors).toHaveLength(120);

    // Every keep's floor count matches what it advertises on the hub.
    for (const dungeon of bundle.dungeons) {
      const own = floors.filter((stage) => stage.parentKey === dungeon.key);
      expect(own, dungeon.key).toHaveLength(dungeon.floors);
    }

    // The week has the shape the design asks for: Pure every day, Mist on Sunday alone.
    const pure = bundle.dungeons.find((entry) => entry.key === 'spring_pure')!;
    const mist = bundle.dungeons.find((entry) => entry.key === 'spring_mist')!;
    expect(pure.openDays).toEqual([]);
    expect(mist.openDays).toEqual([0]);
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
  await expect(starterDialog).toBeHidden({ timeout: 15_000 });
}

interface DepthsView {
  today: string;
  weekday: number;
  graceUntil: string | null;
  dungeons: {
    dungeonKey: string;
    open: boolean;
    lockedReason: string | null;
    highestFloor: number;
    nextOpenDay: string | null;
  }[];
}

async function readDepths(page: Page): Promise<DepthsView> {
  return page.evaluate(async () => {
    const response = await fetch('/api/depths', { credentials: 'include' });
    const body = (await response.json()) as { data: { depths: unknown } };
    return body.data.depths as DepthsView;
  });
}
