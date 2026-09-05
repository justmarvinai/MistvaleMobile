import { expect, test } from '@playwright/test';
import { enterStageOneOne, registerRaw, resolveBattle } from './support';

/**
 * The screen a fight ends on.
 *
 * The *rules* of what each champion did are pure and pinned exactly in `packages/engine`'s
 * `contribution.test.ts` — which events count toward whom, that a shield-eaten blow still
 * counts, that a reflect landing back on the party does not. Hand-written logs prove those
 * for every case; a real fight would prove them only for the handful it happens to contain.
 *
 * What only a browser can prove is that it all *reaches the screen* — that the server puts
 * the tally and the turn count on the finished battle, that the client draws a card per
 * champion, that it names the champion who was actually fielded, and that the ways on are
 * offered on a stage that can be fought again. That is the half this file covers, and it is
 * deterministic on a fresh account: a starter fights 1-1 alone, and a champion who wins a
 * fight has dealt damage in it.
 *
 * The healing case is deliberately *not* farmed for. Which champion a starter choice hands
 * out is the account's own roll and only some of them heal, so a spec that waited for a
 * healing figure would be a coin flip wearing a green tick — the same reasoning that keeps
 * C10's reforge and C14's set-change guards out of the browser.
 */

test.describe('the result screen', () => {
  test('says what the champions you fielded actually did', async ({ page }) => {
    test.slow();
    await registerRaw(page, 'e2escore', 'Tallyer');

    // The starter is taken here rather than through `chooseStarter`, for one reason: the
    // choice is the only place the account's champion is *named on screen*, and the whole
    // point below is that the party names the champion who was actually fielded.
    const dialog = page.getByRole('dialog', { name: /choose your first champion/i });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    const choose = dialog.getByRole('button', { name: /^choose /i }).first();
    // From the button's accessible name rather than its text: the button is a whole hero
    // panel, and since C42 the first line of its text is the element badge over the face,
    // not the name — which is how this read "TIDE" and then looked for a champion called
    // that on the result screen.
    const starter = ((await choose.getAttribute('aria-label')) ?? '')
      .replace(/^choose\s+/i, '')
      .trim();
    expect(starter, 'the starter dialog names its champions').not.toBe('');
    await choose.click();
    await dialog.getByRole('button', { name: /stand together/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await enterStageOneOne(page);
    await resolveBattle(page);

    const results = page.getByRole('dialog', { name: /victory|defeat|withdrawn/i });
    await expect(results).toBeVisible({ timeout: 60_000 });

    // The place is named once. It was in the corner *and* under the headline, which is the
    // "a screen says its own name twice" defect C12c named on four other screens.
    await expect(results.getByText(/veilwood fringe 1-1/i)).toHaveCount(1);

    // A card per champion, not a stat row inside the library's card: `ResultScreen` takes
    // label/value pairs, and a face with a level ladder and three bars is not a shape it
    // models (docs/UI_UX_DESIGN.md §3).
    const party = results.getByRole('list', { name: /what your champions did/i });
    await expect(party).toBeVisible({ timeout: 15_000 });

    // The champion who fought is named on it, with a damage figure against them. Found by
    // text rather than by `getByRole('term')`: `dt` maps to the `term` role but takes no
    // accessible name from its own contents, so a role-and-name query there matches nothing
    // — which is how the first cut of this assertion timed out over a card drawn correctly.
    await expect(party.getByText(starter, { exact: true })).toBeVisible();
    const damage = await party
      .getByText(/^damage dealt$/i)
      .first()
      .locator('xpath=following-sibling::dd[1]')
      .innerText();
    expect(Number(damage.replace(/[^\d]/g, '')), `damage read as "${damage}"`).toBeGreaterThan(0);

    // A bar nobody in the party filled is not drawn. A lone starter on 1-1 grants no
    // shields, so a "Shield granted" track of zero would be a third of every card teaching
    // nothing — which is the rule that lets the same component serve a four-champion run.
    await expect(party.getByText(/^shield granted$/i)).toHaveCount(0);
  });

  test('says how long it took, and offers the stage again', async ({ page }) => {
    test.slow();
    await registerRaw(page, 'e2eagain', 'Repeater');
    await page
      .getByRole('button', { name: /^choose /i })
      .first()
      .click();
    await page.getByRole('button', { name: /stand together/i }).click();

    await enterStageOneOne(page);
    await resolveBattle(page);

    const results = page.getByRole('dialog', { name: /victory|defeat|withdrawn/i });
    await expect(results).toBeVisible({ timeout: 60_000 });

    // Turns rather than a clock: playback runs at ×1, ×2 or ×4, so a wall-clock reading
    // would measure how fast somebody chose to watch rather than how well they fought.
    // The server sends the figure it filed as the record; a fight always takes at least one.
    const turns = await results.getByText(/^turns\s*\d+$/i).innerText();
    expect(Number(turns.replace(/[^\d]/g, '')), `turns read as "${turns}"`).toBeGreaterThan(0);
    // The first clear of a stage has no record to beat, so the screen says so rather than
    // printing the same number twice — `previousBest` is read *before* the upsert folds
    // this run into it, which is the only way that sentence can ever be true.
    await expect(results.getByText(/a new best/i)).toBeVisible();

    // 1-1 costs energy, so it can simply be had again — the button says what it spends,
    // because the price is the decision and the count is the obvious half.
    await expect(results.getByRole('button', { name: /^again · \d+ energy$/i })).toBeVisible();
    await expect(results.getByRole('button', { name: /^change team$/i })).toBeVisible();
    // And the one after it, since the clear opened it. Offered only on a win and only where
    // the server has already said the next stage is open.
    await expect(results.getByRole('button', { name: /^next · \d+ energy$/i })).toBeVisible();

    // The picker opens *over* the result rather than behind it, which is the one thing
    // about this button a unit test cannot answer: the result is a full-screen overlay at
    // its own depth in the stack (P10b), and a dialog opening from inside one has to land
    // on top of it and hand the keyboard over.
    await results.getByRole('button', { name: /^change team$/i }).click();
    // Named the way the corner names it rather than "Stage 1" — the picker's own fallback
    // is a stage number with no chapter attached to it.
    const picker = page.getByRole('dialog', { name: /veilwood fringe 1-1/i });
    await expect(picker).toBeVisible({ timeout: 15_000 });
    await picker
      .getByRole('button', { name: /^close$|^cancel$/i })
      .first()
      .click();
    await expect(picker).toBeHidden({ timeout: 15_000 });
    await expect(results).toBeVisible();

    // Pressing it starts the next fight rather than closing the screen onto nothing.
    await results.getByRole('button', { name: /^next · \d+ energy$/i }).click();
    await expect(results).toBeHidden({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /^auto$/i })).toBeVisible({ timeout: 30_000 });
  });
});
