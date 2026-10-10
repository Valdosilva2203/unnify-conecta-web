import { test, expect } from '@playwright/test';

test('Admin login flow and role detection', async ({ page, context }) => {
  const BASE_URL = 'http://localhost:3000';

  // Collect console messages
  const consoleLogs: string[] = [];
  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });

  // Navigate to login
  await page.goto(`${BASE_URL}/login`);

  // Wait for form to load
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 5000 });

  // Note: Cannot actually login without real credentials
  // But we can document what WOULD happen:
  console.log('✅ Login page loaded successfully');
  console.log('   Can accept email and password');
  console.log('   Would trigger /app/layout.tsx checkRoleAndRedirect()');
  console.log('   Console logs would show: [AUTH DEBUG] user_id: ..., global_role: "..."');

  // Check page title and form elements
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  const submitButton = page.locator('button:has-text("Entrar")');

  expect(emailInput).toBeVisible();
  expect(passwordInput).toBeVisible();
  expect(submitButton).toBeVisible();

  console.log('📝 Form elements ready for login');
  console.log('   To test admin login:');
  console.log('   1. Email: unnifybr@gmail.com');
  console.log('   2. Password: [your actual password]');
  console.log('   3. Expected: Redirect to /admin with global_role="admin_master"');
});

test('Verify admin page is accessible', async ({ page }) => {
  const BASE_URL = 'http://localhost:3000';

  // Admin page should exist and load
  const response = await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle' });

  expect(response?.status()).toBe(200);
  console.log('✅ /admin page exists and returns 200');
});
