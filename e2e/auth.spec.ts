import { expect, test, type Page } from '@playwright/test';

/**
 * The Phase P0 exit criterion, exercised for real: a visitor registers, lands in the
 * Haven, sees their resources, navigates, signs out, and signs back in.
 */

/**
 * Clears the mandatory starter choice.
 *
 * A brand-new account must pick a champion before the Haven is usable — that is the
 * game's first screen, not an optional prompt. These tests are about the account
 * lifecycle, so they get past it and move on.
 */
async function chooseAStarter(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: /choose your first champion/i });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await dialog
    .getByRole('button', { name: /^choose /i })
    .first()
    .click();
  await dialog.getByRole('button', { name: /stand together/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

function uniqueSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

test.describe('account lifecycle', () => {
  test('a new warden can register, play, sign out and return', async ({ page }) => {
    const accountName = `e2e_${uniqueSuffix()}`;
    const profileName = `Warden${uniqueSuffix().slice(0, 6)}`;
    const password = 'a-good-long-password';

    // Uncaught exceptions are always a defect. Console messages are filtered: the
    // browser logs an "error" for the 401 the session probe deliberately triggers on a
    // first visit, which is expected behaviour rather than a fault.
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      const text = message.text();
      const expectedProbeFailure = text.includes('401');
      if (message.type() === 'error' && !expectedProbeFailure) pageErrors.push(text);
    });

    await page.goto('/');

    // The login screen is what an anonymous visitor gets.
    await expect(page.getByRole('heading', { name: 'Mistvale' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Sign in' })).toBeVisible();

    // Register.
    await page.getByRole('tab', { name: 'New warden' }).click();
    await page.getByLabel('Account name').fill(accountName);
    await page.getByLabel('Profile name').fill(profileName);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Take up the lantern' }).click();

    await chooseAStarter(page);

    // We land in the Haven with the shell around us.
    await expect(page.getByRole('heading', { name: 'The Haven' })).toBeVisible();
    await expect(page.getByText(profileName).first()).toBeVisible();
    await expect(page.getByText('Level 1', { exact: true })).toBeVisible();

    // Energy starts at the level-1 cap.
    await expect(page.getByText('/20')).toBeVisible();

    // Locked destinations are visible but refuse navigation.
    const arenaDockItem = page.getByRole('navigation').getByRole('button', { name: /Arena/ });
    await expect(arenaDockItem).toHaveAttribute('aria-disabled', 'true');

    // An unlocked destination navigates.
    await page
      .getByRole('navigation')
      .getByRole('button', { name: /Champions/ })
      .click();
    await expect(page.getByRole('heading', { name: 'Champions' })).toBeVisible();

    // Keyboard shortcut returns to the Haven (dock slot 1).
    await page.keyboard.press('1');
    await expect(page.getByRole('heading', { name: 'The Haven' })).toBeVisible();

    // Settings open and preferences persist.
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Reduce motion').check();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    // Sign out returns to the auth screen.
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('tab', { name: 'Sign in' })).toBeVisible();

    // Sign back in with the same credentials.
    await page.getByLabel('Account name').fill(accountName);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Enter the vale' }).click();
    await expect(page.getByRole('heading', { name: 'The Haven' })).toBeVisible();

    // The preference we set survived the round trip.
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByLabel('Reduce motion')).toBeChecked();

    expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
  });

  test('the session survives a page reload', async ({ page }) => {
    const accountName = `e2e_${uniqueSuffix()}`;

    await page.goto('/');
    await page.getByRole('tab', { name: 'New warden' }).click();
    await page.getByLabel('Account name').fill(accountName);
    await page.getByLabel('Profile name').fill(`Keep${uniqueSuffix().slice(0, 6)}`);
    await page.getByLabel('Password').fill('a-good-long-password');
    await page.getByRole('button', { name: 'Take up the lantern' }).click();
    await expect(page.getByRole('heading', { name: 'The Haven' })).toBeVisible();

    await page.reload();

    // The httpOnly cookie carries us straight back in — no login screen.
    await expect(page.getByRole('heading', { name: 'The Haven' })).toBeVisible();
  });

  test('bad credentials and duplicate names are reported inline', async ({ page }) => {
    const accountName = `e2e_${uniqueSuffix()}`;
    const profileName = `Dup${uniqueSuffix().slice(0, 6)}`;

    await page.goto('/');
    await page.getByRole('tab', { name: 'New warden' }).click();
    await page.getByLabel('Account name').fill(accountName);
    await page.getByLabel('Profile name').fill(profileName);
    await page.getByLabel('Password').fill('a-good-long-password');
    await page.getByRole('button', { name: 'Take up the lantern' }).click();
    await chooseAStarter(page);
    await expect(page.getByRole('heading', { name: 'The Haven' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();

    // Wrong password: the error lands on the password field.
    await page.getByLabel('Account name').fill(accountName);
    await page.getByLabel('Password').fill('definitely-wrong-password');
    await page.getByRole('button', { name: 'Enter the vale' }).click();
    await expect(page.getByRole('alert')).toContainText(/not right/i);

    // Duplicate account name: the error lands on the account-name field.
    await page.getByRole('tab', { name: 'New warden' }).click();
    await page.getByLabel('Account name').fill(accountName);
    await page.getByLabel('Profile name').fill(`Other${uniqueSuffix().slice(0, 6)}`);
    await page.getByLabel('Password').fill('a-good-long-password');
    await page.getByRole('button', { name: 'Take up the lantern' }).click();
    await expect(page.getByRole('alert')).toContainText(/already taken/i);
  });
});
