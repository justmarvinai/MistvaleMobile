import { expect, test } from '@playwright/test';
import { enterStageOneOne, registerRaw, resolveBattle } from './support';

/**
 * What your champions did, on the screen that says the fight is over.
 *
 * The *rules* of the table are pure and pinned exactly in `packages/engine`'s
 * `contribution.test.ts` — which events count toward whom, that a shield-eaten blow still
 * counts, that a reflect landing back on the party does not. Hand-written logs prove those
 * for every case; a real fight would prove them only for the handful it happens to contain.
 *
 * What only a browser can prove is that the table *reaches the screen at all* — that the
 * server puts it on the finished battle, that the client draws it beside the result card,
 * and that it names the champion who was actually fielded. That is the half this file
 * covers, and it is deterministic on a fresh account: a starter fights 1-1 alone, and a
 * champion who wins a fight has dealt damage in it.
 *
 * The three-column case is deliberately *not* farmed for. Which champion a starter choice
 * hands out is the account's own roll and only some of them heal, so a spec that waited for
 * a healing figure would be a coin flip wearing a green tick — the same reasoning that
 * keeps C10's reforge and C14's set-change guards out of the browser.
 */

test.describe('the result screen', () => {
  test('says what the champions you fielded actually did', async ({ page }) => {
    test.slow();
    await registerRaw(page, 'e2escore', 'Tallyer');

    // The starter is taken here rather than through `chooseStarter`, for one reason: the
    // choice is the only place the account's champion is *named on screen*, and the whole
    // point below is that the table names the champion who was actually fielded.
    const dialog = page.getByRole('dialog', { name: /choose your first champion/i });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    const choose = dialog.getByRole('button', { name: /^choose /i }).first();
    // First line only: the button is a whole champion card, so its text runs on into the
    // element, the role and the leader skill underneath the name.
    const starter = ((await choose.innerText()).split('\n')[0] ?? '')
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

    // Its own region rather than a stat row inside the library's card: `ResultScreen` takes
    // label/value pairs, and a table with a portrait and a bar per column is not a shape it
    // models (docs/UI_UX_DESIGN.md §3).
    const board = page.getByRole('region', { name: /what your champions did/i });
    await expect(board).toBeVisible({ timeout: 15_000 });

    // The champion who fought is named in it, and there is a damage figure against them.
    await expect(board.getByRole('rowheader', { name: new RegExp(starter, 'i') })).toBeVisible();
    await expect(board.getByRole('columnheader', { name: /damage/i })).toBeVisible();
    const damage = await board.getByRole('row').last().getByRole('cell').first().innerText();
    expect(Number(damage.replace(/[^\d]/g, '')), `damage read as "${damage}"`).toBeGreaterThan(0);

    // A column nobody filled is not drawn. A lone starter on 1-1 grants no shields, so a
    // "Shielded" column of zeroes would be a third of the table's width teaching nothing —
    // which is the rule that lets the same component serve a four-champion Depths run.
    await expect(board.getByRole('columnheader', { name: /shielded/i })).toHaveCount(0);
  });
});
