import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Regressão do acesso: recuperação de senha (link real do e-mail) e redirecionamentos do onboarding.

function carregarEnv(): Record<string, string> {
  const texto = readFileSync(join(__dirname, '..', '..', '.env.local'), 'utf8');
  return Object.fromEntries(
    texto
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
  );
}

const env = carregarEnv();
const BASE = 'http://localhost:3000';
const admin = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anonimo = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const marca = `ra${Date.now()}`;
const criados: string[] = [];

async function criarUsuario(rotulo: string) {
  const email = `delivered+${marca}${rotulo}@resend.dev`.toLowerCase();
  const senha = `Ra@${Date.now()}x`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw error;
  criados.push(data.user.id);
  return { id: data.user.id, email, senha };
}

async function linkDoEmail(para: string, assunto: RegExp): Promise<string> {
  const chave = { Authorization: `Bearer ${env.RESEND_API_KEY}` };
  for (let tentativa = 0; tentativa < 30; tentativa++) {
    const lista = await (await fetch('https://api.resend.com/emails?limit=20', { headers: chave })).json();
    const item = (lista.data ?? []).find((e: { to: string[]; subject: string }) => e.to.includes(para) && assunto.test(e.subject));
    if (item) {
      const detalhe = await (await fetch(`https://api.resend.com/emails/${item.id}`, { headers: chave })).json();
      const href = /href="([^"]+)"/.exec(detalhe.html ?? '')?.[1];
      if (href) return href.replace(/&amp;/g, '&');
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`e-mail não chegou para ${para}`);
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(4 * 60 * 1000);

test.afterAll(async () => {
  for (const id of criados.reverse()) await admin().auth.admin.deleteUser(id);
});

test('recuperação de senha: e-mail real, nova senha e login', async ({ page }) => {
  const u = await criarUsuario('rec');
  const novaSenha = `Nova@${Date.now()}Xy`;

  await page.goto(`${BASE}/forgot-password`);
  await page.getByLabel('E-mail').fill(u.email);
  await page.getByRole('button', { name: 'Enviar link de recuperação' }).click();
  await expect(page.getByText('E-mail enviado!')).toBeVisible({ timeout: 20000 });

  const link = await linkDoEmail(u.email, /Redefinir sua senha/);
  expect(link).toMatch(/^http:\/\/localhost:3000\/reset-password\?token_hash=/);
  await page.goto(link);
  await page.getByPlaceholder('Crie uma senha segura').fill(novaSenha);
  await page.getByPlaceholder('Confirme sua senha').fill(novaSenha);
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByText('Senha atualizada com sucesso!')).toBeVisible({ timeout: 20000 });

  const comNova = await anonimo().auth.signInWithPassword({ email: u.email, password: novaSenha });
  expect(comNova.error, 'login com a nova senha').toBeNull();
  const comAntiga = await anonimo().auth.signInWithPassword({ email: u.email, password: u.senha });
  expect(comAntiga.error, 'senha antiga deixa de valer').not.toBeNull();
});

test('onboarding: sem login vai para /login; usuário sem empresa entra no onboarding', async ({ page }) => {
  await page.goto(`${BASE}/onboarding`);
  await page.waitForURL('**/login', { timeout: 30000 });

  const u = await criarUsuario('onb');
  await page.goto(`${BASE}/login`);
  await page.getByLabel('E-mail').fill(u.email);
  await page.getByLabel('Senha', { exact: true }).fill(u.senha);
  await page.getByRole('button', { name: /Entrar/ }).click();
  await page.waitForURL((url) => url.pathname.startsWith('/onboarding'), { timeout: 60000 });
});
