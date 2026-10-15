import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';
import { bancoLocal, specsComBancoReal } from './tests/e2e/apoio/banco-local';

// Isolamento: com o Supabase COMPARTILHADO no .env.local, specs que acessam o banco real nunca rodam (só API simulada).
const ignorados = bancoLocal() ? [] : specsComBancoReal(join(__dirname, 'tests', 'e2e'));

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: ignorados.map((f) => `**/${f}`),
  fullyParallel: false,
  forbidOnly: process.env.CI ? true : false,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: undefined, // App is already running on localhost:3000
});
