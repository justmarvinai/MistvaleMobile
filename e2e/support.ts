import type { Page } from '@playwright/test';

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
  await auto.click();

  // Skip exists only while there is playback left to skip — a fight short enough to drain
  // first is a fight that needed no skipping. ("Skip tutorial" is a different button and
  // deliberately does not match.)
  await page
    .getByRole('button', { name: /^skip$/i })
    .click({ timeout: 20_000 })
    .catch(() => undefined);
}
