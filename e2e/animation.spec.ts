import { expect, test, type Page } from '@playwright/test';
import {
  chooseStarter,
  openCampaignStage,
  pickTeam,
  registerRaw,
  setSimpleBattlefield,
} from './support';

/**
 * That a fight *moves*.
 *
 * The owner's report (2026-08-23) was that battles are "extremely static besides the
 * characters having their animations" — the numbers changed and nothing else did. What
 * answers that is a layer of motion driven off the event log: a swing leans the attacker
 * toward whoever it is hitting, a landing shakes and flashes the body that took it, and a
 * ring opens where the blow arrived, coloured by the element that threw it.
 *
 * The work is split three ways and so is its coverage. `game/playback` decides *which*
 * beats an event produces and is unit-tested; `Battle/beats` decides how long each one
 * lives and is unit-tested; and this spec is the half neither of those can prove — that a
 * real fight in a real browser actually emits them. It drives the DOM battlefield because
 * that is the renderer with a DOM to interrogate: the painted one reads the same
 * `PlaybackView` through `battleScene`, so what is checked here is the model reaching a
 * renderer at all, not one renderer's markup.
 */

async function enterStageOne(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /^campaign$/i })
    .first()
    .click();
  await openCampaignStage(page);
  const dialog = page.getByRole('dialog', { name: /stage 1/i });
  await pickTeam(dialog);
  await dialog.getByRole('button', { name: /into the mist/i }).click();
  await expect(page.getByRole('button', { name: /^auto$/i })).toBeVisible({ timeout: 30_000 });
  const auto = page.getByRole('button', { name: /^auto$/i });
  if ((await auto.getAttribute('aria-pressed')) !== 'true') await auto.click();
}

test.describe('a fight that moves', () => {
  test('lands blows, shakes bodies and opens bursts where they arrive', async ({ page }) => {
    test.slow();
    await registerRaw(page, 'e2eanim', 'Animator');
    await chooseStarter(page);
    await setSimpleBattlefield(page);
    await enterStageOne(page);

    const field = page.locator('[data-battlefield="simple"]');
    await expect(field).toBeVisible();

    // A beat is on screen for a few hundred milliseconds and then gone, so it cannot be
    // waited for with a locator — the field is sampled instead, and what is collected is
    // the union of everything seen over one wave of a fight.
    const seen = new Set<string>();
    for (let tick = 0; tick < 150; tick += 1) {
      for (const beat of await field.evaluate((root) => {
        const out: string[] = [];
        for (const node of root.querySelectorAll('[data-beat]')) {
          const kind = node.getAttribute('data-beat');
          if (kind) out.push(`unit:${kind}`);
        }
        for (const node of root.querySelectorAll('[data-burst]')) {
          out.push(`burst:${node.getAttribute('data-kind')}`);
        }
        return out;
      })) {
        seen.add(beat);
      }
      // Every beat this asserts on has fired by now; the rest of the fight adds nothing.
      if (seen.has('unit:strike') && seen.has('unit:impact') && seen.has('burst:impact')) break;
      await page.waitForTimeout(60);
    }

    // The three that carry the whole thing: somebody swung, somebody was hit, and the hit
    // was drawn where it landed. A fight that produces none of these is the static one the
    // owner reported.
    expect([...seen].sort().join(' ')).toContain('unit:impact');
    expect(seen).toContain('unit:strike');
    expect(seen).toContain('burst:impact');
  });
});
