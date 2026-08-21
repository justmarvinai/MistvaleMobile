import { test } from '@playwright/test';
import { registerRaw, chooseStarter } from './support';

test('look', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await registerRaw(page, 'look', 'Look');
  await chooseStarter(page);
  await page.getByRole('button', { name: 'Champions' }).first().click();
  await page
    .getByRole('button', { name: /lv \d+ of \d+/i })
    .first()
    .click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'sheet.png' });
});
