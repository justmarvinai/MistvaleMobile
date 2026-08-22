import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Shared scaffolding for the browser suite.
 *
 * This file exists because of the tutorial. Before it, every spec's setup was three lines
 * of form-filling and each kept its own copy; once a fresh account started landing on a
 * scripted opening instead of on the Haven, thirteen copies all needed the same new step,
 * which is thirteen chances to miss one.
 */

export const PASSWORD = 'a-good-long-password';

/** A name nothing else in the suite will collide with, however parallel it gets. */
export function unique(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

/**
 * Leaves the tutorial, and reloads so the client comes back without it.
 *
 * **Every spec except `tutorial.spec.ts` calls this**, and deliberately: the script opens
 * on a borrowed fight and does not reach the starter choice until its third step, which is
 * right for a player and wrong for forty tests about quests, mail and the Arena. Making
 * each of them walk a thirty-turn battle to reach the thing they actually test would trade
 * the suite's runtime for coverage it already has.
 *
 * A skip is server-side and final, so the reload comes back with no overlay and no
 * scripted navigation — the Haven, an empty roster, and the starter choice waiting.
 */
export async function leaveTutorial(page: Page): Promise<void> {
  // Wait for the session to actually exist before posting anything with it. Registration
  // is a form submit followed by a navigation into the shell, and firing the skip into
  // that gap leaves the reload below with no cookie and the suite staring at the login
  // screen — which is what one unexplained failure in a fifty-test run looked like.
  await page.getByRole('button', { name: 'Sign out' }).waitFor({ timeout: 30_000 });

  await page.waitForFunction(
    async () => {
      const response = await fetch('/api/tutorial/skip', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        credentials: 'include',
      });
      return response.ok;
    },
    undefined,
    { timeout: 20_000 },
  );
  await page.reload();
}

/**
 * Registers a fresh warden, out of the tutorial, with the starter dialog open.
 *
 * Stops there rather than choosing: which champion a spec wants — or whether it wants to
 * assert on the choice itself — is the spec's business.
 */
export async function registerRaw(page: Page, account: string, profile: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('tab', { name: 'New warden' }).click();
  await page.getByLabel('Account name').fill(unique(account));
  await page.getByLabel('Profile name').fill(unique(profile));
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Take up the lantern' }).click();
  await leaveTutorial(page);
}

/**
 * Takes the first starter on offer, and waits for the dialog to close.
 *
 * `registerRaw` deliberately stops before the choice, but a spec that wants the *shell*
 * rather than the choice still has to get past it — the dialog is modal and its backdrop
 * eats every click meant for the dock behind it.
 */
export async function chooseStarter(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: /choose your first champion/i });
  await dialog.waitFor({ state: 'visible', timeout: 20_000 });
  await dialog
    .getByRole('button', { name: /^choose /i })
    .first()
    .click();
  await dialog.getByRole('button', { name: /stand together/i }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 20_000 });
}

/**
 * Dismisses an unlock celebration if one is showing.
 *
 * Winning a fight levels an account, and a level can open a feature — so any spec that
 * fights is liable to meet the card on its way back to the shell. It is deliberately a
 * modal, so it has to be got past rather than ignored; `tutorial.spec.ts` is where the
 * celebration itself is tested.
 */
export async function dismissUnlocks(page: Page): Promise<void> {
  const card = page.getByRole('dialog', { name: /the mist thins/i });
  // Two can queue — level 8 opens the Arena and the Hall together.
  for (let guard = 0; guard < 4; guard += 1) {
    const showing = await card
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (!showing) return;
    await card.getByRole('button', { name: /later/i }).click();
  }
}

/**
 * Winds the speed control up to the fastest rung this account has earned.
 *
 * Since C7 a stage nobody has beaten offers no Skip, so a first clear has to actually
 * *play* — and at ×1 a three-wave fight is most of a spec's timeout. The library's control
 * is one button that cycles, and `cycleSpeed` steps over the rungs that are still locked,
 * so the reachable readings are exactly the earned ones. Press around the loop once to
 * learn them, then press until it lands on the fastest. Nothing here is a back door: it is
 * the press a player makes.
 */
async function useFastestSpeed(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: /battle speed/i });
  if (!(await button.isVisible().catch(() => false))) return;

  const read = async (): Promise<number> =>
    Number(/\d+/.exec((await button.innerText().catch(() => '')).trim())?.[0] ?? '1');

  const rungs = new Set<number>();
  for (let press = 0; press < 5; press += 1) {
    const now = await read();
    if (rungs.has(now)) break;
    rungs.add(now);
    await button.click({ timeout: 5_000 }).catch(() => undefined);
  }

  const fastest = Math.max(...rungs);
  for (let press = 0; press < 5 && (await read()) !== fastest; press += 1) {
    await button.click({ timeout: 5_000 }).catch(() => undefined);
  }
}

/**
 * Fights the battle on screen through to its results, without watching it.
 *
 * Two presses, and both are things a real player does: **Auto** asks the server to
 * resolve the whole fight in one response, **Skip** jumps the playback to the end of what
 * came back. Before P10 the second press was unnecessary because the results modal opened
 * on the server's answer rather than on the playback — which is the bug it opened on, and
 * which meant no fight in the game was ever actually watched.
 *
 * Now that playback is a real gate, forty specs sitting through forty animated battles at
 * ×1 would add something like ten minutes of sprites hitting each other to a suite that is
 * about the loop *around* the fight. The playback itself is watched in `tutorial.spec.ts`,
 * where it is the subject rather than the setup.
 */
export async function resolveBattle(page: Page): Promise<void> {
  const auto = page.getByRole('button', { name: /^auto$/i });
  await auto.waitFor({ timeout: 20_000 });

  await useFastestSpeed(page);
  // Only if it is not already engaged. Auto is a real toggle since B2c — and a standing
  // preference, so a fight can *open* with it on — where it used to run the fight out
  // whichever way it was pressed. A helper that clicks it blindly turns it off and then
  // waits twenty seconds for a battle nobody is fighting.
  if ((await auto.getAttribute('aria-pressed')) !== 'true') await auto.click();

  // One press is no longer one fight. Since B3 the button asks the server for a few turns
  // at a time and the screen re-asks while it stays engaged — which is what makes it a
  // toggle rather than a commitment, and what stops this helper from being able to press
  // once and walk away. So it waits for the fight to actually end, pressing Skip whenever
  // there is playback in the way. ("Skip tutorial" is a different button and deliberately
  // does not match.)
  // Every way a fight can end, including the sandbox's — the practice modal is titled
  // "Practice" rather than by an outcome, because it deliberately has none.
  const results = page.getByRole('dialog', { name: /victory|defeat|withdrawn|practice/i });
  const skip = page.getByRole('button', { name: /^skip$/i });

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await results.isVisible().catch(() => false)) return;
    if (await skip.isVisible().catch(() => false)) {
      await skip.click({ timeout: 5_000 }).catch(() => undefined);
      continue;
    }
    // Auto can be knocked off by a wave transition rebuilding the controls; re-engage it
    // rather than sitting on a fight that is waiting for a command nobody will give.
    if ((await auto.getAttribute('aria-pressed').catch(() => null)) === 'false') {
      await auto.click({ timeout: 5_000 }).catch(() => undefined);
    }
    await page.waitForTimeout(250);
  }
  throw new Error('resolveBattle: the fight never reached its results');
}

/**
 * Asserts an element is not merely *in the layout* but actually on top at its own centre.
 *
 * Playwright's `toBeVisible` answers a CSS question — is it displayed, does it have a
 * box — and says nothing about what is painted over it. That gap is how the battle screen
 * shipped completely covered by an opaque overlay with all fifty-five browser cases green:
 * every control was there, every assertion passed, and a player saw an empty page.
 *
 * `elementFromPoint` asks the browser the question a player asks. Returning an ancestor
 * counts — a label inside the button that was clicked is the button as far as anyone is
 * concerned.
 */
export async function expectOnTop(page: Page, selector: string, label = selector): Promise<void> {
  const result = await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return { ok: false, why: 'not in the DOM' };
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return { ok: false, why: 'zero-sized' };

    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    if (!hit) return { ok: false, why: 'nothing at its centre' };
    if (element.contains(hit) || hit.contains(element)) return { ok: true, why: '' };

    const covering = hit as HTMLElement;
    return {
      ok: false,
      why: `covered by <${covering.tagName.toLowerCase()} class="${covering.className}">`,
    };
  }, selector);

  if (!result.ok) throw new Error(`${label} is not visible to a player: ${result.why}`);
}

/**
 * Makes sure a stage dialog has somebody in it, without assuming it started empty.
 *
 * Specs used to click the first roster card, which worked because the picker always opened
 * with four blank slots. Since B2c it opens on the team you last sent — so on the second
 * stage of a spec that fights twice, that click *removes* the only champion and leaves
 * "Into the mist" disabled, which is a four-minute timeout and a mystery.
 *
 * Intent rather than mechanism: a spec that is about the loop around the fight wants "a
 * team is chosen", not "this particular click happened".
 */
export async function pickTeam(dialog: Locator): Promise<void> {
  if ((await dialog.locator('[data-filled="true"]').count()) > 0) return;
  await dialog
    .getByRole('button', { name: /lv \d+/i })
    .first()
    .click();
}

/**
 * Turns the player's **Simple battlefield** on, the way the settings panel does.
 *
 * A reload follows because the switch decides which renderer the battle screen builds, and
 * that decision is made when the screen mounts.
 */
export async function setSimpleBattlefield(page: Page): Promise<void> {
  await page.waitForFunction(
    async () => {
      const response = await fetch('/api/player/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ simpleBattlefield: true }),
        credentials: 'include',
      });
      return response.ok;
    },
    undefined,
    { timeout: 20_000 },
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible({ timeout: 30_000 });
}

/**
 * Opens a campaign stage from wherever the campaign screen happens to be.
 *
 * The campaign is three screens since the rework — the vale, then a chapter, then the team
 * — so "click 1-1" is two clicks when the map is showing and one when the chapter is
 * already open, and which of those it is depends on what the account did last (the opened
 * chapter is remembered across a fight, deliberately). This asks the page rather than
 * assuming: if a marker is on screen, open its chapter first.
 *
 * The chapter is derived from the label, so `openCampaignStage(page, '3-4')` works.
 */
export async function openCampaignStage(page: Page, label = '1-1'): Promise<void> {
  const chapter = `chapter_${String(Number(label.split('-')[0])).padStart(2, '0')}`;
  const marker = page.locator(`.fui-map__node[data-id="${chapter}"]`);
  if (await marker.isVisible().catch(() => false)) {
    await marker.click();
  }
  await page.getByRole('button', { name: label, exact: false }).first().click();
}

/**
 * Walks a fresh account from the Haven into campaign stage 1-1, on the default team.
 *
 * Returns once the hotbar names somebody to act with, which is the point at which the
 * board, the units and the HUD are all up.
 */
export async function enterStageOneOne(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /^campaign$/i })
    .first()
    .click();
  await openCampaignStage(page);
  const dialog = page.getByRole('dialog', { name: /stage 1/i });
  await pickTeam(dialog);
  await dialog.getByRole('button', { name: /into the mist/i }).click();
  await expect(page.locator('.fui-actionbar [role="button"]').first()).toBeVisible({
    timeout: 30_000,
  });
}
