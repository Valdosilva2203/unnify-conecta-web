import { test, expect } from '@playwright/test';

// Celulares em modo escuro não podem deixar o texto dos campos ilegível (branco sobre branco).
test.use({ colorScheme: 'dark', viewport: { width: 375, height: 800 } });

const BASE = 'http://localhost:3000';

function luminancia(rgb: string) {
  const [r, g, b] = (rgb.match(/\d+/g) ?? []).slice(0, 3).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

for (const rota of ['/login', '/signup', '/forgot-password']) {
  test(`campos legíveis em modo escuro: ${rota}`, async ({ page }) => {
    await page.goto(`${BASE}${rota}`);
    const campos = page.locator('input[type="email"], input[type="password"], input[type="text"]').filter({ visible: true });
    await expect(campos.first()).toBeVisible({ timeout: 30000 });
    const total = await campos.count();
    for (let i = 0; i < total; i++) {
      const campo = campos.nth(i);
      await campo.fill('teste@resend.dev');
      const { cor, fundo } = await campo.evaluate((el) => {
        const s = getComputedStyle(el);
        return { cor: s.color, fundo: s.backgroundColor };
      });
      expect(luminancia(cor), `texto do campo ${i} em ${rota}: ${cor} sobre ${fundo}`).toBeLessThan(100);
    }
  });
}
