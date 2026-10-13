import { test, expect, type Browser, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Alteração do e-mail de acesso pelo fluxo oficial do Supabase Auth (Secure Email Change).
// A confirmação usa os links REAIS dos e-mails entregues (lidos na API do Resend) — nada é simulado.

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
const marca = `ae${Date.now()}`;
const criados: string[] = [];

function cnpjAleatorio(): string {
  const n = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).concat([0, 0, 0, 1]);
  const dv = (b: number[], p: number[]) => {
    const r = b.reduce((s, d, i) => s + d * p[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(n, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv([...n, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const s = [...n, d1, d2].join('');
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
}

async function criarUsuario(rotulo: string, opcoes: { empresa?: boolean; tipo?: 'empresa' | 'contador'; funcao?: string } = {}) {
  const email = `delivered+${marca}${rotulo}@resend.dev`.toLowerCase(); // o Auth guarda em minúsculas
  const senha = `Ae@${Date.now()}x`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome_completo: `Teste ${rotulo}` } });
  if (error) throw error;
  criados.push(data.user.id);
  const atualizacao: Record<string, string> = {};
  if (opcoes.tipo) atualizacao.tipo_usuario = opcoes.tipo;
  if (opcoes.funcao) atualizacao.funcao_global = opcoes.funcao;
  if (Object.keys(atualizacao).length) await admin().from('perfis').update(atualizacao).eq('id_usuario', data.user.id);
  const cliente = anonimo();
  await cliente.auth.signInWithPassword({ email, password: senha });
  if (opcoes.empresa) {
    const { data: r } = await cliente.rpc('criar_empresa', {
      p_cnpj: cnpjAleatorio(), p_razao_social: `EMPRESA ${rotulo} ${marca} LTDA`, p_telefone: '63999990000',
      p_email_comercial: 'teste@resend.dev', p_cidade: 'Palmas', p_estado: 'TO',
      p_tipo_empresa: opcoes.tipo === 'contador' ? 'escritorio_contabil' : 'comum', p_nome_comercial: `${rotulo} ${marca}`,
    });
    if (!r?.[0]?.sucesso) throw new Error('criar_empresa falhou');
  }
  return { id: data.user.id, email, senha, cliente };
}

async function entrarPelaTela(browser: Browser, email: string, senha: string, largura = 1440) {
  const page = await browser.newPage({ viewport: { width: largura, height: 900 } });
  const erros: string[] = [];
  page.on('console', (m) => m.type() === 'error' && erros.push(m.text().slice(0, 160)));
  page.on('pageerror', (e) => erros.push(e.message.slice(0, 160)));
  await page.goto(`${BASE}/login`);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
  await page.getByRole('button', { name: /Entrar/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  return { page, erros };
}

// Busca no Resend o e-mail real de confirmação enviado pelo Supabase para o endereço.
async function linkDoEmail(para: string): Promise<string> {
  const chave = { Authorization: `Bearer ${env.RESEND_API_KEY}` };
  for (let tentativa = 0; tentativa < 30; tentativa++) {
    const lista = await (await fetch('https://api.resend.com/emails?limit=20', { headers: chave })).json();
    const item = (lista.data ?? []).find((e: { to: string[]; subject: string }) => e.to.includes(para) && /e-mail|email/i.test(e.subject));
    if (item) {
      const detalhe = await (await fetch(`https://api.resend.com/emails/${item.id}`, { headers: chave })).json();
      const href = /href="([^"]+)"/.exec(detalhe.html ?? '')?.[1];
      if (href) return href.replace(/&amp;/g, '&');
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`e-mail de confirmação não chegou para ${para}`);
}

async function semRolagem(page: Page, largura: number) {
  await page.setViewportSize({ width: largura, height: 800 });
  await page.waitForTimeout(300);
  const excesso = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(excesso, `rolagem lateral em ${page.url()} @${largura}px`).toBeLessThanOrEqual(1);
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(6 * 60 * 1000);

test.afterAll(async () => {
  for (const id of criados.reverse()) await admin().auth.admin.deleteUser(id);
});

test('não autenticado: sem acesso à página nem à API', async ({ page }) => {
  await page.goto(`${BASE}/app/minha-conta#seguranca`);
  await page.waitForURL('**/login', { timeout: 30000 });
  const { error } = await anonimo().auth.updateUser({ email: `delivered+${marca}anon@resend.dev` });
  expect(error, 'updateUser sem sessão deve falhar').not.toBeNull();
});

test('segurança: perfis.email não aceita valor que não seja o e-mail confirmado; ninguém altera o e-mail de outro', async () => {
  const a = await criarUsuario('seguA');
  const b = await criarUsuario('seguB');
  const falso = await a.cliente.from('perfis').update({ email: 'falso@resend.dev' }).eq('id_usuario', a.id);
  expect(falso.error?.message).toContain('só muda pela alteração confirmada');
  const deOutro = await a.cliente.from('perfis').update({ email: 'falso@resend.dev' }).eq('id_usuario', b.id).select();
  expect(deOutro.data ?? []).toHaveLength(0);
  const { data: perfilB } = await admin().from('perfis').select('email').eq('id_usuario', b.id).single();
  expect(perfilB?.email).toBe(b.email);
  // updateUser só age sobre o dono da sessão: não há parâmetro de usuário-alvo.
  const { data: bAuth } = await admin().auth.admin.getUserById(b.id);
  expect(bAuth.user?.email).toBe(b.email);
  expect(bAuth.user?.new_email ?? null).toBeNull();
});

test('fluxo completo: validações, pendência, confirmação real nos dois e-mails, integridade e novo login', async ({ browser }) => {
  const outro = await criarUsuario('outro');
  const emp = await criarUsuario('emp', { empresa: true, tipo: 'empresa' });
  const novoEmail = `delivered+${marca}novo@resend.dev`;
  const { data: vinculosAntes } = await admin().from('usuarios_empresas').select('id_empresa, tipo_vinculacao, ativo').eq('id_usuario', emp.id);
  const { data: perfilAntes } = await admin().from('perfis').select('funcao_global, tipo_usuario').eq('id_usuario', emp.id).single();

  const { page, erros } = await entrarPelaTela(browser, emp.email, emp.senha);
  await page.goto(`${BASE}/app/minha-conta#seguranca`);
  await expect(page.getByRole('heading', { name: 'Segurança da conta' })).toBeVisible({ timeout: 30000 });
  await expect(page.getByLabel('E-mail atual')).toHaveValue(emp.email);
  const campo = page.getByLabel('Novo e-mail');
  const botao = page.getByRole('button', { name: 'Solicitar alteração' });

  // E-mail inválido
  await campo.fill('sem-arroba.com');
  await botao.click();
  await expect(page.getByText('Informe um e-mail válido.')).toBeVisible();

  // Mesmo e-mail atual (com maiúsculas)
  await campo.fill(emp.email.toUpperCase());
  await botao.click();
  await expect(page.getByText('Este já é o seu e-mail atual.', { exact: false })).toBeVisible();

  // E-mail de outra conta
  await campo.fill(outro.email);
  await botao.click();
  await expect(page.getByText('Este e-mail já está em uso por outra conta.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: /Aguarde \d+s/ })).toBeDisabled();
  let { data: authEmp } = await admin().auth.admin.getUserById(emp.id);
  expect(authEmp.user?.new_email ?? null, 'duplicado não cria pendência').toBeNull();

  // Solicitação válida (precisa esperar o intervalo mínimo do Supabase entre envios)
  await page.reload();
  await expect(page.getByLabel('E-mail atual')).toHaveValue(emp.email, { timeout: 30000 });
  await page.getByLabel('Novo e-mail').fill(novoEmail);
  await page.getByRole('button', { name: 'Solicitar alteração' }).click();
  await expect(page.getByText(/Solicitação enviada/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Alteração pendente/)).toBeVisible();
  await expect(page.getByLabel('E-mail atual')).toHaveValue(emp.email);
  await expect(page.getByRole('button', { name: /Aguarde \d+s/ })).toBeDisabled();

  ({ data: authEmp } = await admin().auth.admin.getUserById(emp.id));
  expect(authEmp.user?.email, 'e-mail não muda antes da confirmação').toBe(emp.email);
  expect(authEmp.user?.new_email).toBe(novoEmail);
  const { data: perfilPendente } = await admin().from('perfis').select('email').eq('id_usuario', emp.id).single();
  expect(perfilPendente?.email).toBe(emp.email);

  // Solicitação repetida em seguida: o próprio Supabase recusa (intervalo mínimo entre envios)
  const repetida = await emp.cliente.auth.updateUser({ email: `delivered+${marca}outro2@resend.dev` });
  expect(repetida.error?.status, 'solicitação repetida deve ser limitada').toBe(429);

  // Pendência continua visível após recarregar
  await page.reload();
  await expect(page.getByText(/Alteração pendente/)).toBeVisible({ timeout: 30000 });
  await semRolagem(page, 375);
  await page.setViewportSize({ width: 1440, height: 900 });

  // Links reais dos e-mails entregues
  const linkAtual = await linkDoEmail(emp.email);
  const linkNovo = await linkDoEmail(novoEmail);
  for (const link of [linkAtual, linkNovo]) {
    expect(link, 'link deve apontar para a página de confirmação do app').toMatch(/^http:\/\/localhost:3000\/auth\/confirmar-email\?token_hash=[^&]+&type=email_change$/);
  }

  // Link inválido
  const visitante = await browser.newPage();
  await visitante.goto(`${BASE}/auth/confirmar-email?token_hash=abc123&type=email_change`);
  await expect(visitante.getByRole('heading', { name: 'Link inválido ou expirado' })).toBeVisible({ timeout: 30000 });

  // 1ª confirmação (e-mail atual): ainda não conclui
  await visitante.goto(linkAtual);
  await expect(visitante.getByRole('heading', { name: 'Falta só mais uma confirmação' })).toBeVisible({ timeout: 30000 });
  expect(new URL(visitante.url()).search, 'token removido da barra de endereços').toBe('');
  ({ data: authEmp } = await admin().auth.admin.getUserById(emp.id));
  expect(authEmp.user?.email).toBe(emp.email);

  // Reusar o mesmo link: inválido
  await visitante.goto(linkAtual);
  await expect(visitante.getByRole('heading', { name: 'Link inválido ou expirado' })).toBeVisible({ timeout: 30000 });

  // 2ª confirmação (e-mail novo): concluída
  await visitante.goto(linkNovo);
  await expect(visitante.getByRole('heading', { name: 'E-mail alterado com sucesso' })).toBeVisible({ timeout: 30000 });
  await expect(visitante.getByText(novoEmail)).toBeVisible();
  await expect(visitante.getByRole('link', { name: 'Ir para minha conta' })).toHaveAttribute('href', '/app/minha-conta');
  await semRolagem(visitante, 375);

  // Integridade: e-mail confirmado no Auth e no perfil; id, papéis e vínculos preservados
  ({ data: authEmp } = await admin().auth.admin.getUserById(emp.id));
  expect(authEmp.user?.email).toBe(novoEmail);
  expect(authEmp.user?.new_email ?? null).toBeNull();
  const { data: perfilDepois } = await admin().from('perfis').select('id_usuario, email, funcao_global, tipo_usuario').eq('id_usuario', emp.id).single();
  expect(perfilDepois).toEqual({ id_usuario: emp.id, email: novoEmail, ...perfilAntes });
  const { data: vinculosDepois } = await admin().from('usuarios_empresas').select('id_empresa, tipo_vinculacao, ativo').eq('id_usuario', emp.id);
  expect(vinculosDepois).toEqual(vinculosAntes);

  // Novo login com o novo e-mail funciona; o antigo não
  const novoLogin = await entrarPelaTela(browser, novoEmail, emp.senha);
  await novoLogin.page.waitForURL((u) => u.pathname === '/app', { timeout: 60000 });
  await novoLogin.page.goto(`${BASE}/app/minha-conta#seguranca`);
  await expect(novoLogin.page.getByLabel('E-mail atual')).toHaveValue(novoEmail, { timeout: 30000 });
  await expect(novoLogin.page.getByText(/Alteração pendente/)).toHaveCount(0);
  const antigo = await anonimo().auth.signInWithPassword({ email: emp.email, password: emp.senha });
  expect(antigo.error, 'e-mail antigo não entra mais').not.toBeNull();

  expect(erros.filter((e) => !/status of 4\d\d/.test(e)), 'erros no console').toEqual([]);
  expect(novoLogin.erros, 'erros no console após novo login').toEqual([]);
});

test('seção disponível para contador e administrador, sem rolagem lateral', async ({ browser }) => {
  const cont = await criarUsuario('cont', { empresa: true, tipo: 'contador' });
  const adm = await criarUsuario('adm', { funcao: 'admin_master' });

  const c = await entrarPelaTela(browser, cont.email, cont.senha);
  await c.page.goto(`${BASE}/contador/minha-conta#seguranca`);
  await expect(c.page.getByLabel('E-mail atual')).toHaveValue(cont.email, { timeout: 30000 });
  await semRolagem(c.page, 375);
  await semRolagem(c.page, 1440);

  const a = await entrarPelaTela(browser, adm.email, adm.senha);
  await a.page.waitForURL((u) => u.pathname === '/admin', { timeout: 60000 }); // Admin Master continua indo para /admin
  await a.page.goto(`${BASE}/admin/seguranca`);
  await expect(a.page.getByLabel('E-mail atual')).toHaveValue(adm.email, { timeout: 30000 });
  await semRolagem(a.page, 375);
  await semRolagem(a.page, 1440);

  expect(c.erros, 'erros no console do contador').toEqual([]);
  expect(a.erros.filter((e) => !/status of 4\d\d/.test(e)), 'erros no console do admin').toEqual([]);
});
