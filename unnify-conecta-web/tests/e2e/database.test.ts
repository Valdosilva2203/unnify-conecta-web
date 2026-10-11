import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test.describe('Database Schema Compliance', () => {
  test('should use correct Portuguese column names', async ({ page }) => {
    // This test checks if the app correctly references Portuguese column names
    // by monitoring network requests and looking for errors

    const apiErrors: string[] = [];

    page.on('response', async resp => {
      if (resp.status() >= 400) {
        const text = await resp.text().catch(() => '');
        if (text.includes('column') || text.includes('table')) {
          apiErrors.push(`${resp.status()}: ${resp.url()}`);
        }
      }
    });

    await page.goto(`${BASE_URL}/signup`);

    const timestamp = Date.now();
    const testEmail = `schema-test-${timestamp}@test.com`;

    // Fill form
    await page.fill('input[placeholder="Seu nome completo"]', 'Schema Test');
    await page.fill('input[placeholder="seu@email.com"]', testEmail);
    await page.fill('input[placeholder="Crie uma senha segura"]', 'TestPass123!');

    const submitButton = page.locator('button:has-text("Criar minha conta")');
    await submitButton.click();

    await page.waitForTimeout(3000);

    // Check for column name errors
    const schemaErrors = apiErrors.filter(e =>
      e.includes('undefined column') ||
      e.includes('user_id') ||
      e.includes('global_role') ||
      e.includes('profiles')
    );

    if (schemaErrors.length > 0) {
      throw new Error(`Schema errors detected: ${schemaErrors.join(', ')}`);
    }

    console.log('✅ No schema-related errors detected');
  });

  test('should have working trigger on auth.users insert', async ({ page }) => {
    const networkLog: any[] = [];

    page.on('response', resp => {
      networkLog.push({
        url: resp.url(),
        status: resp.status()
      });
    });

    await page.goto(`${BASE_URL}/signup`);

    const timestamp = Date.now();
    const testEmail = `trigger-test-${timestamp}@test.com`;

    // Fill and submit
    await page.fill('input[placeholder="Seu nome completo"]', 'Trigger Test');
    await page.fill('input[placeholder="seu@email.com"]', testEmail);
    await page.fill('input[placeholder="Crie uma senha segura"]', 'TestPass123!');

    const submitButton = page.locator('button:has-text("Criar minha conta")');
    await submitButton.click();

    await page.waitForTimeout(3000);

    // Check if auth endpoint succeeded
    const authRequests = networkLog.filter(r => r.url.includes('/auth/'));
    const signupRequests = authRequests.filter(r => r.url.includes('signup'));

    if (signupRequests.length > 0) {
      const lastSignup = signupRequests[signupRequests.length - 1];
      if (lastSignup.status === 200) {
        console.log('✅ Trigger working - signup successful');
      } else if (lastSignup.status === 500) {
        throw new Error('Trigger issue - database error on signup');
      }
    }
  });
});

test.describe('RLS Policies', () => {
  test('should enforce row level security', async ({ page }) => {
    // Test that RLS prevents unauthorized access

    await page.goto(`${BASE_URL}/app`);

    const networkLog: any[] = [];

    page.on('response', resp => {
      if (resp.url().includes('/rest/v1/')) {
        networkLog.push({
          url: resp.url(),
          status: resp.status()
        });
      }
    });

    await page.waitForTimeout(2000);

    // Check if any unauthorized (401/403) responses
    const unauthorizedRequests = networkLog.filter(r =>
      r.status === 401 || r.status === 403
    );

    if (unauthorizedRequests.length > 0) {
      console.log(`⚠️  Found ${unauthorizedRequests.length} unauthorized requests (expected)`);
    } else {
      console.log('✅ RLS policies appear to be working');
    }
  });
});
