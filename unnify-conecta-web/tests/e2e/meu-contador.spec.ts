import { test, expect, type Page, type Browser } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const marca = `mc${Date.now()}`;
const EMAIL_CONTATO = `contato.${marca}@resend.dev`;
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

async function usuarioComEmpresa(rotulo: string, tipo: 'empresa' | 'contador') {
  const email = `delivered+${marca}${rotulo}@resend.dev`;
  const senha = `Mc@${Date.now()}x`;
  const { data, error } = await admin().auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { nome_completo: `Teste ${rotulo}` },
  });
  if (error) throw error;
  criados.push(data.user.id);
  await admin().from('perfis').update({ tipo_usuario: tipo }).eq('id_usuario', data.user.id);
  const cli = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await cli.auth.signInWithPassword({ email, password: senha });
  const { data: r } = await cli.rpc('criar_empresa', {
    p_cnpj: cnpjAleatorio(), p_razao_social: `EMPRESA ${rotulo} ${marca} LTDA`, p_telefone: '63999990000',
    p_email_comercial: 'teste@resend.dev', p_cidade: 'Palmas', p_estado: 'TO',
    p_tipo_empresa: tipo === 'contador' ? 'escritorio_contabil' : 'comum', p_nome_comercial: `${rotulo} ${marca}`,
  });
  if (!r?.[0]?.sucesso) throw new Error('criar_empresa falhou');
  return { id: data.user.id, email };
}

async function abrirComo(browser: Browser, email: string, largura = 1440) {
  const page = await browser.newPage({ viewport: { width: largura, height: 900 } });
  const erros: string[] = [];
  page.on('console', (m) => m.type() === 'error' && erros.push(m.text().slice(0, 160)));
  page.on('pageerror', (e) => erros.push(e.message.slice(0, 160)));
  const { data, error } = await admin().auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  await page.goto(`${BASE}/auth/callback?token_hash=${data.properties.hashed_token}&type=email`);
  await page.waitForURL((u) => !u.pathname.startsWith('/auth/callback'), { timeout: 30000 });
  return { page, erros };
}

async function semRolagemNoCelular(page: Page) {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.waitForTimeout(300);
  const excesso = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(excesso, `rolagem lateral em ${page.url()}`).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 1440, height: 900 });
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

test.describe.configure({ mode: 'serial' });
test.setTimeout(8 * 60 * 1000);

test('fluxo Meu contador: perfil → catálogo → solicitação → aceite → principal com contatos', async ({ browser }) => {
  try {
    const emp = await usuarioComEmpresa('empresa', 'empresa');
    const cont = await usuarioComEmpresa('contador', 'contador');

    // 1. Contador publica o perfil
    const c = await abrirComo(browser, cont.email);
    await c.page.goto(`${BASE}/contador/perfil-profissional`);
    await c.page.getByLabel('Nome profissional *').fill(`Ana ${marca}`);
    await c.page.getByLabel(/^CRC/).fill('TO-012345/O');
    await c.page.getByLabel(/^Cidade/).fill('Augustinópolis');
    await c.page.getByLabel(/^UF/).selectOption('TO');
    await c.page.getByLabel('MEI').check();
    await c.page.getByLabel('Simples Nacional').check();
    await c.page.getByLabel('Visita à empresa do cliente').check();
    await c.page.getByLabel('Telefone/WhatsApp').check();
    await c.page.getByLabel('Presencial no escritório').uncheck();
    await c.page.getByLabel(/Serviços oferecidos/).fill('Contabilidade mensal\nFolha de pagamento');
    await c.page.getByLabel(/^Sobre/).fill('Atendimento personalizado para pequenas empresas.');
    await c.page.getByLabel('E-mail comercial').fill(EMAIL_CONTATO);
    await c.page.getByLabel('Telefone comercial').fill('63999874567');
    await c.page.getByRole('button', { name: 'Salvar perfil' }).click();
    await expect(c.page.getByText('Perfil salvo. Ele não aparece no catálogo.')).toBeVisible();
    await c.page.getByLabel('Selecionar foto').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG });
    await expect(c.page.getByText('Foto atualizada.')).toBeVisible();
    await c.page.getByText('Exibir meu perfil no catálogo').click();
    await expect(c.page.getByText('Perfil salvo e exibido no catálogo.')).toBeVisible();
    await expect(c.page.getByRole('switch')).toBeChecked();
    const { data: pp } = await admin().from('perfis_profissionais').select('modalidades_atendimento').eq('id_usuario', cont.id).single();
    expect(pp?.modalidades_atendimento?.sort()).toEqual(['online', 'telefone_whatsapp', 'visita_cliente']);
    await semRolagemNoCelular(c.page);

    // 2. Empresa: estado vazio → catálogo → perfil (sem contatos)
    const e = await abrirComo(browser, emp.email);
    await e.page.goto(`${BASE}/app/meu-contador`);
    await expect(e.page.getByRole('heading', { name: 'Você ainda não tem um contador' })).toBeVisible();
    await semRolagemNoCelular(e.page);
    await e.page.getByRole('link', { name: 'Buscar contador' }).click();
    await e.page.waitForURL('**/meu-contador/buscar');
    await e.page.getByLabel(/Buscar por nome/).fill(marca);
    await expect(e.page.getByRole('heading', { name: `Ana ${marca}` }).filter({ visible: true })).toHaveCount(1, { timeout: 30000 });
    await expect(e.page.getByText(EMAIL_CONTATO)).toHaveCount(0);
    await semRolagemNoCelular(e.page);
    await e.page.getByRole('link', { name: `Ver perfil de Ana ${marca}` }).click();
    await e.page.waitForURL((u) => /\/meu-contador\/[0-9a-f-]{36}$/.test(u.pathname), { timeout: 60000 });
    await expect(e.page.getByRole('heading', { level: 1, name: `Ana ${marca}` })).toBeVisible({ timeout: 30000 });
    await expect(e.page.getByText('Contabilidade mensal').filter({ visible: true })).toHaveCount(1);
    await expect(e.page.getByText('Online · Visita à empresa do cliente · Telefone/WhatsApp').filter({ visible: true })).toHaveCount(1);
    await expect(e.page.getByText(EMAIL_CONTATO)).toHaveCount(0);
    await expect(e.page.getByAltText(`Foto de Ana ${marca}`).filter({ visible: true })).toHaveCount(1, { timeout: 15000 });
    await semRolagemNoCelular(e.page);

    // 3. Solicitar vínculo
    await e.page.getByRole('button', { name: 'Solicitar vínculo' }).click();
    await e.page.getByRole('button', { name: 'Enviar solicitação' }).click();
    await expect(e.page.getByText(/Solicitação enviada!/)).toBeVisible();
    await e.page.goto(`${BASE}/app/meu-contador`);
    await expect(e.page.getByText(/Aguardando resposta do contador/)).toBeVisible();

    // 4. Contador aceita em Minhas empresas
    await c.page.goto(`${BASE}/contador/empresas`);
    await c.page.getByRole('button', { name: new RegExp(`^Aceitar empresa ${marca}`) }).click();
    await expect(c.page.getByText('Vínculo aceito.')).toBeVisible();
    await semRolagemNoCelular(c.page);

    // 5. Empresa vê o principal em destaque com contatos e ajusta permissões
    await e.page.reload();
    // E4: o card do escritório fica no topo; a gestão do vínculo (principal, contatos, permissões) fica na aba Permissões
    await expect(e.page.getByRole('region', { name: 'Seu escritório contábil' })).toContainText('Vínculo ativo');
    await e.page.getByRole('navigation', { name: 'Relacionamento com o contador' }).getByRole('button', { name: 'Permissões', exact: true }).click();
    await expect(e.page.getByRole('heading', { name: 'Contador principal' })).toBeVisible();
    await expect(e.page.getByRole('link', { name: EMAIL_CONTATO })).toBeVisible();
    await e.page.getByRole('button', { name: 'Gerenciar' }).click();
    await e.page.getByLabel('Ver financeiro').uncheck();
    await e.page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(e.page.getByText('Vínculo atualizado.')).toBeVisible();
    const { data: vinc } = await admin().from('vinculos_contabeis').select('permissoes, status').eq('id_contador', cont.id).single();
    expect(vinc?.status).toBe('ativo');
    expect(vinc?.permissoes).not.toContain('ver_financeiro');
    await semRolagemNoCelular(e.page);

    expect(c.erros, 'erros no console do contador').toEqual([]);
    expect(e.erros, 'erros no console da empresa').toEqual([]);
  } finally {
    const sb = admin();
    const { data: perfis } = await sb.from('perfis_profissionais').select('id, foto_caminho').in('id_usuario', criados);
    const fotos = (perfis ?? []).map((p) => p.foto_caminho).filter(Boolean) as string[];
    if (fotos.length) await sb.storage.from('fotos-perfis').remove(fotos);
    for (const id of criados.reverse()) await sb.auth.admin.deleteUser(id);
  }
});
