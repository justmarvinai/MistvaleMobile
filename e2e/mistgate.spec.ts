import { expect, test, type Page } from '@playwright/test';

/**
 * The Mistgate and the Chronicle, in a real browser.
 *
 * The pull itself is covered exhaustively at the API level (`summon.test.ts`, against a
 * real database) and the maths in `roll.test.ts`. What only a browser can prove is that
 * the *screen* is honest: that the odds panel shows the published table rather than a
 * placeholder, that full disclosure is one click away, that a player with no sigils is
 * stopped here rather than at the server, and that the Chronicle records what they met.
 *
 * The sigils come from the welcome grant a real account receives — no test-only endpoint,
 * because a back door on the production server is exactly the sort of "temporary" hack
 * the project forbids.
 */

const password = 'a-good-long-password';

function unique(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

test.describe('the Mistgate', () => {
  test('shows a warden the real odds, and refuses a pull they cannot pay for', async ({ page }) => {
    test.slow();
    await register(page, 'e2es', 'Caller');

    // ── The gate ──────────────────────────────────────────────────────────
    await page
      .getByRole('button', { name: /^mistgate$/i })
      .first()
      .click();

    const gleaming = page.getByRole('tab', { name: /gleaming sigil/i });
    await expect(gleaming).toBeVisible({ timeout: 15_000 });
    await gleaming.click();

    // The published rates, on the same screen as the button.
    await expect(page.getByText('Odds & Mercy')).toBeVisible();
    await expect(page.getByRole('row', { name: /epic\s+8\.00%\s+8\.00%/i })).toBeVisible();
    await expect(page.getByRole('row', { name: /legendary\s+0\.50%/i })).toBeVisible();

    // Mercy is shown before it matters, not only once it has accrued.
    await expect(page.getByText(/20 more without one/i)).toBeVisible();

    // Full disclosure is one click, not buried in a menu.
    await page.getByRole('button', { name: /show every champion in this pool/i }).click();
    await expect(page.getByRole('button', { name: /hide the full list/i })).toBeVisible();
    await expect(page.getByText(/split evenly/i).first()).toBeVisible();

    // A ×10's guarantee is stated up front.
    await expect(page.getByText(/guarantees at least one rare/i)).toBeVisible();

    // Three Gleaming Sigils came with the welcome grant — enough for ×1, not for ×10.
    await expect(page.getByText(/3 gleaming sigils held/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /summon ×10/i })).toBeDisabled();
  });

  test('a warden pulls ten from the brood banner and keeps them', async ({ page }) => {
    test.slow();
    await register(page, 'e2ep', 'Summoner');

    await page
      .getByRole('button', { name: /^mistgate$/i })
      .first()
      .click();
    await page.getByRole('tab', { name: /faded sigil/i }).click();

    const before = await rosterSize(page);

    const tenPull = page.getByRole('button', { name: /summon ×10/i });
    await expect(tenPull).toBeEnabled({ timeout: 15_000 });
    await tenPull.click();

    // ── The reveal ────────────────────────────────────────────────────────
    const reveal = page.getByRole('dialog', { name: /summon results/i });
    await expect(reveal).toBeVisible({ timeout: 20_000 });

    // Skippable, per the design: nobody should sit through their ninth ×10 of the night.
    await reveal.getByRole('button', { name: /^skip$/i }).click();
    await expect(reveal.getByText(/10 summoned/i)).toBeVisible({ timeout: 15_000 });
    await reveal.getByRole('button', { name: /take them in/i }).click();
    await expect(reveal).toBeHidden();

    // ── They are really ours ──────────────────────────────────────────────
    expect(await rosterSize(page)).toBe(before + 10);
    await expect(page.getByText(/0 faded sigils held/i)).toBeVisible({ timeout: 15_000 });

    // And the Chronicle knows about them. `owned` counts collectable champions only, and
    // the brood banner is mostly brood-kin — so the honest invariant is *copies*: the
    // starter plus ten.
    const chronicle = await readChronicle(page);
    const copies = chronicle.entries.reduce((sum, entry) => sum + entry.copies, 0);
    expect(copies).toBe(11);
  });

  test('the Chronicle records the champions a warden has met', async ({ page }) => {
    test.slow();
    await register(page, 'e2ec', 'Scribe');

    const chronicle = await readChronicle(page);

    // The starter is owned; the rest of the roster is listed but unclaimed. `entries`
    // exceeds `total` because brood-kin are listed and do not count toward completion.
    expect(chronicle.owned).toBe(1);
    expect(chronicle.total).toBeGreaterThan(30);
    expect(chronicle.entries.length).toBeGreaterThan(chronicle.total);
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

  const starterDialog = page.getByRole('dialog', { name: /choose your first champion/i });
  await expect(starterDialog).toBeVisible({ timeout: 20_000 });
  await starterDialog
    .getByRole('button', { name: /^choose /i })
    .first()
    .click();
  await starterDialog.getByRole('button', { name: /stand together/i }).click();
  await expect(starterDialog).toBeHidden({ timeout: 15_000 });
}

async function rosterSize(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const response = await fetch('/api/player/champions', { credentials: 'include' });
    const body = (await response.json()) as { data?: { champions?: unknown[] } };
    return body.data?.champions?.length ?? 0;
  });
}

interface ChronicleView {
  owned: number;
  total: number;
  entries: { championKey: string; copies: number }[];
}

async function readChronicle(page: Page): Promise<ChronicleView> {
  return page.evaluate(async () => {
    const response = await fetch('/api/chronicle', { credentials: 'include' });
    const body = (await response.json()) as {
      data: {
        chronicle: {
          owned: number;
          total: number;
          entries: { championKey: string; copies: number }[];
        };
      };
    };
    return body.data.chronicle;
  });
}
