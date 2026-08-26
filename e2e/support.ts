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

/**
 * A name nothing else in the suite will collide with, however parallel it gets.
 *
 * The entropy goes at the end and the *prefix* is what gets trimmed, because a profile name
 * is capped at 16 characters and the field truncates as it is typed. The old version
 * appended the suffix to the whole prefix and let the browser cut whatever hung over — so
 * `unique('Lanternbearer')` was thirteen readable characters and three of timestamp, and
 * two runs a few minutes apart produced the same name. It failed as "that profile name is
 * already taken", thirty seconds into a spec about the world boss.
 */
const NAME_MAX = 16;

export function unique(prefix: string): string {
  const tail = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  return `${prefix.slice(0, Math.max(1, NAME_MAX - tail.length))}${tail}`;
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
 * Walks to a screen the way a player does, through its hub if it has one (C12).
 *
 * Before C12 every destination had a dock slot and a spec pressed it directly. Now the dock
 * holds six entries and sixteen screens live on three hub pages, so "go to the Depths" is
 * two presses — and a spec that still knew about one would be testing a navigation the game
 * no longer has.
 *
 * Named by the *label the player reads* rather than by screen id, because that is what a
 * spec can actually assert on and what a rename would want to break.
 */
export const HUB_OF: Readonly<Record<string, string>> = Object.freeze({
  Campaign: 'Battle',
  'The Depths': 'Battle',
  Arena: 'Battle',
  'The Valewurm': 'Battle',
  'The Wurm Wakes': 'Battle',
  'The Sunken Stair': 'Battle',
  'The Mistspire': 'Battle',
  Trials: 'Battle',
  Roster: 'Champions',
  Relics: 'Champions',
  Chronicle: 'Champions',
  Quests: 'Errands',
  Missions: 'Errands',
  Events: 'Errands',
  Calendar: 'Errands',
  Expeditions: 'Errands',
});

/** The dock button for a screen, or for the hub that now holds it. */
export function dockEntry(page: Page, label: string): Locator {
  const hub = HUB_OF[label] ?? label;
  // Anchored at the start rather than exact: a dock entry with something waiting carries
  // its badge into the accessible name, so `^Errands$` misses the one screen that always
  // has a claim on it — the reason the calendar spec timed out rather than failed.
  return page
    .getByRole('navigation')
    .getByRole('button', { name: new RegExp(`^${hub}\\b`, 'i') })
    .first();
}

/**
 * The card for a place on its hub page — what a locked destination's shroud is now on.
 *
 * The dock used to carry that state; a hub card carries it now, and with room for the
 * sentence saying when the place opens rather than a tooltip a phone cannot reach.
 */
export function placeCard(page: Page, label: string): Locator {
  return page.getByRole('button', { name: new RegExp(`^${label}\\b`, 'i') }).first();
}

/**
 * A board on the Haven's rail — the camp's own card for a place.
 *
 * The Haven draws every destination again since C12c (it had briefly drawn the dock's six,
 * which is the navigation a player just pressed), and it is the screen a fresh account
 * lands on. So a spec about what a *locked* destination says needs no navigation at all —
 * and must not attempt any, because the starter dialog is modal at that moment and eats
 * the press, which reads as a timeout rather than a failure.
 *
 * Same shape as `placeCard` on purpose: a place's board and a place's hub card are the same
 * button with the same name, drawn in two rooms.
 */
export function havenBoard(page: Page, label: string): Locator {
  return page.getByRole('button', { name: new RegExp(`^${label}\\b`, 'i') }).first();
}

/** Presses through to a screen: its hub, then its card. One press if it is in the dock. */
export async function goToScreen(page: Page, label: string): Promise<void> {
  await dockEntry(page, label).click();
  if (HUB_OF[label]) {
    await placeCard(page, label).click();
  }
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
 * Winds the speed up to the fastest rung this account has earned.
 *
 * Since C7 a stage nobody has beaten offers no Skip, so a first clear has to actually
 * *play* — and at ×1 a three-wave fight is most of a spec's timeout. `SpeedLadder` draws
 * every rung and disables the ones not earned, so the fastest enabled button is the
 * fastest this account can go. Nothing here is a back door: it is the press a player makes.
 */
async function useFastestSpeed(page: Page): Promise<void> {
  const rungs = page.getByRole('group', { name: /battle speed/i }).getByRole('button');
  if (
    !(await rungs
      .first()
      .isVisible()
      .catch(() => false))
  )
    return;

  for (const rung of (await rungs.all()).reverse()) {
    if (await rung.isEnabled().catch(() => false)) {
      await rung.click({ timeout: 5_000 }).catch(() => undefined);
      return;
    }
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
 * Leaves the results modal a fight ends on, and clears whatever queued behind it.
 *
 * `resolveBattle` deliberately stops *at* the results — a spec asserting on the loot has to
 * read it before it goes. But every spec that wants the shell afterwards has the same three
 * things in its way: the results dialog, the unlock cards a level-up queued, and the speed
 * ladder's own "×N is open now" card. Doing it in three places would be three places to fix
 * when one of them changes.
 */
export async function leaveResults(page: Page): Promise<void> {
  const results = page.getByRole('dialog', { name: /victory|defeat|withdrawn|practice/i });
  if (await results.isVisible().catch(() => false)) {
    // "Back to the campaign" on a campaign stage, "Back to the Depths" below — the shape
    // is the same and only the place changes.
    await results
      .getByRole('button', { name: /^back to /i })
      .first()
      .click()
      .catch(() => undefined);
    await results.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => undefined);
  }
  await dismissUnlocks(page);
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
  await goToScreen(page, 'Campaign');
  await openCampaignStage(page);
  const dialog = page.getByRole('dialog', { name: /stage 1/i });
  await pickTeam(dialog);
  await dialog.getByRole('button', { name: /into the mist/i }).click();
  await expect(page.locator('.fui-actionbar [role="button"]').first()).toBeVisible({
    timeout: 30_000,
  });
}
