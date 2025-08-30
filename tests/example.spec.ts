import { test, expect } from '@playwright/test';
import { HomePage } from '../src/pages/home.page';

test.describe('TA88', () => {
  test.setTimeout(60_000);
  test.skip(({ browserName }) => browserName !== 'chromium', 'Site only stable on Chromium');
  test('homepage title is correct', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await expect(page).toHaveTitle('Swag Labs');
  });
});

