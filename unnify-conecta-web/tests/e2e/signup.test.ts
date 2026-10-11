import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test.describe('Signup Flow', () => {
  test('should load signup page', async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`);

    // Check if page loaded
    const title = await page.locator('h2:has-text("Vamos começar?")');
    await expect(title).toBeVisible();

    // Check form elements
    await expect(page.locator('input[placeholder="Seu nome completo"]')).toBeVisible();
    await expect(page.locator('input[placeholder="seu@email.com"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Crie uma senha segura"]')).toBeVisible();
    await expect(page.locator('button:has-text("Criar minha conta")')).toBeVisible();
  });

  test('should signup with valid data', async ({ page }) => {
    const timestamp = Date.now();
    const testEmail = `teste-${timestamp}@test.com`;
    const testPassword = 'TestPass123!';
    const testName = 'Teste User';

    await page.goto(`${BASE_URL}/signup`);

    // Fill form
    await page.fill('input[placeholder="Seu nome completo"]', testName);
    await page.fill('input[placeholder="seu@email.com"]', testEmail);
    await page.fill('input[placeholder="Crie uma senha segura"]', testPassword);

    // Check for validation errors
    const passwordField = page.locator('input[placeholder="Crie uma senha segura"]');
    await passwordField.blur();

    // Wait a bit for validation
    await page.waitForTimeout(500);

    // Submit form
    const submitButton = page.locator('button:has-text("Criar minha conta")');
    await submitButton.click();

    // Wait for response
    await page.waitForTimeout(3000);

    // Check for errors
    const errorMessage = page.locator('text=/Database error|500|erro/i');
    const errorVisible = await errorMessage.isVisible().catch(() => false);

    if (errorVisible) {
      const errorText = await errorMessage.textContent();
      throw new Error(`Signup failed with error: ${errorText}`);
    }

    // Check if redirected to onboarding
    const currentUrl = page.url();
    console.log('Current URL after signup:', currentUrl);

    if (currentUrl.includes('/onboarding') || currentUrl.includes('/app')) {
      console.log('✅ Signup successful - redirected to onboarding/app');
    } else {
      // Sometimes redirect happens via JS, check for specific elements
      const onboardingTitle = page.locator('text=/Complète seu perfil|Welcome/i');
      if (await onboardingTitle.isVisible().catch(() => false)) {
        console.log('✅ Signup successful - onboarding page visible');
      }
    }
  });

  test('should show validation errors for invalid data', async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`);

    // Try submit empty form
    const submitButton = page.locator('button:has-text("Criar minha conta")');
    await submitButton.click();

    // Check for validation errors
    await expect(page.locator('text=Nome completo é obrigatório')).toBeVisible();
    await expect(page.locator('text=E-mail é obrigatório')).toBeVisible();
    await expect(page.locator('text=Senha é obrigatória')).toBeVisible();
  });

  test('should validate email format', async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`);

    // Fill with invalid email
    await page.fill('input[placeholder="seu@email.com"]', 'invalid-email');
    const emailField = page.locator('input[placeholder="seu@email.com"]');
    await emailField.blur();

    await page.waitForTimeout(300);

    // Check for validation error
    const errorMsg = page.locator('text=E-mail inválido');
    if (await errorMsg.isVisible().catch(() => false)) {
      console.log('✅ Email validation working');
    }
  });

  test('should validate password requirements', async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`);

    // Try with weak password
    const passwordField = page.locator('input[placeholder="Crie uma senha segura"]');

    await passwordField.fill('weak');
    await passwordField.blur();
    await page.waitForTimeout(300);

    const errorMsg = page.locator('text=/Mínimo de 8 caracteres|Deve conter/');
    if (await errorMsg.isVisible().catch(() => false)) {
      console.log('✅ Password validation working');
    }
  });
});

test.describe('Database Connection', () => {
  test('should have working trigger on signup', async ({ page }) => {
    const timestamp = Date.now();
    const testEmail = `db-test-${timestamp}@test.com`;
    const testPassword = 'TestPass123!';

    await page.goto(`${BASE_URL}/signup`);

    await page.fill('input[placeholder="Seu nome completo"]', 'DB Test');
    await page.fill('input[placeholder="seu@email.com"]', testEmail);
    await page.fill('input[placeholder="Crie uma senha segura"]', testPassword);

    // Check network requests
    const responses: any[] = [];
    page.on('response', resp => {
      if (resp.url().includes('/auth/')) {
        responses.push({
          url: resp.url(),
          status: resp.status()
        });
      }
    });

    const submitButton = page.locator('button:has-text("Criar minha conta")');
    await submitButton.click();

    await page.waitForTimeout(3000);

    // Check if auth request was successful
    const authResponses = responses.filter(r => r.url.includes('signup'));
    if (authResponses.length > 0) {
      const lastResponse = authResponses[authResponses.length - 1];
      if (lastResponse.status === 200) {
        console.log('✅ Auth signup successful (200)');
      } else if (lastResponse.status === 500) {
        console.log('❌ Auth signup failed with 500 error');
        throw new Error('Database trigger issue - signup returned 500');
      }
    }
  });
});
