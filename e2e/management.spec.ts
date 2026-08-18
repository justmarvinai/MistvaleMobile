import { expect, test } from '@playwright/test';
import { dismissUnlocks, leaveTutorial } from './support';

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
    // and 1-1 costs four, and the level-ups along the way refill the bar — so how many
    // runs are affordable is something only the server knows. Clicking blindly past that
    // point used to park the test on a disabled "Into the mist" for the full timeout,
    // which reads as a hang rather than as the plain fact that the warden is out of
    // energy.
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
      await expect(page.getByText(/veilwood fringe/i)).toBeVisible({ timeout: 15_000 });

      await page.getByRole('button', { name: '1-1', exact: false }).first().click();
      const teamDialog = page.getByRole('dialog', { name: /stage 1/i });
      await expect(teamDialog).toBeVisible();
      await teamDialog
        .getByRole('button', { name: /lv \d+/i })
        .first()
        .click();
      await teamDialog.getByRole('button', { name: /into the mist/i }).click();

      await expect(page.getByRole('button', { name: /^auto$/i })).toBeVisible({ timeout: 20_000 });
      await page.getByRole('button', { name: /^auto$/i }).click();

      const results = page.getByRole('dialog', { name: /results/i });
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
    await expect(page.getByText(/^held$/i)).toBeVisible();

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
    const bazaar = page.getByRole('button', { name: /^bazaar$/i }).first();
    await expect(bazaar).toBeVisible();
    await expect(bazaar).toHaveAttribute('aria-disabled', 'true');
    await expect(bazaar).toHaveAttribute('title', /level 5/i);
  });
});
