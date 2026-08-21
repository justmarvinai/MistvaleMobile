import { expect, test } from '@playwright/test';
import {
  dismissUnlocks,
  leaveTutorial,
  openCampaignStage,
  pickTeam,
  resolveBattle,
} from './support';

/**
 * The management loop, in a real browser.
 *
 * `campaign.spec.ts` proves a player can farm; this proves the farming leads somewhere.
 * A fresh warden picks a starter, fights until a relic drops, equips it, watches the
 * champion's stats move, and visits the Bazaar — the P4 exit criterion, driven the way a
 * player would drive it.
 */

const password = 'a-good-long-password';

function unique(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

/**
 * Two retries, for one honestly random step, sized against the measured odds.
 *
 * The farm below waits for a relic to drop and cannot make that happen. Twenty energy at
 * four a run buys exactly five clears of 1-1 — a level-up would refill the bar, but 1-1
 * pays about 17 account XP against the 120 the first level costs, so it never arrives
 * inside the budget. Five clears at a 42% drop chance run dry **6.5% of the time**, which
 * is a coin flip in front of every push to `main`.
 *
 * That number is measured rather than assumed: walking the real loot stream
 * (`createRng(seed ^ 0x5f3759df)`, one draw consumed for silver, then the gear chance)
 * across 200,000 battle seeds pays out 42.12%, and five dry runs in a row happen to 6.54%
 * of accounts against a theoretical 6.56%. The drop table is right and the RNG is even.
 * The test is simply staking a P4 exit criterion on a coin.
 *
 * So: three attempts, ~0.03% of ending dry, and a failure that survives all three means
 * something is genuinely broken rather than unlucky. The alternative — reaching past the
 * UI to plant a relic — would delete the only browser-level proof that farming produces
 * one.
 */
test.describe.configure({ retries: 2 });

test.describe('the management loop', () => {
  test('a warden farms a relic, equips it, and grows stronger for it', async ({ page }) => {
    test.slow();
    await page.goto('/');

    // ── Register and take a starter ───────────────────────────────────────
    await page.getByRole('tab', { name: 'New warden' }).click();
    await page.getByLabel('Account name').fill(unique('e2em'));
    await page.getByLabel('Profile name').fill(unique('Keeper'));
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Take up the lantern' }).click();

    // Out of the tutorial: this spec is about what comes after it.
    await leaveTutorial(page);

    const starterDialog = page.getByRole('dialog', { name: /choose your first champion/i });
    await expect(starterDialog).toBeVisible({ timeout: 20_000 });
    await starterDialog
      .getByRole('button', { name: /^choose /i })
      .first()
      .click();
    await starterDialog.getByRole('button', { name: /stand together/i }).click();
    await expect(starterDialog).toBeHidden({ timeout: 15_000 });

    // ── Farm until a relic drops ──────────────────────────────────────────
    // Chapter 1-1 drops a weapon 42% of the time, so a handful of runs is reliable
    // without the test having to reach past the UI to plant one.
    //
    // The loop is bounded by *energy*, not by a run count. A fresh account holds twenty
    // and 1-1 costs four; a level-up refills the bar, though 1-1 pays too little XP for
    // one to arrive inside the budget. How many runs are affordable is something only the
    // server knows. Clicking blindly past that point used to park the test on a disabled
    // "Into the mist" for the full timeout, which reads as a hang rather than as the plain
    // fact that the warden is out of energy.
    const energyLeft = async (): Promise<number> =>
      page.evaluate(async () => {
        const response = await fetch('/api/player', { credentials: 'include' });
        const body = (await response.json()) as {
          data?: { player?: { energy?: { value: number } } };
        };
        return body.data?.player?.energy?.value ?? 0;
      });

    let relicsHeld = 0;
    let runs = 0;
    let ranDry = false;
    while (relicsHeld === 0 && runs < 12) {
      if ((await energyLeft()) < 4) {
        ranDry = true;
        break;
      }
      runs += 1;
      await page
        .getByRole('button', { name: /^campaign$/i })
        .first()
        .click();
      // The campaign opens on the vale — twelve chapter markers — and the chapter is a page
      // behind one of them, so what proves the screen arrived is the chapter's *name* on the
      // map rather than a heading that only the chapter page has.
      await expect(page.getByRole('main')).toContainText(/veilwood fringe/i, {
        timeout: 15_000,
      });

      await openCampaignStage(page, '1-1');
      const teamDialog = page.getByRole('dialog', { name: /stage 1/i });
      await expect(teamDialog).toBeVisible();
      await pickTeam(teamDialog);
      await teamDialog.getByRole('button', { name: /into the mist/i }).click();

      await resolveBattle(page);

      const results = page.getByRole('dialog', { name: /victory|defeat|withdrawn/i });
      await expect(results).toBeVisible({ timeout: 60_000 });
      await results.getByRole('button', { name: /back to the campaign/i }).click();
      // Farming levels an account; the celebration is part of what that looks like.
      await dismissUnlocks(page);
      await expect(results).toBeHidden();

      relicsHeld = await page.evaluate(async () => {
        const response = await fetch('/api/player/gear', { credentials: 'include' });
        const body = (await response.json()) as { data?: { gear?: unknown[] } };
        return body.data?.gear?.length ?? 0;
      });
    }
    expect(
      relicsHeld,
      ranDry
        ? `out of energy after ${runs} runs with no relic — 1-1 drops one 42% of the time, so this is bad luck rather than a broken drop table`
        : `no relic in ${runs} runs`,
    ).toBeGreaterThan(0);

    // ── The vault ─────────────────────────────────────────────────────────
    await page
      .getByRole('button', { name: /^relics$/i })
      .first()
      .click();
    // The vault is open from level 1 — the forge inside it is what level 3 unlocks.
    await expect(page.getByRole('button', { name: /^forge$/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    // The meter calls them *loose* relics, which is the rule rather than the place: a relic
    // on a champion is not taking a slot, and that is what makes equipping a way to make
    // room. Scoped to the capacity group either way, since the list's default filter is
    // "In the vault" and would match a laxer name here.
    const capacity = page.getByRole('group', { name: /vault capacity/i });
    await expect(capacity.getByText(/loose relics/i)).toBeVisible();
    await expect(capacity.getByText(/^\d+ \/ \d+$/)).toBeVisible();

    // ── Equip it from the champion screen ─────────────────────────────────
    await page
      .getByRole('button', { name: /^champions$/i })
      .first()
      .click();

    await page
      .getByRole('button', { name: /lv \d+/i })
      .first()
      .click();
    const detail = page.getByRole('dialog').last();
    await expect(detail.getByRole('tab', { name: /relics/i })).toBeVisible({ timeout: 15_000 });

    const powerBefore = Number(
      (await detail.locator('table td').first().innerText()).replace(/[^\d]/g, ''),
    );

    // Open the slot the relic belongs to and put it on.
    await detail
      .getByRole('button', { name: /weapon/i })
      .first()
      .click();
    const picker = page.getByRole('dialog', { name: /weapon relic/i });
    await expect(picker).toBeVisible();

    // Two dialogs, one keystroke. Escape belongs to the top one only — before the overlay
    // stack (apps/client/src/ui/Modal/stack.ts) both had their own listener on `document`,
    // and `stopPropagation` does nothing about a sibling listener on the same node, so
    // this closed the champion sheet along with the picker and dropped the player back on
    // the roster.
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden({ timeout: 10_000 });
    await expect(detail.getByRole('tab', { name: /relics/i })).toBeVisible();

    await detail
      .getByRole('button', { name: /weapon/i })
      .first()
      .click();
    await expect(picker).toBeVisible();
    await picker
      .getByRole('button', { name: /ironroot|wolfsfang|★/i })
      .first()
      .click();
    await picker.getByRole('button', { name: /^equip$/i }).click();
    await expect(picker).toBeHidden({ timeout: 15_000 });

    // The stat table must now show a relic contribution — the loop's whole point.
    await expect(detail.getByText(/^\+\d/).first()).toBeVisible({ timeout: 15_000 });
    expect(powerBefore).toBeGreaterThan(0);

    await detail
      .getByRole('button', { name: /close|×/i })
      .first()
      .click();

    // ── The Bazaar waits until level 5 ────────────────────────────────────
    // A fresh warden is nowhere near it, and that is the point: the dock shows it as a
    // teaser rather than hiding it, so the player can see what is coming
    // (docs/UI_UX_DESIGN.md §2, docs/GAME_DESIGN.md §12).
    // The *dock* item, as the comment above says — its own text is the label and a badge
    // count, and the "when" lives in a native `title`. The Haven's stations are the ones
    // that moved to painted tooltips and say it in visible text.
    const bazaar = page.getByRole('button', { name: /^bazaar$/i }).first();
    await expect(bazaar).toBeVisible();
    await expect(bazaar).toHaveAttribute('aria-disabled', 'true');
    await expect(bazaar).toHaveAttribute('title', /level 5/i);
  });
});
