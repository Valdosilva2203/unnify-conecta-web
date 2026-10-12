import { test, expect } from '@playwright/test';

// O cartão do formulário das telas de acesso deve ficar centralizado em qualquer celular.
const BASE = 'http://localhost:3000';
const LARGURAS = [320, 360, 375, 390, 412, 430, 480, 600, 767];

for (const rota of ['/login', '/signup', '/forgot-password', '/reset-password']) {
  test(`formulário centralizado no celular: ${rota}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`${BASE}${rota}`);
    const cartao = page.locator('div.rounded-2xl.shadow-lg').filter({ visible: true }).first();
    await expect(cartao).toBeVisible({ timeout: 30000 });
    for (const largura of LARGURAS) {
      await page.setViewportSize({ width: largura, height: 800 });
      await page.waitForTimeout(150);
      const b = await cartao.boundingBox();
      const esquerda = Math.round(b!.x);
      const direita = Math.round(largura - (b!.x + b!.width));
      expect(Math.abs(esquerda - direita), `${rota} @${largura}px: margem esquerda ${esquerda}px x direita ${direita}px`).toBeLessThanOrEqual(2);
    }
  });
}
