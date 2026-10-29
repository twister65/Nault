import { test, expect } from '@playwright/test';
test('Nault boots into its actual wallet shell, not its loading placeholder', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('app-root .app-grid')).toBeVisible();
  await expect(page.locator('app-root')).not.toContainText('Loading Nault...');
  await expect(page).toHaveTitle('Nault');
});

test('New software wallet advances from password to 24 BIP39 recovery words under Vite', async ({ page }) => {
  // Playwright creates a fresh browser context: no saved wallet or secret is reused.
  await page.goto('/configure-wallet');
  const setup = page.locator('app-configure-wallet');
  await setup.locator('button.wallet-option').first().click();
  const passwords = setup.locator('input[type=password]');
  await expect(passwords).toHaveCount(2);
  await passwords.nth(0).fill('fictional-test-password-2026');
  await passwords.nth(1).fill('fictional-test-password-2026');
  await setup.locator('.uk-card-footer button').click();
  await expect(setup.locator('#create-wallet')).toBeVisible();
  await expect(setup.locator('.mne-word')).toHaveCount(24);
  // Deliberately do not copy, log, export, or complete creation of the random seed.
});
