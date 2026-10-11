# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: database.test.ts >> Database Schema Compliance >> should use correct Portuguese column names
- Location: tests\e2e\database.test.ts:6:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('input[placeholder="Seu nome completo"]')

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
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | const BASE_URL = 'http://localhost:3000';
  4   | 
  5   | test.describe('Database Schema Compliance', () => {
  6   |   test('should use correct Portuguese column names', async ({ page }) => {
  7   |     // This test checks if the app correctly references Portuguese column names
  8   |     // by monitoring network requests and looking for errors
  9   | 
  10  |     const apiErrors: string[] = [];
  11  | 
  12  |     page.on('response', async resp => {
  13  |       if (resp.status() >= 400) {
  14  |         const text = await resp.text().catch(() => '');
  15  |         if (text.includes('column') || text.includes('table')) {
  16  |           apiErrors.push(`${resp.status()}: ${resp.url()}`);
  17  |         }
  18  |       }
  19  |     });
  20  | 
  21  |     await page.goto(`${BASE_URL}/signup`);
  22  | 
  23  |     const timestamp = Date.now();
  24  |     const testEmail = `schema-test-${timestamp}@test.com`;
  25  | 
  26  |     // Fill form
> 27  |     await page.fill('input[placeholder="Seu nome completo"]', 'Schema Test');
      |                ^ Error: page.fill: Test timeout of 30000ms exceeded.
  28  |     await page.fill('input[placeholder="seu@email.com"]', testEmail);
  29  |     await page.fill('input[placeholder="Crie uma senha segura"]', 'TestPass123!');
  30  | 
  31  |     const submitButton = page.locator('button:has-text("Criar minha conta")');
  32  |     await submitButton.click();
  33  | 
  34  |     await page.waitForTimeout(3000);
  35  | 
  36  |     // Check for column name errors
  37  |     const schemaErrors = apiErrors.filter(e =>
  38  |       e.includes('undefined column') ||
  39  |       e.includes('user_id') ||
  40  |       e.includes('global_role') ||
  41  |       e.includes('profiles')
  42  |     );
  43  | 
  44  |     if (schemaErrors.length > 0) {
  45  |       throw new Error(`Schema errors detected: ${schemaErrors.join(', ')}`);
  46  |     }
  47  | 
  48  |     console.log('✅ No schema-related errors detected');
  49  |   });
  50  | 
  51  |   test('should have working trigger on auth.users insert', async ({ page }) => {
  52  |     const networkLog: any[] = [];
  53  | 
  54  |     page.on('response', resp => {
  55  |       networkLog.push({
  56  |         url: resp.url(),
  57  |         status: resp.status()
  58  |       });
  59  |     });
  60  | 
  61  |     await page.goto(`${BASE_URL}/signup`);
  62  | 
  63  |     const timestamp = Date.now();
  64  |     const testEmail = `trigger-test-${timestamp}@test.com`;
  65  | 
  66  |     // Fill and submit
  67  |     await page.fill('input[placeholder="Seu nome completo"]', 'Trigger Test');
  68  |     await page.fill('input[placeholder="seu@email.com"]', testEmail);
  69  |     await page.fill('input[placeholder="Crie uma senha segura"]', 'TestPass123!');
  70  | 
  71  |     const submitButton = page.locator('button:has-text("Criar minha conta")');
  72  |     await submitButton.click();
  73  | 
  74  |     await page.waitForTimeout(3000);
  75  | 
  76  |     // Check if auth endpoint succeeded
  77  |     const authRequests = networkLog.filter(r => r.url.includes('/auth/'));
  78  |     const signupRequests = authRequests.filter(r => r.url.includes('signup'));
  79  | 
  80  |     if (signupRequests.length > 0) {
  81  |       const lastSignup = signupRequests[signupRequests.length - 1];
  82  |       if (lastSignup.status === 200) {
  83  |         console.log('✅ Trigger working - signup successful');
  84  |       } else if (lastSignup.status === 500) {
  85  |         throw new Error('Trigger issue - database error on signup');
  86  |       }
  87  |     }
  88  |   });
  89  | });
  90  | 
  91  | test.describe('RLS Policies', () => {
  92  |   test('should enforce row level security', async ({ page }) => {
  93  |     // Test that RLS prevents unauthorized access
  94  | 
  95  |     await page.goto(`${BASE_URL}/app`);
  96  | 
  97  |     const networkLog: any[] = [];
  98  | 
  99  |     page.on('response', resp => {
  100 |       if (resp.url().includes('/rest/v1/')) {
  101 |         networkLog.push({
  102 |           url: resp.url(),
  103 |           status: resp.status()
  104 |         });
  105 |       }
  106 |     });
  107 | 
  108 |     await page.waitForTimeout(2000);
  109 | 
  110 |     // Check if any unauthorized (401/403) responses
  111 |     const unauthorizedRequests = networkLog.filter(r =>
  112 |       r.status === 401 || r.status === 403
  113 |     );
  114 | 
  115 |     if (unauthorizedRequests.length > 0) {
  116 |       console.log(`⚠️  Found ${unauthorizedRequests.length} unauthorized requests (expected)`);
  117 |     } else {
  118 |       console.log('✅ RLS policies appear to be working');
  119 |     }
  120 |   });
  121 | });
  122 | 
```