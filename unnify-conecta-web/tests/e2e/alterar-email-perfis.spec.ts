import { test, expect, type Browser, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// "Minha conta → Segurança da conta → Alterar e-mail" disponível para todos os perfis,
// sempre só sobre o próprio e-mail. Confirmação com os links REAIS lidos na API do Resend.

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
const marca = `ap${Date.now()}`;
const criados: string[] = [];

type Perfil = 'empresario' | 'autonomo' | 'escritorio' | 'administrador' | 'master';

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

async function criarPerfil(perfil: Perfil) {
  const email = `delivered+${marca}${perfil}@resend.dev`;
  const senha = `Ap@${Date.now()}x`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome_completo: `Teste ${perfil}` } });
  if (error) throw error;
  criados.push(data.user.id);
  const dados: Record<string, string> = {};
  if (perfil === 'empresario') dados.tipo_usuario = 'empresa';
  if (perfil === 'autonomo' || perfil === 'escritorio') dados.tipo_usuario = 'contador';
  if (perfil === 'administrador') dados.funcao_global = 'admin';
  if (perfil === 'master') dados.funcao_global = 'admin_master';
  await admin().from('perfis').update(dados).eq('id_usuario', data.user.id);
  const cliente = anonimo();
  await cliente.auth.signInWithPassword({ email, password: senha });
  if (perfil === 'empresario' || perfil === 'escritorio') {
    const { data: r } = await cliente.rpc('criar_empresa', {
      p_cnpj: cnpjAleatorio(), p_razao_social: `EMPRESA ${perfil} ${marca} LTDA`, p_telefone: '63999990000',
      p_email_comercial: 'teste@resend.dev', p_cidade: 'Palmas', p_estado: 'TO',
      p_tipo_empresa: perfil === 'escritorio' ? 'escritorio_contabil' : 'comum', p_nome_comercial: `${perfil} ${marca}`,
    });
    if (!r?.[0]?.sucesso) throw new Error('criar_empresa falhou');
  }
  return { id: data.user.id, email, senha, cliente };
}

async function entrar(browser: Browser, email: string, senha: string) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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

const DESTINO_INICIAL: Record<Perfil, string> = {
  empresario: '/app', autonomo: '/contador', escritorio: '/contador', administrador: '/admin', master: '/admin',
};
const PAGINA_CONTA: Record<Perfil, string> = {
  empresario: '/app/minha-conta', autonomo: '/contador/minha-conta', escritorio: '/contador/minha-conta',
  administrador: '/admin/seguranca', master: '/admin/seguranca',
};

// Chega à seção pelo menu real de cada área (não digitando a URL).
async function abrirPeloMenu(page: Page, perfil: Perfil) {
  // Espera a navegação pós-login terminar: um clique durante ela é sobrescrito pelo roteador do Next.
  await page.waitForLoadState('networkidle');
  if (perfil === 'administrador' || perfil === 'master') {
    await page.getByRole('button', { name: /^Menu do perfil/ }).click();
    await page.getByRole('menuitem', { name: /Segurança da conta/ }).click();
  } else if (perfil === 'empresario') {
    await page.locator('aside').first().getByRole('link', { name: 'Minha conta' }).click();
  } else {
    await page.getByRole('link', { name: 'Minha conta' }).filter({ visible: true }).first().click();
  }
  await page.waitForURL((u) => u.pathname === PAGINA_CONTA[perfil], { timeout: 60000 });
  // Minha conta abre em Dados pessoais: entra na aba Segurança da conta (admin já abre nela)
  if (perfil !== 'administrador' && perfil !== 'master') await page.getByRole('button', { name: /Segurança da conta/ }).first().click();
}

async function semRolagem(page: Page, largura: number) {
  await page.setViewportSize({ width: largura, height: 800 });
  await page.waitForTimeout(300);
  const excesso = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(excesso, `rolagem lateral em ${page.url()} @${largura}px`).toBeLessThanOrEqual(1);
}

async function linkDoEmail(para: string): Promise<string> {
  const chave = { Authorization: `Bearer ${env.RESEND_API_KEY}` };
  for (let tentativa = 0; tentativa < 30; tentativa++) {
    const lista = await (await fetch('https://api.resend.com/emails?limit=20', { headers: chave })).json();
    const item = (lista.data ?? []).find((e: { to: string[]; subject: string }) => e.to.includes(para) && /Confirme a altera/.test(e.subject));
    if (item) {
      const detalhe = await (await fetch(`https://api.resend.com/emails/${item.id}`, { headers: chave })).json();
      const href = /href="([^"]+)"/.exec(detalhe.html ?? '')?.[1];
      if (href) return href.replace(/&amp;/g, '&');
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`e-mail de confirmação não chegou para ${para}`);
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(5 * 60 * 1000);

const usuarios = {} as Record<Perfil, Awaited<ReturnType<typeof criarPerfil>>>;

test.beforeAll(async () => {
  for (const p of ['empresario', 'autonomo', 'escritorio', 'administrador', 'master'] as Perfil[]) usuarios[p] = await criarPerfil(p);
});

test.afterAll(async () => {
  for (const id of criados.reverse()) await admin().auth.admin.deleteUser(id);
});

for (const perfil of ['empresario', 'autonomo', 'escritorio', 'administrador', 'master'] as Perfil[]) {
  test(`acesso pelo menu: ${perfil}`, async ({ browser }) => {
    const u = usuarios[perfil];
    const { page, erros } = await entrar(browser, u.email, u.senha);
    await page.waitForURL((url) => url.pathname === DESTINO_INICIAL[perfil], { timeout: 60000 });
    await abrirPeloMenu(page, perfil);
    await expect(page.getByRole('heading', { name: 'Segurança da conta' }).filter({ visible: true }).first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('heading', { name: 'Alterar e-mail' })).toBeVisible();
    await expect(page.getByLabel('E-mail atual')).toHaveValue(u.email, { timeout: 30000 });
    await expect(page.getByRole('button', { name: 'Solicitar alteração' })).toBeEnabled();
    await semRolagem(page, 375);
    await semRolagem(page, 1440);
    expect(erros, `erros no console (${perfil})`).toEqual([]);
    await page.close();
  });
}

test('isolamento: ninguém altera o e-mail de outro usuário, nem administradores', async () => {
  const alvo = usuarios.empresario;
  for (const papel of ['administrador', 'master'] as Perfil[]) {
    const atacante = usuarios[papel].cliente;
    // API administrativa do Auth exige service role: recusada com a sessão de um admin da plataforma
    const viaAuthAdmin = await atacante.auth.admin.updateUserById(alvo.id, { email: `delivered+${marca}roubo@resend.dev` });
    expect(viaAuthAdmin.error, `${papel}: auth.admin.updateUserById deve ser recusado`).not.toBeNull();
    // perfis.email só espelha o e-mail confirmado: nem o Admin Master grava outro valor
    const viaPerfil = await atacante.from('perfis').update({ email: `delivered+${marca}roubo@resend.dev` }).eq('id_usuario', alvo.id).select();
    expect(viaPerfil.error !== null || (viaPerfil.data ?? []).length === 0, `${papel}: perfis.email de outro deve ser recusado`).toBe(true);
  }
  // usuário comum contra outro usuário comum
  const deOutro = await usuarios.autonomo.cliente.from('perfis').update({ email: `delivered+${marca}roubo@resend.dev` }).eq('id_usuario', alvo.id).select();
  expect(deOutro.data ?? []).toHaveLength(0);

  const { data } = await admin().auth.admin.getUserById(alvo.id);
  expect(data.user?.email).toBe(alvo.email);
  expect(data.user?.new_email ?? null).toBeNull();
  const { data: perfil } = await admin().from('perfis').select('email').eq('id_usuario', alvo.id).single();
  expect(perfil?.email).toBe(alvo.email);
});

test('solicitação pelo contador autônomo: fica pendente e o e-mail exibido não muda', async ({ browser }) => {
  const u = usuarios.autonomo;
  const novo = `delivered+${marca}autonomonovo@resend.dev`;
  const { page } = await entrar(browser, u.email, u.senha);
  await page.goto(`${BASE}/contador/minha-conta#seguranca`);
  await page.getByLabel('Novo e-mail').fill(novo);
  await page.getByRole('button', { name: 'Solicitar alteração' }).click();
  await expect(page.getByText(/Solicitação enviada/)).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(page.getByText(/Alteração pendente/)).toBeVisible({ timeout: 30000 });
  await expect(page.getByLabel('E-mail atual')).toHaveValue(u.email);
  const { data } = await admin().auth.admin.getUserById(u.id);
  expect(data.user?.email).toBe(u.email);
  expect(data.user?.new_email).toBe(novo);
  await page.close();
});

test('administrador confirma a troca: e-mail muda só após as duas confirmações; papel e destino preservados', async ({ browser }) => {
  const u = usuarios.administrador;
  const novo = `delivered+${marca}administradornovo@resend.dev`;
  const { page, erros } = await entrar(browser, u.email, u.senha);
  await page.waitForURL((url) => url.pathname === '/admin', { timeout: 60000 });
  await abrirPeloMenu(page, 'administrador');
  await page.getByLabel('Novo e-mail').fill(novo);
  await page.getByRole('button', { name: 'Solicitar alteração' }).click();
  await expect(page.getByText(/Solicitação enviada/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel('E-mail atual')).toHaveValue(u.email);

  const linkAtual = await linkDoEmail(u.email);
  const linkNovo = await linkDoEmail(novo);
  const visitante = await browser.newPage();
  await visitante.goto(linkAtual);
  await expect(visitante.getByRole('heading', { name: 'Falta só mais uma confirmação' })).toBeVisible({ timeout: 30000 });
  let { data } = await admin().auth.admin.getUserById(u.id);
  expect(data.user?.email, 'ainda não mudou após só uma confirmação').toBe(u.email);
  await page.reload();
  await expect(page.getByLabel('E-mail atual')).toHaveValue(u.email, { timeout: 30000 });

  await visitante.goto(linkNovo);
  await expect(visitante.getByRole('heading', { name: 'E-mail alterado com sucesso' })).toBeVisible({ timeout: 30000 });
  await expect(visitante.getByRole('link', { name: 'Ir para minha conta' })).toHaveAttribute('href', '/admin/seguranca');

  ({ data } = await admin().auth.admin.getUserById(u.id));
  expect(data.user?.email).toBe(novo);
  const { data: perfil } = await admin().from('perfis').select('id_usuario, email, funcao_global').eq('id_usuario', u.id).single();
  expect(perfil).toEqual({ id_usuario: u.id, email: novo, funcao_global: 'admin' });

  // Agora o painel mostra o novo e-mail, e o login com ele continua levando ao /admin
  const novoLogin = await entrar(browser, novo, u.senha);
  await novoLogin.page.waitForURL((url) => url.pathname === '/admin', { timeout: 60000 });
  await abrirPeloMenu(novoLogin.page, 'administrador');
  await expect(novoLogin.page.getByLabel('E-mail atual')).toHaveValue(novo, { timeout: 30000 });
  expect(erros.filter((e) => !/status of 4\d\d/.test(e))).toEqual([]);
  expect(novoLogin.erros).toEqual([]);
});
