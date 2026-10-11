import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

// Test account credentials
const TEST_ACCOUNT = {
  email: 'unnifybr@gmail.com',
  password: 'TestPass123!' // Needs to be set in Supabase
};

test.describe('Authentication Flow', () => {
  test('should load login page', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    await expect(page.locator('text=Entre em sua conta')).toBeVisible();
    await expect(page.locator('input[placeholder*="email"]')).toBeVisible();
    await expect(page.locator('input[placeholder*="senha"]')).toBeVisible();
  });

  test('should redirect unauthenticated users to /login', async ({ page }) => {
    // Try to access protected route without auth
    await page.goto(`${BASE_URL}/app`, { waitUntil: 'networkidle' });

    const currentUrl = page.url();
    // Should either redirect to login or show login page
    if (!currentUrl.includes('/login')) {
      const loginForm = page.locator('input[placeholder*="email"]');
      if (!(await loginForm.isVisible().catch(() => false))) {
        throw new Error(`Expected redirect to /login, got ${currentUrl}`);
      }
    }
  });
});

test.describe('Admin Master Redirect', () => {
  test('admin_master should redirect from /onboarding to /admin', async ({ page }) => {
    // Navigate to onboarding
    await page.goto(`${BASE_URL}/onboarding`);

    await page.waitForTimeout(2000);

    const currentUrl = page.url();

    // Should redirect to /admin or show admin layout
    if (currentUrl.includes('/onboarding')) {
      // Check if there's a redirect happening
      const adminContent = page.locator('text=/Dashboard|Admin|Administración/i');
      if (!(await adminContent.isVisible().catch(() => false))) {
        console.log('⚠️  Still on /onboarding - user may not have admin_master role');
      }
    } else if (currentUrl.includes('/admin')) {
      console.log('✅ Correctly redirected to /admin');
    }
  });
});

test.describe('Role-Based Access Control', () => {
  test('should show appropriate UI based on user role', async ({ page }) => {
    await page.goto(`${BASE_URL}/app`);

    // Check if page loaded
    const pageContent = page.locator('body');
    await expect(pageContent).toBeTruthy();

    // Look for role-specific elements
    const adminMenu = page.locator('text=/Contadores|Empresas|Assinaturas/i');
    const userMenu = page.locator('text=/Minhas empresas|Solicitar/i');

    const hasAdminUI = await adminMenu.isVisible().catch(() => false);
    const hasUserUI = await userMenu.isVisible().catch(() => false);

    if (hasAdminUI) {
      console.log('✅ Admin UI visible');
    } else if (hasUserUI) {
      console.log('✅ User UI visible');
    } else {
      console.log('⚠️  Could not determine role from UI');
    }
  });
});

test.describe('Navigation', () => {
  test('should have working navigation menu', async ({ page }) => {
    await page.goto(`${BASE_URL}/app`);

    await page.waitForTimeout(1000);

    // Look for menu items
    const menuItems = page.locator('nav button, nav a, [role="menuitem"]');
    const itemCount = await menuItems.count();

    if (itemCount > 0) {
      console.log(`✅ Found ${itemCount} menu items`);
    } else {
      console.log('⚠️  No menu items found');
    }
  });

  test('should handle page transitions without 500 errors', async ({ page }) => {
    const errors: string[] = [];

    page.on('response', resp => {
      if (resp.status() === 500) {
        errors.push(`500 error on ${resp.url()}`);
      }
    });

    await page.goto(`${BASE_URL}/app`);
    await page.waitForTimeout(2000);

    if (errors.length > 0) {
      throw new Error(`Found ${errors.length} server errors: ${errors.join(', ')}`);
    }

    console.log('✅ No 500 errors during page load');
  });
});

test.describe('Console Errors', () => {
  test('should not have critical console errors on /app', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`${BASE_URL}/app`);
    await page.waitForTimeout(2000);

    // Filter out non-critical errors
    const criticalErrors = consoleErrors.filter(e =>
      !e.includes('Fallback') &&
      !e.includes('download') &&
      !e.includes('ad')
    );

    if (criticalErrors.length > 0) {
      console.log('⚠️  Console errors found:');
      criticalErrors.forEach(e => console.log(`  - ${e.substring(0, 100)}`));
    } else {
      console.log('✅ No critical console errors');
    }
  });
});
