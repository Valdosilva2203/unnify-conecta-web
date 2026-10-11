# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: signup.test.ts >> Signup Flow >> should signup with valid data
- Location: tests\e2e\signup.test.ts:20:7

# Error details

```
Error: page.fill: Page crashed
Call log:
  - waiting for locator('input[placeholder="Seu nome completo"]')

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | const BASE_URL = 'http://localhost:3000';
  4   | 
  5   | test.describe('Signup Flow', () => {
  6   |   test('should load signup page', async ({ page }) => {
  7   |     await page.goto(`${BASE_URL}/signup`);
  8   | 
  9   |     // Check if page loaded
  10  |     const title = await page.locator('h2:has-text("Vamos começar?")');
  11  |     await expect(title).toBeVisible();
  12  | 
  13  |     // Check form elements
  14  |     await expect(page.locator('input[placeholder="Seu nome completo"]')).toBeVisible();
  15  |     await expect(page.locator('input[placeholder="seu@email.com"]')).toBeVisible();
  16  |     await expect(page.locator('input[placeholder="Crie uma senha segura"]')).toBeVisible();
  17  |     await expect(page.locator('button:has-text("Criar minha conta")')).toBeVisible();
  18  |   });
  19  | 
  20  |   test('should signup with valid data', async ({ page }) => {
  21  |     const timestamp = Date.now();
  22  |     const testEmail = `teste-${timestamp}@test.com`;
  23  |     const testPassword = 'TestPass123!';
  24  |     const testName = 'Teste User';
  25  | 
  26  |     await page.goto(`${BASE_URL}/signup`);
  27  | 
  28  |     // Fill form
> 29  |     await page.fill('input[placeholder="Seu nome completo"]', testName);
      |                ^ Error: page.fill: Page crashed
  30  |     await page.fill('input[placeholder="seu@email.com"]', testEmail);
  31  |     await page.fill('input[placeholder="Crie uma senha segura"]', testPassword);
  32  | 
  33  |     // Check for validation errors
  34  |     const passwordField = page.locator('input[placeholder="Crie uma senha segura"]');
  35  |     await passwordField.blur();
  36  | 
  37  |     // Wait a bit for validation
  38  |     await page.waitForTimeout(500);
  39  | 
  40  |     // Submit form
  41  |     const submitButton = page.locator('button:has-text("Criar minha conta")');
  42  |     await submitButton.click();
  43  | 
  44  |     // Wait for response
  45  |     await page.waitForTimeout(3000);
  46  | 
  47  |     // Check for errors
  48  |     const errorMessage = page.locator('text=/Database error|500|erro/i');
  49  |     const errorVisible = await errorMessage.isVisible().catch(() => false);
  50  | 
  51  |     if (errorVisible) {
  52  |       const errorText = await errorMessage.textContent();
  53  |       throw new Error(`Signup failed with error: ${errorText}`);
  54  |     }
  55  | 
  56  |     // Check if redirected to onboarding
  57  |     const currentUrl = page.url();
  58  |     console.log('Current URL after signup:', currentUrl);
  59  | 
  60  |     if (currentUrl.includes('/onboarding') || currentUrl.includes('/app')) {
  61  |       console.log('✅ Signup successful - redirected to onboarding/app');
  62  |     } else {
  63  |       // Sometimes redirect happens via JS, check for specific elements
  64  |       const onboardingTitle = page.locator('text=/Complète seu perfil|Welcome/i');
  65  |       if (await onboardingTitle.isVisible().catch(() => false)) {
  66  |         console.log('✅ Signup successful - onboarding page visible');
  67  |       }
  68  |     }
  69  |   });
  70  | 
  71  |   test('should show validation errors for invalid data', async ({ page }) => {
  72  |     await page.goto(`${BASE_URL}/signup`);
  73  | 
  74  |     // Try submit empty form
  75  |     const submitButton = page.locator('button:has-text("Criar minha conta")');
  76  |     await submitButton.click();
  77  | 
  78  |     // Check for validation errors
  79  |     await expect(page.locator('text=Nome completo é obrigatório')).toBeVisible();
  80  |     await expect(page.locator('text=E-mail é obrigatório')).toBeVisible();
  81  |     await expect(page.locator('text=Senha é obrigatória')).toBeVisible();
  82  |   });
  83  | 
  84  |   test('should validate email format', async ({ page }) => {
  85  |     await page.goto(`${BASE_URL}/signup`);
  86  | 
  87  |     // Fill with invalid email
  88  |     await page.fill('input[placeholder="seu@email.com"]', 'invalid-email');
  89  |     const emailField = page.locator('input[placeholder="seu@email.com"]');
  90  |     await emailField.blur();
  91  | 
  92  |     await page.waitForTimeout(300);
  93  | 
  94  |     // Check for validation error
  95  |     const errorMsg = page.locator('text=E-mail inválido');
  96  |     if (await errorMsg.isVisible().catch(() => false)) {
  97  |       console.log('✅ Email validation working');
  98  |     }
  99  |   });
  100 | 
  101 |   test('should validate password requirements', async ({ page }) => {
  102 |     await page.goto(`${BASE_URL}/signup`);
  103 | 
  104 |     // Try with weak password
  105 |     const passwordField = page.locator('input[placeholder="Crie uma senha segura"]');
  106 | 
  107 |     await passwordField.fill('weak');
  108 |     await passwordField.blur();
  109 |     await page.waitForTimeout(300);
  110 | 
  111 |     const errorMsg = page.locator('text=/Mínimo de 8 caracteres|Deve conter/');
  112 |     if (await errorMsg.isVisible().catch(() => false)) {
  113 |       console.log('✅ Password validation working');
  114 |     }
  115 |   });
  116 | });
  117 | 
  118 | test.describe('Database Connection', () => {
  119 |   test('should have working trigger on signup', async ({ page }) => {
  120 |     const timestamp = Date.now();
  121 |     const testEmail = `db-test-${timestamp}@test.com`;
  122 |     const testPassword = 'TestPass123!';
  123 | 
  124 |     await page.goto(`${BASE_URL}/signup`);
  125 | 
  126 |     await page.fill('input[placeholder="Seu nome completo"]', 'DB Test');
  127 |     await page.fill('input[placeholder="seu@email.com"]', testEmail);
  128 |     await page.fill('input[placeholder="Crie uma senha segura"]', testPassword);
  129 | 
```