// teste-sem-banco: só funções puras ou API simulada por route (não acessa o Supabase)
import { test, expect, type BrowserContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Painel /app (E1) — interface com a API do Supabase SIMULADA no navegador (page.route).
// NÃO acessa o banco: nenhuma leitura ou escrita real; qualquer requisição que não seja leitura é abortada e reprovada.

function carregarEnv(): Record<string, string> {
  const texto = readFileSync(join(__dirname, '..', '..', '.env.local'), 'utf8');
  return Object.fromEntries(texto.split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
}

const env = carregarEnv();
const BASE = 'http://localhost:3000';
const SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(SUPABASE).hostname.split('.')[0];
const LARGURAS = [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920];
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const somar = (d: number) => { const x = new Date(`${hoje}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
const mes = (k: number) => { const x = new Date(`${hoje.slice(0, 7)}-01T12:00:00Z`); x.setUTCMonth(x.getUTCMonth() - k); return x.toISOString().slice(0, 10); };

const usuario = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'painel@exemplo.test', app_metadata: {}, user_metadata: {}, factors: [] };
const EMPRESAS = [
  { id: 'aaaaaaaa-0000-4000-8000-000000000001', razao_social: 'ALFA COMERCIO LTDA', nome_comercial: 'Alfa', cnpj: '12345678000190', tipo_empresa: 'comum' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000002', razao_social: 'BETA SERVICOS LTDA', nome_comercial: null, cnpj: '98.765.432/0001-10', tipo_empresa: 'comum' },
];
const RESUMO = {
  periodo_inicio: mes(0), receitas_mes: 32800, despesas_mes: 14350, receitas_mes_anterior: 30370, despesas_mes_anterior: 15100, pagamentos_financiamentos_mes: 0,
  a_pagar_30_valor: 4200, a_pagar_30_qtd: 5, a_pagar_vencidas_qtd: 1, a_receber_vencidas_qtd: 0, a_receber_30_valor: 12850, a_receber_30_qtd: 8,
  serie: [0, 0, 33000, 0, 37000, 32800].map((r, i) => ({ mes: mes(5 - i), receitas: r, despesas: r ? Math.round(r / 2) : 0 })),
};

type Cenario = { resumo?: 'ok' | 'erro' | 'sem030' | 'vazio'; rpcEdicao?: 'ok' | 'inexistente'; };

async function prepararSessao(ctx: BrowserContext, cenario: Cenario, registro: { escritas: string[]; empresasConsultadas: string[]; edicao?: Record<string, unknown> }) {
  const agora = Math.floor(Date.now() / 1000);
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: usuario.id, role: 'authenticated', aal: 'aal1', amr: [{ method: 'password', timestamp: agora }], exp: agora + 3600, iat: agora })}.${b64('assinatura-falsa')}`;
  const sessao = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: agora + 3600, refresh_token: 'x', user: usuario };
  await ctx.addCookies([{ name: `sb-${REF}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(sessao)).toString('base64url')}`, domain: 'localhost', path: '/' }]);
  await ctx.route(`${SUPABASE}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (corpo: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corpo) });
    if (url.pathname === '/auth/v1/user') return json(usuario);
    if (url.pathname.endsWith('/rpc/resumo_financeiro')) {
      registro.empresasConsultadas.push(JSON.parse(req.postData() ?? '{}').p_id_empresa);
      if (cenario.resumo === 'erro') return json({ message: 'falha simulada', code: 'XX000' }, 500);
      if (cenario.resumo === 'sem030') { const { a_receber_30_valor: _v, a_receber_30_qtd: _q, ...r } = RESUMO; return json(r); }
      if (cenario.resumo === 'vazio') return json({ ...RESUMO, receitas_mes: 0, despesas_mes: 0, receitas_mes_anterior: 0, despesas_mes_anterior: 0, serie: RESUMO.serie.map((s) => ({ ...s, receitas: 0, despesas: 0 })) });
      return json(RESUMO);
    }
    if (url.pathname.endsWith('/rpc/atualizar_dados_empresa')) {
      registro.edicao = JSON.parse(req.postData() ?? '{}');
      if (cenario.rpcEdicao === 'inexistente') return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
      return route.fulfill({ status: 204, body: '' });
    }
    if (req.method() !== 'GET') { registro.escritas.push(`${req.method()} ${url.pathname}`); return route.abort(); }
    if (url.pathname.endsWith('/perfis')) return json([{ nome_completo: 'Ana Souza', tipo_usuario: 'empresa', funcao_global: 'user' }]);
    if (url.pathname.endsWith('/usuarios_empresas')) return json(EMPRESAS.map((e) => ({ empresas: e })));
    if (url.pathname.endsWith('/lancamentos_financeiros_situacao')) {
      if (cenario.resumo === 'vazio') return json([]);
      // Soma do valor já vencido (cards A pagar/A receber)
      if (url.searchParams.get('situacao') === 'eq.vencido') return json([{ tipo: 'despesa', valor: 1200 }]);
      // Receitas operacionais em aberto (pendentes/vencidas), por competência
      if (url.searchParams.get('natureza_financeira') === 'eq.operacional') return json([{ valor: 837, data_competencia: somar(-35) }]);
      const receita = url.searchParams.get('tipo') === 'eq.receita';
      return json([{ id: 'l1', descricao: receita ? 'Cliente XYZ' : 'Aluguel', valor: receita ? 2500 : 1200, data_vencimento: receita ? somar(3) : somar(-2), situacao: receita ? 'pendente' : 'vencido', categoria_icone: 'tag', categoria_cor: '#9ca3af' }]);
    }
    if (url.pathname.endsWith('/empresas')) {
      const id = (url.searchParams.get('id') ?? '').replace('eq.', '');
      const e = EMPRESAS.find((x) => x.id === id) ?? EMPRESAS[0];
      return json([{ ...e, telefone: '11934567890', email_comercial: 'contato@alfa.test', cidade: 'São Paulo', estado: 'SP', cnae_principal: '6201-5/01', status_registro: 'ATIVA' }]);
    }
    return json([]);
  });
}

const texto = async (loc: import('@playwright/test').Locator) => ((await loc.textContent()) ?? '').replace(/ /g, ' ');

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

test('indicadores, gráfico, listas e dados vêm da API (valores sem invenção); troca de empresa', async ({ browser }) => {
  const registro = { escritas: [] as string[], empresasConsultadas: [] as string[] };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await prepararSessao(ctx, { resumo: 'ok' }, registro);
  const page = await ctx.newPage();
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto(`${BASE}/app`);
  await expect(page.getByRole('heading', { name: 'Olá, Ana!' })).toBeVisible({ timeout: 90000 });
  await expect(page.getByText('CNPJ 12.345.678/0001-90')).toBeVisible();
  expect(await texto(page.getByRole('region', { name: 'Receitas do mês', exact: true }))).toContain('R$ 32.800,00');
  expect(await texto(page.getByRole('region', { name: 'Receitas do mês', exact: true }))).toContain('+8%');
  expect(await texto(page.getByRole('region', { name: 'Despesas do mês', exact: true }))).toContain('R$ 14.350,00');
  expect(await texto(page.getByRole('region', { name: 'A receber', exact: true }))).toContain('8 contas nos próximos 30 dias');
  expect(await texto(page.getByRole('region', { name: 'A pagar', exact: true }))).toContain('1 vencida');
  // Valor em aberto inclui o vencido: 4.200 (30 dias) + 1.200 (vencida) — antes o vencido ficava fora do total
  expect(await texto(page.getByRole('region', { name: 'A pagar', exact: true }))).toContain('R$ 5.400,00');
  expect(await texto(page.getByRole('region', { name: 'A pagar', exact: true }))).toContain('1 vencida · R$ 1.200,00');
  expect(await texto(page.getByRole('region', { name: 'A receber', exact: true }))).toContain('R$ 12.850,00'); // sem vencidas: inalterado
  // Receita ainda não recebida: aparece SEPARADA do recebido no card, no gráfico (tracejado) e na rosca
  await expect(page.getByTestId('receitas-em-aberto')).toContainText('+ R$ 837,00 a receber');
  expect(await texto(page.getByRole('region', { name: 'Receitas do mês', exact: true }))).toContain('R$ 32.800,00');
  await expect(page.locator('table').filter({ hasText: 'Receitas e despesas pagas por mês' }).locator('thead')).toContainText('A receber');
  await expect(page.getByRole('region', { name: 'Situação financeira', exact: true })).toContainText('A receber (em aberto)');
  // Meses sem movimentação aparecem como R$ 0,00 na tabela do gráfico (nada inventado)
  const tabela = page.locator('table').filter({ hasText: 'Receitas e despesas pagas por mês' });
  await expect(tabela.locator('tbody tr')).toHaveCount(6);
  expect(await texto(tabela.locator('tbody tr').first())).toContain('R$ 0,00');
  await expect(page.getByRole('region', { name: 'Situação financeira', exact: true })).toContainText('68%'); // 32.800 ÷ (32.800 + 14.350 + 837 em aberto)
  await expect(page.getByRole('region', { name: 'Situação financeira', exact: true })).toContainText('Não representam margem de lucro');
  await expect(page.getByTestId('conta-Aluguel')).toContainText('Venceu há 2 dias');
  await expect(page.getByTestId('conta-Cliente XYZ')).toContainText('Vence em 3 dias');
  await expect(page.getByRole('link', { name: 'Ver todas →' }).first()).toHaveAttribute('href', '/app/financeiro#pagar');
  await expect(page.getByRole('link', { name: 'Ver todas →' }).nth(1)).toHaveAttribute('href', '/app/financeiro#receber');
  await expect(page.getByLabel('Dados cadastrais')).toContainText('(11) 93456-7890');

  // Troca de empresa: só entre as empresas da lista; os dados passam a ser consultados para a nova empresa
  await page.getByLabel('Empresa selecionada').selectOption(EMPRESAS[1].id);
  await expect(page.getByText('CNPJ 98.765.432/0001-10')).toBeVisible();
  await expect.poll(() => registro.empresasConsultadas.at(-1)).toBe(EMPRESAS[1].id);
  expect(registro.escritas).toEqual([]);
  expect(erros).toEqual([]);
  await ctx.close();
});

test('edição cadastral: campos protegidos só leitura; grava apenas pela função segura', async ({ browser }) => {
  const registro: { escritas: string[]; empresasConsultadas: string[]; edicao?: Record<string, unknown> } = { escritas: [], empresasConsultadas: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await prepararSessao(ctx, { resumo: 'ok', rpcEdicao: 'ok' }, registro);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app`);
  await page.getByRole('button', { name: 'Editar dados da empresa' }).click();
  const d = page.getByRole('dialog');
  await expect(d.getByText('ALFA COMERCIO LTDA')).toBeVisible();
  await expect(d.getByRole('textbox', { name: /Razão social|CNPJ/ })).toHaveCount(0);
  await d.getByLabel(/^E-mail comercial/).fill('invalido');
  await d.getByRole('button', { name: 'Salvar' }).click();
  await expect(d.getByRole('alert')).toContainText('e-mail comercial válido');
  expect(registro.edicao).toBeUndefined();
  await d.getByLabel(/^E-mail comercial/).fill('novo@alfa.test');
  await d.getByLabel('Telefone').fill('63988887777');
  await d.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Dados da empresa atualizados.')).toBeVisible({ timeout: 15000 });
  expect(registro.edicao).toEqual({
    p_id_empresa: EMPRESAS[0].id, p_nome_comercial: 'Alfa', p_telefone: '63988887777', p_email_comercial: 'novo@alfa.test',
    p_cidade: 'São Paulo', p_estado: 'SP', p_cnae_principal: '6201-5/01',
  });
  expect(registro.escritas, 'nenhum UPDATE direto em empresas').toEqual([]);
  await ctx.close();

  // Função ainda não publicada (E0 pendente): mensagem clara, sem fingir sucesso
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await prepararSessao(ctx2, { resumo: 'ok', rpcEdicao: 'inexistente' }, { escritas: [], empresasConsultadas: [] });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/app`);
  await p2.getByRole('button', { name: 'Editar dados da empresa' }).click();
  await p2.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await expect(p2.getByRole('dialog').getByRole('alert')).toContainText('liberada após a atualização de segurança');
  await ctx2.close();
});

test('estados: erro não vira R$ 0,00; sem movimentação mostra vazio; sem migration 030 mostra indisponível', async ({ browser }) => {
  for (const [cenario, verificar] of [
    ['erro', async (p: import('@playwright/test').Page) => {
      await expect(p.getByText('Não foi possível carregar os indicadores financeiros.')).toBeVisible();
      expect(await texto(p.getByRole('region', { name: 'Receitas do mês', exact: true }))).toContain('Indisponível');
      expect(await texto(p.getByRole('region', { name: 'Receitas do mês', exact: true }))).not.toContain('R$ 0,00');
    }],
    ['vazio', async (p: import('@playwright/test').Page) => {
      await expect(p.getByText('Sem receitas ou despesas pagas nos últimos 6 meses.')).toBeVisible();
      await expect(p.getByText('Nenhuma conta a pagar pendente.')).toBeVisible();
      expect(await texto(p.getByRole('region', { name: 'Receitas do mês', exact: true }))).toContain('Sem base no mês anterior');
    }],
    ['sem030', async (p: import('@playwright/test').Page) => {
      expect(await texto(p.getByRole('region', { name: 'A receber', exact: true }))).toContain('Indisponível');
      expect(await texto(p.getByRole('region', { name: 'A pagar', exact: true }))).toContain('R$ 5.400,00'); // 4.200 em 30 dias + 1.200 vencida
    }],
  ] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await prepararSessao(ctx, { resumo: cenario }, { escritas: [], empresasConsultadas: [] });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/app`);
    await expect(page.getByText('Dados da empresa', { exact: true })).toBeVisible({ timeout: 90000 });
    await verificar(page);
    await ctx.close();
  }
});

test('layout do painel sem rolagem lateral de 320 a 1920px', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await prepararSessao(ctx, { resumo: 'ok' }, { escritas: [], empresasConsultadas: [] });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app`);
  await expect(page.getByText('Dados da empresa', { exact: true })).toBeVisible({ timeout: 90000 });
  for (const largura of LARGURAS) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.waitForTimeout(200);
    const excesso = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(excesso, `painel @${largura}px`).toBeLessThanOrEqual(1);
  }
  await ctx.close();
});
