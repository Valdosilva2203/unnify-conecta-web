import { test, expect } from '@playwright/test';

test.describe('Authentication Flow Tests', () => {
  const BASE_URL = 'http://localhost:3000';

  test('Login page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test('Admin page accessible', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/admin`);
    expect(response?.status()).toBe(200);
  });

  test('Onboarding page accessible', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/onboarding`);
    expect(response?.status()).toBe(200);
  });
});
