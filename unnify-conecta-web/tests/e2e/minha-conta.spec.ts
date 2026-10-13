import { test, expect, type Browser, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Minha conta completa: dados pessoais, avatar, senha, MFA (TOTP real), preferências, privacidade,
// logout, isolamento entre usuários e layout. Usuários temporários *@resend.dev, apagados ao final.

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
const marca = `mc${Date.now()}`;
const criados: string[] = [];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const LARGURAS = [320, 375, 390, 430, 768, 1024, 1280, 1440];

// TOTP (RFC 6238), como um aplicativo autenticador faria.
function codigoTotp(segredoBase32: string, deslocamento = 0): string {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of segredoBase32.replace(/=+$/, '').toUpperCase()) bits += alfabeto.indexOf(ch).toString(2).padStart(5, '0');
  const chave = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const contador = Math.floor(Date.now() / 1000 / 30) + deslocamento;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(contador));
  const hmac = createHmac('sha1', chave).update(msg).digest();
  const o = hmac[hmac.length - 1] & 0xf;
  const num = ((hmac[o] & 0x7f) << 24) | (hmac[o + 1] << 16) | (hmac[o + 2] << 8) | hmac[o + 3];
  return String(num % 1_000_000).padStart(6, '0');
}

async function codigoSeguro(segredo: string) {
  // Evita gerar o código no último instante da janela de 30s.
  const resta = 30 - (Math.floor(Date.now() / 1000) % 30);
  if (resta < 4) await new Promise((r) => setTimeout(r, (resta + 1) * 1000));
  return codigoTotp(segredo);
}

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

async function criarEmpresario(rotulo: string) {
  const email = `delivered+${marca}${rotulo}@resend.dev`.toLowerCase();
  const senha = `Mc@${Date.now()}x`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome_completo: `Teste ${rotulo}` } });
  if (error) throw error;
  criados.push(data.user.id);
  await admin().from('perfis').update({ tipo_usuario: 'empresa' }).eq('id_usuario', data.user.id);
  const cliente = anonimo();
  await cliente.auth.signInWithPassword({ email, password: senha });
  const { data: r } = await cliente.rpc('criar_empresa', {
    p_cnpj: cnpjAleatorio(), p_razao_social: `EMPRESA ${rotulo} ${marca} LTDA`, p_telefone: '63999990000',
    p_email_comercial: 'teste@resend.dev', p_cidade: 'Palmas', p_estado: 'TO', p_tipo_empresa: 'comum', p_nome_comercial: `${rotulo} ${marca}`,
  });
  if (!r?.[0]?.sucesso) throw new Error('criar_empresa falhou');
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
  await page.waitForLoadState('networkidle');
  return { page, erros };
}

async function abrirSecao(page: Page, rota: string, secao: string, titulo: RegExp | string) {
  await page.goto(`${BASE}${rota}#${secao}`);
  await expect(page.getByRole('heading', { name: titulo }).filter({ visible: true }).first()).toBeVisible({ timeout: 30000 });
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(5 * 60 * 1000);

let A: Awaited<ReturnType<typeof criarEmpresario>>;
let B: Awaited<ReturnType<typeof criarEmpresario>>;

test.beforeAll(async () => {
  A = await criarEmpresario('a');
  B = await criarEmpresario('b');
});

test.afterAll(async () => {
  const sb = admin();
  for (const id of criados) {
    const { data: arquivos } = await sb.storage.from('avatares').list(id);
    if (arquivos?.length) await sb.storage.from('avatares').remove(arquivos.map((f) => `${id}/${f.name}`));
  }
  for (const id of criados.reverse()) await sb.auth.admin.deleteUser(id);
});

test('dados pessoais: validação, salvar nome e telefone, persistência', async ({ browser }) => {
  const { page, erros } = await entrar(browser, A.email, A.senha);
  await abrirSecao(page, '/app/minha-conta', 'dados', 'Dados pessoais');
  await page.getByLabel('Nome completo').fill('Jo');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByText('Informe o nome completo (mínimo 3 caracteres).')).toBeVisible();
  await page.getByLabel('Nome completo').fill('Ana Maria Teste');
  await page.getByLabel('Telefone').fill('6399');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByText('Telefone inválido. Use DDD + número.')).toBeVisible();
  await page.getByLabel('Telefone').fill('63999874567');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByText('Dados pessoais atualizados.')).toBeVisible();
  const { data } = await admin().from('perfis').select('nome_completo, telefone, tipo_usuario, funcao_global').eq('id_usuario', A.id).single();
  expect(data).toEqual({ nome_completo: 'Ana Maria Teste', telefone: '63999874567', tipo_usuario: 'empresa', funcao_global: 'user' });
  await page.reload();
  await expect(page.getByLabel('Nome completo')).toHaveValue('Ana Maria Teste', { timeout: 30000 });
  await expect(page.getByLabel('Telefone')).toHaveValue('(63) 99987-4567');
  expect(erros).toEqual([]);
  await page.close();
});

test('avatar: envio, tipo inválido recusado, troca e privacidade do arquivo', async ({ browser }) => {
  const { page } = await entrar(browser, A.email, A.senha);
  await abrirSecao(page, '/app/minha-conta', 'dados', 'Dados pessoais');
  const entrada = page.getByLabel('Selecionar foto de perfil');
  await entrada.setInputFiles({ name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  await expect(page.getByText('Use uma imagem JPG, PNG ou WebP.')).toBeVisible();
  await entrada.setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText('Foto atualizada.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByAltText('Foto de Ana Maria Teste').first()).toBeVisible();
  const { data: p1 } = await admin().from('perfis').select('url_avatar').eq('id_usuario', A.id).single();
  expect(p1?.url_avatar?.startsWith(`${A.id}/`)).toBe(true);

  // Troca: o arquivo antigo é removido
  await entrada.setInputFiles({ name: 'foto2.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText('Foto atualizada.')).toBeVisible({ timeout: 15000 });
  const { data: p2 } = await admin().from('perfis').select('url_avatar').eq('id_usuario', A.id).single();
  expect(p2?.url_avatar).not.toBe(p1?.url_avatar);
  const { data: arquivos } = await admin().storage.from('avatares').list(A.id);
  expect(arquivos?.map((f) => f.name)).toEqual([p2!.url_avatar!.split('/')[1]]);

  // Outro usuário não lê nem sobrescreve a foto de A, nem aponta o próprio avatar para ela
  const leitura = await B.cliente.storage.from('avatares').createSignedUrl(p2!.url_avatar!, 60);
  expect(leitura.error, 'B não pode gerar URL da foto de A').not.toBeNull();
  const escrita = await B.cliente.storage.from('avatares').upload(`${A.id}/invasao.png`, PNG, { contentType: 'image/png' });
  expect(escrita.error, 'B não pode gravar na pasta de A').not.toBeNull();
  const apontar = await B.cliente.rpc('definir_avatar', { p_caminho: p2!.url_avatar });
  expect(apontar.error, 'B não pode usar a foto de A').not.toBeNull();
  await page.close();
});

test('segurança do perfil: ninguém altera papel, status ou dados de outro usuário', async () => {
  const tipo = await A.cliente.from('perfis').update({ tipo_usuario: 'contador' }).eq('id_usuario', A.id);
  expect(tipo.error?.message).toContain('tipo de usuário não pode ser alterado');
  const status = await A.cliente.from('perfis').update({ status: 'inactive' }).eq('id_usuario', A.id);
  expect(status.error?.message).toContain('status da conta não pode ser alterado');
  const papel = await A.cliente.from('perfis').update({ funcao_global: 'admin_master' }).eq('id_usuario', A.id);
  expect(papel.error).not.toBeNull();
  const deOutro = await A.cliente.from('perfis').update({ nome_completo: 'Invasor' }).eq('id_usuario', B.id).select();
  expect(deOutro.data ?? []).toHaveLength(0);
  // Dados pessoais de B, preferências e solicitações não são legíveis por A
  expect((await A.cliente.from('perfis').select('telefone').eq('id_usuario', B.id)).data ?? []).toHaveLength(0);
  await B.cliente.from('preferencias_usuario').upsert({ id_usuario: B.id, reduzir_animacoes: true });
  expect((await A.cliente.from('preferencias_usuario').select('*').eq('id_usuario', B.id)).data ?? []).toHaveLength(0);
  const prefInvasao = await A.cliente.from('preferencias_usuario').upsert({ id_usuario: B.id, reduzir_animacoes: false });
  expect(prefInvasao.error, 'A não grava preferências de B').not.toBeNull();
  const anon = await anonimo().rpc('exportar_meus_dados');
  expect(anon.error, 'exportação exige sessão').not.toBeNull();
  const { data: final } = await admin().from('perfis').select('tipo_usuario, status, funcao_global, nome_completo').eq('id_usuario', A.id).single();
  expect(final).toEqual({ tipo_usuario: 'empresa', status: 'active', funcao_global: 'user', nome_completo: 'Ana Maria Teste' });
});

test('alterar senha: senha atual errada é recusada pelo Supabase; troca válida funciona', async ({ browser }) => {
  const { page } = await entrar(browser, A.email, A.senha);
  await abrirSecao(page, '/app/minha-conta', 'seguranca', 'Alterar senha');
  const nova = `Nova@${Date.now()}Ab`;
  await page.getByLabel('Senha atual').fill('SenhaErrada@123');
  await page.getByLabel('Nova senha', { exact: true }).fill(nova);
  await page.getByLabel('Confirmar nova senha').fill(nova);
  await page.getByRole('button', { name: 'Alterar senha' }).click();
  await expect(page.getByText('Senha atual incorreta.')).toBeVisible({ timeout: 15000 });
  // Direto na API, sem a senha atual: o próprio Supabase recusa
  const semAtual = await A.cliente.auth.updateUser({ password: nova });
  expect(semAtual.error, 'Supabase exige a senha atual').not.toBeNull();

  await page.getByLabel('Senha atual').fill(A.senha);
  await page.getByRole('button', { name: 'Alterar senha' }).click();
  await expect(page.getByText('Senha alterada.', { exact: false })).toBeVisible({ timeout: 15000 });
  expect((await anonimo().auth.signInWithPassword({ email: A.email, password: nova })).error).toBeNull();
  expect((await anonimo().auth.signInWithPassword({ email: A.email, password: A.senha })).error).not.toBeNull();
  A.senha = nova;
  await page.close();
});

test('MFA (TOTP real): ativar, exigir código no login e nas áreas, desativar', async ({ browser }) => {
  const { page } = await entrar(browser, A.email, A.senha);
  await abrirSecao(page, '/app/minha-conta', 'seguranca', 'Autenticação em duas etapas');
  await page.getByRole('button', { name: 'Ativar autenticação em duas etapas' }).click();
  const segredo = (await page.getByTestId('segredo-mfa').textContent())!.trim();
  await page.getByLabel('Código do aplicativo').fill('000000');
  await page.getByRole('button', { name: 'Confirmar e ativar' }).click();
  await expect(page.getByText('Código inválido.', { exact: false })).toBeVisible({ timeout: 15000 });
  await page.getByLabel('Código do aplicativo').fill(await codigoSeguro(segredo));
  await page.getByRole('button', { name: 'Confirmar e ativar' }).click();
  await expect(page.getByText('Autenticação em duas etapas ativada.', { exact: false })).toBeVisible({ timeout: 15000 });
  await page.close();

  // Novo login: o código é exigido antes de qualquer área
  const novo = await browser.newPage({ viewport: { width: 375, height: 800 } });
  await novo.goto(`${BASE}/login`);
  await novo.getByLabel('E-mail').fill(A.email);
  await novo.getByLabel('Senha', { exact: true }).fill(A.senha);
  await novo.getByRole('button', { name: /Entrar/ }).click();
  await novo.waitForURL('**/login/verificacao', { timeout: 60000 });
  // Tentar pular a etapa digitando a URL da área: volta para a verificação
  await novo.goto(`${BASE}/app/minha-conta`);
  await novo.waitForURL('**/login/verificacao', { timeout: 60000 });
  await novo.getByLabel('Código de verificação').fill('123456');
  await novo.getByRole('button', { name: 'Verificar e entrar' }).click();
  await expect(novo.getByText('Código inválido ou expirado.', { exact: false })).toBeVisible({ timeout: 15000 });
  await novo.getByLabel('Código de verificação').fill(await codigoSeguro(segredo));
  await novo.getByRole('button', { name: 'Verificar e entrar' }).click();
  await novo.waitForURL((u) => u.pathname === '/app', { timeout: 60000 });
  const excesso = await novo.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(excesso).toBeLessThanOrEqual(1);

  // Desativar (sessão AAL2)
  await novo.setViewportSize({ width: 1440, height: 900 });
  await abrirSecao(novo, '/app/minha-conta', 'seguranca', 'Autenticação em duas etapas');
  await novo.getByRole('button', { name: 'Desativar', exact: true }).click();
  await novo.getByRole('dialog').getByRole('button', { name: 'Desativar' }).click();
  await expect(novo.getByText('Autenticação em duas etapas desativada.')).toBeVisible({ timeout: 15000 });
  const { data: fatores } = await admin().auth.admin.mfa.listFactors({ userId: A.id });
  expect(fatores?.factors ?? []).toHaveLength(0);
  await novo.close();
});

test('preferências: notificações e reduzir animações persistem e são aplicadas', async ({ browser }) => {
  const { page } = await entrar(browser, A.email, A.senha);
  await abrirSecao(page, '/app/minha-conta', 'notificacoes', 'Notificações');
  await expect(page.getByText('O envio de notificações ainda está em desenvolvimento.')).toBeVisible();
  await expect(page.locator('#notif-documentos-email')).toBeDisabled();
  await page.locator('label[for="notif-vinculos-email"]').click();
  await page.getByRole('button', { name: 'Salvar preferências' }).click();
  await expect(page.getByText('Preferências de notificação salvas.')).toBeVisible();

  await abrirSecao(page, '/app/minha-conta', 'preferencias', 'Preferências');
  await page.locator('label[for="pref-reduzir-animacoes"]').click();
  await expect(page.getByText('Preferência salva.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-reduzir-animacoes'))).toBe(true);

  const { data } = await admin().from('preferencias_usuario').select('notificacoes, reduzir_animacoes').eq('id_usuario', A.id).single();
  expect(data?.reduzir_animacoes).toBe(true);
  expect(data?.notificacoes?.vinculos?.email).toBe(false);

  // Nova sessão: a preferência é aplicada pelo layout e a escolha de notificação continua salva
  await page.close();
  const outra = await entrar(browser, A.email, A.senha);
  await outra.page.waitForURL((u) => u.pathname === '/app', { timeout: 60000 });
  await expect.poll(() => outra.page.evaluate(() => document.documentElement.hasAttribute('data-reduzir-animacoes'))).toBe(true);
  await abrirSecao(outra.page, '/app/minha-conta', 'notificacoes', 'Notificações');
  await expect(outra.page.locator('#notif-vinculos-email')).not.toBeChecked();
  await expect(outra.page.locator('#notif-vinculos-sistema')).toBeChecked();
  await outra.page.close();
});

test('privacidade: exportação só dos próprios dados; exclusão de conta desabilitada na tela e no banco', async ({ browser }) => {
  const { page } = await entrar(browser, A.email, A.senha);
  await abrirSecao(page, '/app/minha-conta', 'privacidade', 'Privacidade e dados');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar meus dados' }).click()]);
  const conteudo = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(conteudo.conta.email).toBe(A.email);
  expect(conteudo.perfil.nome_completo).toBe('Ana Maria Teste');
  expect(JSON.stringify(conteudo)).not.toContain(B.email);

  // Exclusão de conta desabilitada até a definição do processo
  await expect(page.getByRole('button', { name: 'Solicitar exclusão da conta' })).toBeDisabled();
  await abrirSecao(page, '/app/minha-conta', 'dados', 'Informações da conta');
  await expect(page.getByRole('button', { name: /Encerrar conta/ })).toBeDisabled();
  // Nem pela API: o banco recusa a função
  const viaApi = await A.cliente.rpc('solicitar_exclusao_conta', { p_motivo: 'teste' });
  expect(viaApi.error, 'solicitar_exclusao_conta deve estar bloqueada').not.toBeNull();
  expect((await admin().from('solicitacoes_privacidade').select('id').eq('id_usuario', A.id)).data ?? []).toHaveLength(0);
  const { data: auth } = await admin().auth.admin.getUserById(A.id);
  expect(auth.user).not.toBeNull();
  await page.close();
});

test('layout: todas as seções sem rolagem lateral de 320 a 1440px', async ({ browser }) => {
  const { page, erros } = await entrar(browser, B.email, B.senha);
  for (const secao of ['dados', 'seguranca', 'notificacoes', 'preferencias', 'privacidade']) {
    await page.goto(`${BASE}/app/minha-conta#${secao}`);
    await expect(page.getByRole('heading', { name: 'Minha conta' })).toBeVisible({ timeout: 30000 });
    for (const largura of LARGURAS) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.waitForTimeout(150);
      const excesso = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(excesso, `${secao} @${largura}px`).toBeLessThanOrEqual(1);
    }
  }
  // Celular: lista de seções → seção → voltar
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`${BASE}/app/minha-conta`);
  await page.getByRole('button', { name: /Privacidade e dados/ }).filter({ visible: true }).click();
  await expect(page.getByRole('heading', { name: 'Privacidade e dados' })).toBeVisible();
  await page.getByRole('button', { name: 'Todas as seções' }).click();
  await expect(page.getByRole('button', { name: /Sair da conta/ }).filter({ visible: true })).toBeVisible();
  expect(erros).toEqual([]);
  await page.close();
});

test('sair da conta: encerra a sessão e não deixa dados acessíveis', async ({ browser }) => {
  const { page } = await entrar(browser, B.email, B.senha);
  await page.goto(`${BASE}/app/minha-conta`);
  await page.getByRole('button', { name: /Sair da conta/ }).filter({ visible: true }).first().click();
  await page.waitForURL('**/login', { timeout: 30000 });
  await page.goBack();
  await page.waitForURL('**/login', { timeout: 30000 });
  await expect(page.getByText(B.email)).toHaveCount(0);
  await page.goto(`${BASE}/app/minha-conta`);
  await page.waitForURL('**/login', { timeout: 30000 });
  await page.close();
});

test('Admin Master: Minha conta dentro do painel administrativo', async ({ browser }) => {
  const email = `delivered+${marca}master@resend.dev`;
  const senha = `Mc@${Date.now()}x`;
  const { data } = await admin().auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome_completo: 'Admin Teste' } });
  criados.push(data.user!.id);
  await admin().from('perfis').update({ funcao_global: 'admin_master' }).eq('id_usuario', data.user!.id);
  const { page, erros } = await entrar(browser, email, senha);
  await page.waitForURL((u) => u.pathname === '/admin', { timeout: 60000 });
  await page.getByRole('button', { name: /^Menu do perfil/ }).click();
  await page.getByRole('menuitem', { name: /Minha conta/ }).click();
  await page.waitForURL((u) => u.pathname === '/admin/perfil', { timeout: 60000 });
  await expect(page.getByRole('heading', { name: 'Minha conta' })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Admin Master').first()).toBeVisible();
  await page.goto(`${BASE}/admin/preferencias`);
  await expect(page.getByRole('heading', { name: 'Preferências', exact: true })).toBeVisible({ timeout: 30000 });
  expect(new URL(page.url()).pathname).toBe('/admin/preferencias');
  expect(erros.filter((e) => !/status of 4\d\d/.test(e))).toEqual([]);
  await page.close();
});
