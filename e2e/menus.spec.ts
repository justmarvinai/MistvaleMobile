import { expect, test, type Page } from '@playwright/test';
import { chooseStarter, leaveTutorial, unique } from './support';

/**
 * The chrome a player operates, rather than the game it frames (C50).
 *
 * Two of the owner's five live here, and both are about a menu answering the pointer at
 * all: a scroller you can shove instead of hunting for a bar, and four glyphs in the corner
 * of every screen that had never said what they were.
 *
 * The rules inside `ui/dragScroll` are unit-tested; what a browser adds is the part no unit
 * test can reach — that a real scroller with real layout actually moves under a press, that
 * the click a drag ends with is eaten, and, the fault the first cut shipped, that a drag
 * ending over nothing clickable does **not** leave a listener armed to eat somebody's next
 * press.
 */

test.describe('press and hold to scroll', () => {
  // A short window on purpose: since C48 nothing on a fresh account overflows at 1440×900,
  // which is the pass working and leaves this spec with no subject. A 1024×640 laptop is
  // where a hub of eight cards is taller than its frame — and where a player most wants to
  // shove a list rather than aim at a bar.
  test.use({ viewport: { width: 1024, height: 640 } });

  test('shoves a menu, eats the click it ends on, and leaves the next one alone', async ({
    page,
  }) => {
    test.slow();
    await register(page, 'e2edrag', 'Shover');

    await page
      .getByRole('navigation')
      .getByRole('button', { name: /^Battle\b/i })
      .click();
    const campaign = page.getByRole('button', { name: /^Campaign\b/i }).first();
    await expect(campaign).toBeVisible({ timeout: 20_000 });

    const scrolled = async (): Promise<number> =>
      page.evaluate(() => {
        let most = 0;
        for (const el of document.querySelectorAll('*')) {
          if (el instanceof HTMLElement) most = Math.max(most, el.scrollTop);
        }
        return most;
      });

    expect(await scrolled(), 'nothing is scrolled to begin with').toBe(0);

    // A press on a card, dragged upward — the gesture a player makes on a list they want to
    // move, started on the only thing there is to grab. In steps, because a single jump is
    // one pointermove and the threshold has to be crossed before the scroller takes it.
    const card = await campaign.boundingBox();
    if (!card) throw new Error('the Campaign card has no box');
    const from = { x: card.x + card.width / 2, y: card.y + card.height / 2 };
    await drag(page, from, 260);

    expect(await scrolled(), 'the menu moved under the pointer').toBeGreaterThan(100);
    // And the card it was grabbed by did not open: the click a drag ends with is eaten.
    await expect(campaign, 'still on the hub').toBeVisible();

    // A drag that ends over nothing clickable must not arm a listener that eats the next
    // real click. The first cut swallowed "the next click" with a one-shot listener, so a
    // drag ending on empty space sat there and ate a press minutes later on another screen.
    await drag(page, { x: 12, y: 400 }, 120);

    // A press that does not travel is still a click.
    await campaign.click();
    await expect(page.getByRole('heading', { name: /campaign|the vale/i }).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('scrolls the body of a dialog, not the screen behind it', async ({ page }) => {
    test.slow();
    await register(page, 'e2edragd', 'Dialoger');

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    const box = await dialog.boundingBox();
    if (!box) throw new Error('the settings dialog has no box');
    await drag(page, { x: box.x + box.width / 2, y: box.y + box.height * 0.7 }, 200);

    const inside = await dialog.evaluate((node) => {
      let most = 0;
      for (const el of node.querySelectorAll('*')) {
        if (el instanceof HTMLElement) most = Math.max(most, el.scrollTop);
      }
      return most;
    });
    expect(inside, "the dialog's own body took the gesture").toBeGreaterThan(60);
  });
});

test.describe('the top bar names its tools', () => {
  test('every glyph in the corner says what it is', async ({ page }) => {
    test.slow();
    await register(page, 'e2etools', 'Toolhand');

    // Asserted on the card's *content* rather than on it appearing and disappearing: the
    // shared tooltip is one node parked off-screen between hovers, which Playwright counts
    // as visible — so "it hid" is not a question this element can answer. What it can
    // answer is whether it is now about the thing under the pointer.
    const tip = page.locator('.fui-tooltip');
    for (const [label, sentence] of [
      ['Mail', /attach/i],
      ['News', /announcement/i],
      ['Settings', /slider/i],
      ['Sign out', /server/i],
    ] as const) {
      await page.mouse.move(8, 400);
      await page.getByRole('button', { name: label, exact: true }).hover();
      await expect(tip, `${label} says what it is`).toContainText(label, { timeout: 10_000 });
      await expect(tip, `${label} says what it is for`).toContainText(sentence);
    }
  });
});

/** A press, a real journey upward, and a release. */
async function drag(
  page: Page,
  from: { x: number; y: number },
  distance: number,
  steps = 10,
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(from.x, from.y - (distance / steps) * step);
  }
  await page.mouse.up();
}

async function register(page: Page, account: string, profile: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('tab', { name: 'New warden' }).click();
  await page.getByLabel('Account name').fill(unique(account));
  await page.getByLabel('Profile name').fill(unique(profile));
  await page.getByLabel('Password', { exact: true }).fill('a-good-long-password');
  await page.getByRole('button', { name: 'Take up the lantern' }).click();
  await leaveTutorial(page);
  await chooseStarter(page);
}
