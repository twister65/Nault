import { test, expect } from '@playwright/test';
test('Nault boots into its actual wallet shell, not its loading placeholder', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('app-root .app-grid')).toBeVisible();
  await expect(page.locator('app-root')).not.toContainText('Loading Nault...');
  await expect(page).toHaveTitle('Nault');
});
