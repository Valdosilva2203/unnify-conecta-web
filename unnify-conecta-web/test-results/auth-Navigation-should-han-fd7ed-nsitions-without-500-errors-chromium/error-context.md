# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.test.ts >> Navigation >> should handle page transitions without 500 errors
- Location: tests\e2e\auth.test.ts:99:7

# Error details

```
Error: Found 1 server errors: 500 error on http://localhost:3000/app
```

# Page snapshot

```yaml
- generic:
  - generic [active]:
    - generic [ref=e3]:
      - generic [ref=e4]:
        - navigation [ref=e6]:
          - button [disabled] [ref=e7]:
            - img "previous" [ref=e8]
          - generic [ref=e10]:
            - generic [ref=e11]: 1/
            - generic [ref=e12]: "1"
          - button [disabled] [ref=e13]:
            - img "next" [ref=e14]
        - generic [ref=e17]:
          - generic "Latest available version is detected (16.4.0)." [ref=e20]: Next.js 16.4.0
          - generic [ref=e21]: Turbopack
      - dialog "Build Error" [ref=e23]:
        - generic [ref=e26]:
          - generic [ref=e28]:
            - generic [ref=e29]:
              - generic [ref=e30]: Build Error
              - generic [ref=e32]:
                - button "Copy Error Info" [ref=e33] [cursor=pointer]
                - button "No related documentation found" [disabled] [ref=e36]
                - button "Attach Node.js inspector" [ref=e39] [cursor=pointer]
            - generic [ref=e48]: "Route segment config \"dynamic\" is not compatible with `nextConfig.cacheComponents`. Please remove it."
          - generic [ref=e51]:
            - generic [ref=e53]:
              - generic [ref=e58]: ./unnify-conecta-web/app/onboarding/empresa/page.tsx (6:14)
              - button "Open in editor" [ref=e59] [cursor=pointer]
            - generic [ref=e64]:
              - generic [ref=e65]: "Error: Route segment config \"dynamic\" is not compatible with `nextConfig.cacheComponents`. Please remove it."
              - generic [ref=e66]: 4 |
              - text: import
              - generic [ref=e67]: "{ useEffect, useState, useRef }"
              - text: from 'react'
              - generic [ref=e68]: ;
              - generic [ref=e69]: 5 |
              - text: ">"
              - generic [ref=e70]: 6 |
              - text: export const
              - generic [ref=e71]: dynamic =
              - text: "'force-dynamic'"
              - generic [ref=e72]: ;
              - generic [ref=e73]: "|"
              - text: ^^^^^^^
              - generic [ref=e74]: 7 |
              - text: import Image from 'next/image'
              - generic [ref=e75]: ;
              - generic [ref=e76]: 8 |
              - text: import
              - generic [ref=e77]: "{ createClient }"
              - text: from '@/lib/supabase/client'
              - generic [ref=e78]: ;
              - generic [ref=e79]: 9 |
              - text: import
              - generic [ref=e80]: "{"
              - text: StepsIndicator
              - generic [ref=e81]: "}"
              - text: from '@/components/onboarding/StepsIndicator'
              - generic [ref=e82]: "; Ecmascript file had an error Import traces: Client Component Browser: ./unnify-conecta-web/app/onboarding/empresa/page.tsx [Client Component Browser] ./unnify-conecta-web/app/onboarding/empresa/page.tsx [Server Component] Client Component SSR: ./unnify-conecta-web/app/onboarding/empresa/page.tsx [Client Component SSR] ./unnify-conecta-web/app/onboarding/empresa/page.tsx [Server Component]"
    - generic [ref=e87] [cursor=pointer]:
      - button "Open Next.js Dev Tools" [ref=e88]
      - button "Open issues overlay" [ref=e93]:
        - generic [ref=e94]:
          - generic [aria-hidden] [ref=e95]: "0"
          - generic [ref=e96]: "1"
        - generic [ref=e97]: Issue
  - alert [ref=e98]
```

# Test source

```ts
  12  |   test('should load login page', async ({ page }) => {
  13  |     await page.goto(`${BASE_URL}/login`);
  14  | 
  15  |     await expect(page.locator('text=Entre em sua conta')).toBeVisible();
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
> 112 |       throw new Error(`Found ${errors.length} server errors: ${errors.join(', ')}`);
      |             ^ Error: Found 1 server errors: 500 error on http://localhost:3000/app
  113 |     }
  114 | 
  115 |     console.log('✅ No 500 errors during page load');
  116 |   });
  117 | });
  118 | 
  119 | test.describe('Console Errors', () => {
  120 |   test('should not have critical console errors on /app', async ({ page }) => {
  121 |     const consoleErrors: string[] = [];
  122 | 
  123 |     page.on('console', msg => {
  124 |       if (msg.type() === 'error') {
  125 |         consoleErrors.push(msg.text());
  126 |       }
  127 |     });
  128 | 
  129 |     await page.goto(`${BASE_URL}/app`);
  130 |     await page.waitForTimeout(2000);
  131 | 
  132 |     // Filter out non-critical errors
  133 |     const criticalErrors = consoleErrors.filter(e =>
  134 |       !e.includes('Fallback') &&
  135 |       !e.includes('download') &&
  136 |       !e.includes('ad')
  137 |     );
  138 | 
  139 |     if (criticalErrors.length > 0) {
  140 |       console.log('⚠️  Console errors found:');
  141 |       criticalErrors.forEach(e => console.log(`  - ${e.substring(0, 100)}`));
  142 |     } else {
  143 |       console.log('✅ No critical console errors');
  144 |     }
  145 |   });
  146 | });
  147 | 
```