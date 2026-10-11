# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.test.ts >> Authentication Flow >> should load login page
- Location: tests\e2e\auth.test.ts:12:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=Entre em sua conta')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('text=Entre em sua conta') with timeout 5000ms
  - waiting for locator('text=Entre em sua conta')

```

```yaml
- img "Unnify Conecta"
- paragraph: Bem-vindo de volta
- heading "Continue no controle da sua empresa." [level=1]
- paragraph: Acesse sua conta e continue acompanhando suas finanças, documentos e informações do seu negócio.
- text: Suas informações em um só lugar Conectado ao seu contador Acompanhe a saúde da sua empresa U nnify
- navigation: Início Financeiro Documentos Obrigações Relatórios Meu contador
- text: EE
- heading "Olá, Empresa Exemplo 👋" [level=3]
- paragraph: Acompanhe o resumo do seu mês
- paragraph: Setembro/2026
- paragraph: Receita
- paragraph: R$ 48.750
- text: ↑ +12,4%
- paragraph: Despesas
- paragraph: R$ 31.420
- text: ↑ +4,8%
- paragraph: Resultado
- paragraph: R$ 17.330
- text: ↑ +27,3%
- paragraph: Fluxo de caixa
- text: Jan Set
- paragraph: Saúde da sua empresa
- text: "78"
- paragraph: Saudável
- paragraph: Sua empresa está em um bom momento financeiro. Continue acompanhando.
- text: U E
- paragraph: Olá!
- paragraph: Empresa Exemplo
- paragraph: Receita
- paragraph: R$ 48.750
- paragraph: Despesas
- paragraph: R$ 31.420
- paragraph: Resultado
- paragraph: R$ 17.330
- link "Ainda não possui uma conta? Criar conta":
  - /url: /signup
  - text: Ainda não possui uma conta?
  - button "Criar conta"
- paragraph: Acesse sua conta
- heading "Bem-vindo de volta" [level=2]
- paragraph: Entre com seus dados para continuar.
- text: E-mail
- textbox "seu@email.com"
- text: Senha
- link "Esqueceu sua senha?":
  - /url: /forgot-password
- textbox "Sua senha"
- button
- button "Entrar →"
- text: ou
- button "Continuar com o Google":
  - img
  - text: Continuar com o Google
- alert
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | const BASE_URL = 'http://localhost:3000';
  4   | 
  5   | // Test account credentials
  6   | const TEST_ACCOUNT = {
  7   |   email: 'unnifybr@gmail.com',
  8   |   password: 'TestPass123!' // Needs to be set in Supabase
  9   | };
  10  | 
  11  | test.describe('Authentication Flow', () => {
  12  |   test('should load login page', async ({ page }) => {
  13  |     await page.goto(`${BASE_URL}/login`);
  14  | 
> 15  |     await expect(page.locator('text=Entre em sua conta')).toBeVisible();
      |                                                           ^ Error: expect(locator).toBeVisible() failed
  16  |     await expect(page.locator('input[placeholder*="email"]')).toBeVisible();
  17  |     await expect(page.locator('input[placeholder*="senha"]')).toBeVisible();
  18  |   });
  19  | 
  20  |   test('should redirect unauthenticated users to /login', async ({ page }) => {
  21  |     // Try to access protected route without auth
  22  |     await page.goto(`${BASE_URL}/app`, { waitUntil: 'networkidle' });
  23  | 
  24  |     const currentUrl = page.url();
  25  |     // Should either redirect to login or show login page
  26  |     if (!currentUrl.includes('/login')) {
  27  |       const loginForm = page.locator('input[placeholder*="email"]');
  28  |       if (!(await loginForm.isVisible().catch(() => false))) {
  29  |         throw new Error(`Expected redirect to /login, got ${currentUrl}`);
  30  |       }
  31  |     }
  32  |   });
  33  | });
  34  | 
  35  | test.describe('Admin Master Redirect', () => {
  36  |   test('admin_master should redirect from /onboarding to /admin', async ({ page }) => {
  37  |     // Navigate to onboarding
  38  |     await page.goto(`${BASE_URL}/onboarding`);
  39  | 
  40  |     await page.waitForTimeout(2000);
  41  | 
  42  |     const currentUrl = page.url();
  43  | 
  44  |     // Should redirect to /admin or show admin layout
  45  |     if (currentUrl.includes('/onboarding')) {
  46  |       // Check if there's a redirect happening
  47  |       const adminContent = page.locator('text=/Dashboard|Admin|Administración/i');
  48  |       if (!(await adminContent.isVisible().catch(() => false))) {
  49  |         console.log('⚠️  Still on /onboarding - user may not have admin_master role');
  50  |       }
  51  |     } else if (currentUrl.includes('/admin')) {
  52  |       console.log('✅ Correctly redirected to /admin');
  53  |     }
  54  |   });
  55  | });
  56  | 
  57  | test.describe('Role-Based Access Control', () => {
  58  |   test('should show appropriate UI based on user role', async ({ page }) => {
  59  |     await page.goto(`${BASE_URL}/app`);
  60  | 
  61  |     // Check if page loaded
  62  |     const pageContent = page.locator('body');
  63  |     await expect(pageContent).toBeTruthy();
  64  | 
  65  |     // Look for role-specific elements
  66  |     const adminMenu = page.locator('text=/Contadores|Empresas|Assinaturas/i');
  67  |     const userMenu = page.locator('text=/Minhas empresas|Solicitar/i');
  68  | 
  69  |     const hasAdminUI = await adminMenu.isVisible().catch(() => false);
  70  |     const hasUserUI = await userMenu.isVisible().catch(() => false);
  71  | 
  72  |     if (hasAdminUI) {
  73  |       console.log('✅ Admin UI visible');
  74  |     } else if (hasUserUI) {
  75  |       console.log('✅ User UI visible');
  76  |     } else {
  77  |       console.log('⚠️  Could not determine role from UI');
  78  |     }
  79  |   });
  80  | });
  81  | 
  82  | test.describe('Navigation', () => {
  83  |   test('should have working navigation menu', async ({ page }) => {
  84  |     await page.goto(`${BASE_URL}/app`);
  85  | 
  86  |     await page.waitForTimeout(1000);
  87  | 
  88  |     // Look for menu items
  89  |     const menuItems = page.locator('nav button, nav a, [role="menuitem"]');
  90  |     const itemCount = await menuItems.count();
  91  | 
  92  |     if (itemCount > 0) {
  93  |       console.log(`✅ Found ${itemCount} menu items`);
  94  |     } else {
  95  |       console.log('⚠️  No menu items found');
  96  |     }
  97  |   });
  98  | 
  99  |   test('should handle page transitions without 500 errors', async ({ page }) => {
  100 |     const errors: string[] = [];
  101 | 
  102 |     page.on('response', resp => {
  103 |       if (resp.status() === 500) {
  104 |         errors.push(`500 error on ${resp.url()}`);
  105 |       }
  106 |     });
  107 | 
  108 |     await page.goto(`${BASE_URL}/app`);
  109 |     await page.waitForTimeout(2000);
  110 | 
  111 |     if (errors.length > 0) {
  112 |       throw new Error(`Found ${errors.length} server errors: ${errors.join(', ')}`);
  113 |     }
  114 | 
  115 |     console.log('✅ No 500 errors during page load');
```