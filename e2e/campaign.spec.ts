import { expect, test } from '@playwright/test';
import { goToScreen, leaveTutorial, resolveBattle, unique } from './support';

/**
 * The loop, in a real browser.
 *
 * `auth.spec.ts` proves a visitor can get in; this proves there is a game once they are.
 * A fresh account picks a starter, walks into chapter 1-1, resolves the fight and reads
 * its rewards — the P3 exit criterion, driven the way a player would drive it.
 *
 * The campaign is three screens since the rework: the vale, a chapter, then the team. So
 * this drives all three, and the second test is about the map alone.
 */

const password = 'a-good-long-password';

test.describe('the campaign loop', () => {
  test('a new warden picks a champion, fights a stage and is paid for it', async ({ page }) => {
    await page.goto('/');

    // ── Register ──────────────────────────────────────────────────────────
    await page.getByRole('tab', { name: 'New warden' }).click();
    await page.getByLabel('Account name').fill(unique('e2e'));
    await page.getByLabel('Profile name').fill(unique('Warden'));
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Take up the lantern' }).click();

    // Out of the tutorial: this spec is about what comes after it.
    await leaveTutorial(page);

    // ── Starter choice ────────────────────────────────────────────────────
    const starterDialog = page.getByRole('dialog', { name: /choose your first champion/i });
    await expect(starterDialog).toBeVisible({ timeout: 20_000 });

    // Pick the first pedestal, whichever champion content puts there.
    await starterDialog
      .getByRole('button', { name: /^choose /i })
      .first()
      .click();
    await starterDialog.getByRole('button', { name: /stand together/i }).click();
    await expect(starterDialog).toBeHidden({ timeout: 15_000 });

    // ── Into the campaign ─────────────────────────────────────────────────
    await goToScreen(page, 'Campaign');

    // The vale first: twelve markers, and the chapter behind one of them.
    await expect(page.locator('.fui-map__node[data-id="chapter_01"]')).toBeVisible({
      timeout: 15_000,
    });
    await page.locator('.fui-map__node[data-id="chapter_01"]').click();
    await expect(page.getByRole('heading', { name: /veilwood fringe/i })).toBeVisible({
      timeout: 15_000,
    });

    // The chapter page says what a stage is worth before any energy is spent.
    const firstStage = page.getByRole('button', { name: '1-1', exact: false }).first();
    await expect(firstStage).toContainText(/waves/i);

    // A row is a row (C44): tall enough to be read across a desktop, and carrying the first
    // wave's faces — a portrait, or the honest stand-in for one — so a stage is more than
    // a number and the word "waves". Faces are counted by the portrait's own attribute
    // rather than as `img, svg` (C47): the stand-in is a painted span now, and a guard
    // that counted tags read one energy glyph on a row with two foes on it.
    const rowBox = await firstStage.boundingBox();
    expect(rowBox?.height ?? 0).toBeGreaterThanOrEqual(90);
    expect(await firstStage.locator('[data-mv-portrait]').count()).toBeGreaterThanOrEqual(2);

    await firstStage.click();

    const teamDialog = page.getByRole('dialog', { name: /stage 1/i });
    await expect(teamDialog).toBeVisible();

    // And the team screen says who is on the other side of it.
    await expect(teamDialog.getByRole('region', { name: /what you will face/i })).toBeVisible();

    // Put the starter in the team, then set off.
    await teamDialog
      .getByRole('button', { name: /lv \d+/i })
      .first()
      .click();
    await teamDialog.getByRole('button', { name: /into the mist/i }).click();

    // ── The fight ─────────────────────────────────────────────────────────
    await expect(page.getByRole('button', { name: /^auto$/i })).toBeVisible({ timeout: 20_000 });
    // The wave readout is the library's pips since the design rework — a lit pip and
    // "1 / 3" rather than the sentence "Wave 1 · Turn 0".
    await expect(page.locator('.fui-waves')).toContainText(/1\s*\/\s*\d/);

    // Auto hands the fight to the server; Skip jumps the playback to the end of what came
    // back. The results modal waits for the *playback*, not the response — so both presses
    // are needed, and this spec is about the loop rather than the animation.
    await resolveBattle(page);

    const results = page.getByRole('dialog', { name: /victory|defeat|withdrawn/i });
    await expect(results).toBeVisible({ timeout: 60_000 });
    await expect(results.getByText(/victory|defeat|withdrawn|the mist closed in/i)).toBeVisible();

    await results.getByRole('button', { name: /back to the campaign/i }).click();
    // A first win can be a first level, and a first level can open something.
    await expect(results).toBeHidden();
    // Back on the *chapter*, not the vale: the opened chapter is remembered across the
    // fight, because farming a stage means coming straight back to it.
    await expect(page.getByRole('heading', { name: /veilwood fringe/i })).toBeVisible();
  });

  test('shows twelve chapters and three difficulties, with the road ahead shut', async ({
    page,
  }) => {
    await page.goto('/');

    await page.getByRole('tab', { name: 'New warden' }).click();
    await page.getByLabel('Account name').fill(unique('e2e'));
    await page.getByLabel('Profile name').fill(unique('Warden'));
    await page.getByLabel('Password', { exact: true }).fill(password);
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

    await goToScreen(page, 'Campaign');
    await expect(page.locator('.fui-map__node[data-id="chapter_01"]')).toContainText(
      /1\. Veilwood Fringe/,
      { timeout: 15_000 },
    );

    // Twelve markers on the map, and exactly one of them is where the warden is standing —
    // 252 stages laid flat would be a wall rather than a map.
    await expect(page.locator('.fui-map__node')).toHaveCount(12);
    await expect(page.locator('.fui-map__node[data-state="current"]')).toHaveCount(1);

    // A marker is a picture (C44): 72px, with its region's painting resolved onto it. The
    // painting is written by the screen after the library builds the node, so this is the
    // one place that can check the two halves met — a rule with nothing to read draws the
    // library's bare disc and passes every other assertion here.
    const discs = page.locator('.fui-map__disc');
    await expect(discs).toHaveCount(12);
    const painted = await discs.evaluateAll((nodes) =>
      nodes.map((node) => ({
        width: node.getBoundingClientRect().width,
        painting: getComputedStyle(node).backgroundImage.includes('url('),
      })),
    );
    for (const disc of painted) {
      expect(disc.width).toBeGreaterThanOrEqual(72);
      expect(disc.painting).toBe(true);
    }
    await expect(page.getByText(/12\. The Coilmother’s Court/)).toBeVisible();

    // Chapter 2 is on the map, shut, and says why on the marker itself — a locked chapter
    // cannot be opened, so the reason has nowhere else to live.
    const chapterTwo = page.locator('.fui-map__node[data-id="chapter_02"]');
    await expect(chapterTwo).toHaveAttribute('data-state', 'locked');
    await expect(chapterTwo).toBeDisabled();
    await expect(chapterTwo).toContainText(/clear 1-7 first/i);

    // Hard is a segment from the start — visible, not hidden — and chapter 1 on it wants
    // the whole vale cleared on Normal first. A segment is a `tab`, not a `button`: the
    // library gives the strip `role="tablist"`, which is what it is.
    await page.getByRole('tab', { name: 'Hard', exact: true }).click();
    await expect(page.locator('.fui-map__node[data-id="chapter_01"]')).toContainText(
      /clear 12-7 first/i,
      { timeout: 15_000 },
    );
  });
});
