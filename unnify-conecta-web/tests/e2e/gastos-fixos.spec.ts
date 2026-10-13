import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Gastos fixos (interface): empresa em /app/financeiro#gastos-fixos e Admin Master em /admin/financeiro.
// Cadastro com prévia de vencimentos, ocorrências em Contas a pagar, pagamento pela janela única com banco sugerido,
// edição sem alterar o pago, pausar/reativar/encerrar, pagamento/estorno da plataforma, bloqueios de acesso e layout 320–1920px.

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
const marca = `gu${Date.now()}`;
const LARGURAS = [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920];
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
type Conta = { id: string; email: string; senha: string };
const usuarios: string[] = [];
let E: Conta;
let M: Conta;
let AD: Conta;
let idEmpresa = '';

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

async function criarConta(rotulo: string, funcao?: 'admin' | 'admin_master'): Promise<Conta> {
  const email = `delivered+${marca}${rotulo}@resend.dev`;
  const senha = `Gu@${Date.now()}x`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome_completo: `Teste ${rotulo}` } });
  if (error) throw error;
  usuarios.push(data.user.id);
  await admin().from('perfis').update({ tipo_usuario: 'empresa', ...(funcao ? { funcao_global: funcao } : {}) }).eq('id_usuario', data.user.id);
  return { id: data.user.id, email, senha };
}

async function entrar(page: Page, c: Conta, destino: string) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('E-mail').fill(c.email);
  await page.getByLabel('Senha', { exact: true }).fill(c.senha);
  await page.getByRole('button', { name: /Entrar/ }).click();
  await page.waitForURL((u) => u.pathname === destino, { timeout: 60000 });
  await page.waitForLoadState('networkidle');
}

const texto = async (page: Page, regiao: string) => ((await page.getByRole('region', { name: regiao, exact: true }).textContent()) ?? '').replace(/ /g, ' ');

async function preencherGasto(page: Page, p: { nome: string; valor: string; categoria: string; dia?: string; recorrencia?: string; tipoValor?: string }) {
  const d = page.getByRole('dialog');
  await d.getByLabel(/^Nome do gasto fixo/).fill(p.nome);
  await d.getByLabel(/^Valor previsto/).fill(p.valor);
  if (p.tipoValor) await d.getByLabel('Tipo de valor').selectOption({ label: p.tipoValor });
  if (p.recorrencia) await d.getByLabel(/^Recorrência/).selectOption({ label: p.recorrencia });
  if (p.dia) await d.getByLabel(/^Dia de vencimento/).selectOption(p.dia);
  await d.getByLabel(/^Categoria/).selectOption({ label: p.categoria });
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(6 * 60 * 1000);

test.beforeAll(async () => {
  E = await criarConta('e');
  M = await criarConta('m', 'admin_master');
  AD = await criarConta('ad', 'admin');
  const cli = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await cli.auth.signInWithPassword({ email: E.email, password: E.senha });
  const { data: r } = await cli.rpc('criar_empresa', {
    p_cnpj: cnpjAleatorio(), p_razao_social: `EMPRESA ${marca} LTDA`, p_telefone: '63999990000', p_email_comercial: 'teste@resend.dev',
    p_cidade: 'Palmas', p_estado: 'TO', p_tipo_empresa: 'comum', p_nome_comercial: `Gastos ${marca}`,
  });
  idEmpresa = r?.[0]?.id;
  await cli.rpc('inicializar_categorias_financeiras', { p_id_empresa: idEmpresa });
  await cli.rpc('salvar_conta_financeira', { p_id: null, p_id_empresa: idEmpresa, p_nome: 'Banco Principal', p_instituicao: 'Banco', p_tipo: 'conta_corrente', p_saldo_inicial: '5000.00', p_data_saldo_inicial: `${hoje.slice(0, 7)}-01`, p_permite_saldo_negativo: false });
  await cli.rpc('salvar_conta_financeira', { p_id: null, p_id_empresa: idEmpresa, p_nome: 'Banco do Aluguel', p_instituicao: 'Banco', p_tipo: 'conta_corrente', p_saldo_inicial: '3000.00', p_data_saldo_inicial: `${hoje.slice(0, 7)}-01`, p_permite_saldo_negativo: false });
});

test.afterAll(async () => {
  const sb = admin();
  const { data: gastos } = await sb.from('gastos_fixos').select('id').in('criado_por', usuarios);
  const ids = (gastos ?? []).map((g) => g.id);
  if (ids.length) for (const t of ['historico_gastos_fixos', 'anexos_gastos_fixos', 'ocorrencias_gastos_plataforma']) await sb.from(t).delete().in('id_gasto_fixo', ids);
  if (idEmpresa) for (const t of ['historico_lancamentos_financeiros', 'anexos_financeiros', 'movimentacoes_financeiras', 'historico_contas_financeiras', 'lancamentos_financeiros']) await sb.from(t).delete().eq('id_empresa', idEmpresa);
  if (ids.length) await sb.from('gastos_fixos').delete().in('id', ids);
  if (idEmpresa) for (const t of ['contas_financeiras', 'categorias_financeiras']) await sb.from(t).delete().eq('id_empresa', idEmpresa);
  await sb.from('categorias_financeiras').delete().is('id_empresa', null).in('criado_por', usuarios);
  for (const id of usuarios) await sb.auth.admin.deleteUser(id);
});

test('empresa: cadastra, vê em Contas a pagar, paga com banco sugerido, edita, pausa, reativa e encerra', async ({ page }) => {
  const erros: string[] = [];
  page.on('console', (m) => m.type() === 'error' && erros.push(m.text().slice(0, 160)));
  page.on('pageerror', (e) => erros.push(e.message.slice(0, 160)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(page, E, '/app');
  await page.goto(`${BASE}/app/financeiro#gastos-fixos`);
  await expect(page.getByText('Nenhum gasto fixo cadastrado ainda.')).toBeVisible({ timeout: 30000 });

  await page.getByRole('button', { name: 'Novo gasto fixo' }).click();
  await page.getByRole('button', { name: 'Salvar gasto fixo' }).click();
  await expect(page.getByRole('dialog').getByText('Informe o nome do gasto fixo (mínimo 2 caracteres).')).toBeVisible();
  await preencherGasto(page, { nome: 'Aluguel do escritório', valor: '120000', categoria: 'Aluguel', dia: String(Number(hoje.slice(8, 10))) });
  await page.getByRole('dialog').getByLabel('Fornecedor (opcional)').fill('Condomínio Empresarial');
  await page.getByRole('dialog').getByLabel('Banco vinculado (opcional)').selectOption({ label: 'Banco do Aluguel' });
  await expect(page.getByTestId('previa-vencimentos')).toContainText(dataBR(hoje));
  await page.getByRole('button', { name: 'Salvar gasto fixo' }).click();
  await expect(page.getByText('Gasto fixo cadastrado.')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('gasto-Aluguel do escritório')).toBeVisible();
  await expect.poll(() => texto(page, 'Total do mês')).toContain('R$ 1.200,00');
  await expect(page.getByRole('region', { name: 'Próximos vencimentos' })).toContainText('Aluguel do escritório');

  // Ocorrências viram despesas pendentes em Contas a pagar: uma por mês (atual e seguinte), sem duplicar
  await page.getByRole('navigation', { name: 'Seções do financeiro' }).getByRole('button', { name: 'Contas a pagar' }).click();
  await page.getByLabel('Buscar por descrição, cliente ou fornecedor').fill('Aluguel do escritório');
  const linhas = page.getByRole('row').filter({ hasText: 'Aluguel do escritório' });
  await expect(linhas).toHaveCount(2, { timeout: 15000 });
  await expect(linhas.filter({ hasText: dataBR(hoje) })).toHaveCount(1);

  // Pagar pela janela única: conta sugerida = banco vinculado
  await page.getByRole('navigation', { name: 'Seções do financeiro' }).getByRole('button', { name: 'Gastos fixos' }).click();
  await page.getByRole('button', { name: 'Detalhes de Aluguel do escritório' }).click();
  const detalhes = page.getByRole('region', { name: 'Detalhes de Aluguel do escritório' });
  await expect(detalhes.getByTestId(`ocorrencia-${hoje}`)).toBeVisible({ timeout: 15000 });
  await detalhes.getByRole('button', { name: `Pagar ocorrência de ${dataBR(hoje)}` }).click();
  await expect(page.getByRole('dialog').getByLabel('Conta de origem')).toHaveValue(/.+/);
  await expect(page.getByRole('dialog').getByLabel('Conta de origem').locator('option:checked')).toHaveText(/Banco do Aluguel/);
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Pagamento registrado.')).toBeVisible({ timeout: 15000 });
  await expect.poll(() => texto(page, 'Pago no mês')).toContain('R$ 1.200,00');
  await expect(detalhes.getByTestId(`ocorrencia-${hoje}`)).toContainText('Paga');

  // Editar valor: o pago continua 1.200; a próxima pendente passa a 1.350
  await page.getByRole('button', { name: 'Editar Aluguel do escritório' }).click();
  await page.getByRole('dialog').getByLabel(/^Valor previsto/).fill('135000');
  await page.getByRole('button', { name: 'Salvar gasto fixo' }).click();
  await expect(page.getByText('Gasto fixo atualizado.')).toBeVisible({ timeout: 20000 });
  await expect(detalhes.getByTestId(`ocorrencia-${hoje}`)).toContainText('R$ 1.200,00');
  await expect(detalhes.getByText('R$ 1.350,00')).toBeVisible();
  await expect(detalhes.getByLabel('Histórico do gasto fixo')).toContainText('Editado');

  // Pausar → próxima pendente cancelada; reativar → volta
  await page.getByRole('button', { name: 'Pausar Aluguel do escritório' }).click();
  await expect(page.getByText(/Gasto fixo pausado/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('gasto-Aluguel do escritório').locator('xpath=ancestor::tr')).toContainText('Pausado');
  await expect(detalhes.getByText('Cancelada')).toBeVisible();
  await page.getByRole('button', { name: 'Reativar Aluguel do escritório' }).click();
  await expect(page.getByText('Gasto fixo reativado.')).toBeVisible({ timeout: 15000 });
  await expect(detalhes.getByText('Cancelada')).toHaveCount(0);

  // Estorno pela janela de confirmação
  await detalhes.getByRole('button', { name: `Estornar ocorrência de ${dataBR(hoje)}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Estornar' }).click();
  await expect(page.getByText(/Pagamento estornado/)).toBeVisible({ timeout: 15000 });
  await expect.poll(() => texto(page, 'Pago no mês')).toContain('R$ 0,00');

  // Encerrar
  await page.getByRole('button', { name: 'Encerrar Aluguel do escritório' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Encerrar' }).click();
  await expect(page.getByText('Gasto fixo encerrado.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('gasto-Aluguel do escritório').locator('xpath=ancestor::tr')).toContainText('Encerrado');
  await expect(page.getByRole('button', { name: 'Editar Aluguel do escritório' })).toHaveCount(0);

  // Nova categoria pelo próprio formulário (com cor) mantém os dados digitados
  await page.getByRole('button', { name: 'Novo gasto fixo' }).click();
  await page.getByRole('dialog').getByLabel(/^Nome do gasto fixo/).fill('Seguro');
  await page.getByRole('dialog').getByRole('button', { name: 'Nova' }).click();
  await page.getByRole('dialog').getByLabel('Nome', { exact: true }).fill(`Seguros ${marca}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('dialog').getByLabel(/^Nome do gasto fixo/)).toHaveValue('Seguro', { timeout: 15000 });
  await expect(page.getByRole('dialog').getByLabel(/^Categoria/).locator('option:checked')).toHaveText(`Seguros ${marca}`, { timeout: 15000 });

  expect(erros).toEqual([]);
});

test('Admin Master: menu, cadastro, ajuste de valor variável, pagamento e estorno sem contas bancárias', async ({ page }) => {
  const erros: string[] = [];
  page.on('console', (m) => m.type() === 'error' && erros.push(m.text().slice(0, 160)));
  page.on('pageerror', (e) => erros.push(e.message.slice(0, 160)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(page, M, '/admin');
  await page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Financeiro' }).click();
  await page.waitForURL((u) => u.pathname === '/admin/financeiro');
  await expect(page.getByRole('heading', { name: 'Gastos Fixos', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByLabel('Banco vinculado (opcional)')).toHaveCount(0);

  await page.getByRole('button', { name: 'Novo gasto fixo' }).click();
  await expect(page.getByRole('dialog').getByLabel('Banco vinculado (opcional)')).toHaveCount(0);
  await preencherGasto(page, { nome: `Hospedagem ${marca}`, valor: '48000', categoria: 'Hospedagem e servidores', tipoValor: 'Valor variável', dia: String(Number(hoje.slice(8, 10))) });
  await page.getByRole('button', { name: 'Salvar gasto fixo' }).click();
  await expect(page.getByText('Gasto fixo cadastrado.')).toBeVisible({ timeout: 20000 });
  const detalhes = page.getByRole('region', { name: `Detalhes de Hospedagem ${marca}` });
  await expect(detalhes.getByTestId(`ocorrencia-${hoje}`)).toBeVisible({ timeout: 15000 });

  // Valor variável: ajustar e pagar; parcial é recusado
  await detalhes.getByTestId(`ocorrencia-${hoje}`).getByRole('button', { name: 'Ajustar' }).click();
  await page.getByRole('dialog').getByLabel('Valor (R$)').fill('51234');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Ocorrência ajustada.')).toBeVisible({ timeout: 15000 });
  await expect(detalhes.getByTestId(`ocorrencia-${hoje}`)).toContainText('R$ 512,34');
  await detalhes.getByRole('button', { name: `Pagar ocorrência de ${dataBR(hoje)}` }).click();
  await page.getByRole('dialog').getByLabel('Valor pago (R$)').fill('10000');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('parcial', { timeout: 15000 });
  await page.getByRole('dialog').getByLabel('Valor pago (R$)').fill('51234');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Pagamento registrado.')).toBeVisible({ timeout: 15000 });
  await expect(detalhes.getByTestId(`ocorrencia-${hoje}`)).toContainText('Paga');
  await expect.poll(() => texto(page, 'Pago no mês')).toContain('R$ 512,34');

  await detalhes.getByRole('button', { name: `Estornar ocorrência de ${dataBR(hoje)}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Estornar' }).click();
  await expect(page.getByText(/Pagamento estornado/)).toBeVisible({ timeout: 15000 });
  await expect(detalhes.getByLabel('Histórico do gasto fixo')).toContainText('Pagamento estornado');
  await expect(detalhes.getByLabel('Histórico do gasto fixo')).toContainText('Pagamento registrado');

  // Categorias da plataforma (aba própria)
  await page.getByRole('navigation', { name: 'Seções do financeiro' }).getByRole('button', { name: 'Categorias' }).click();
  await expect(page.getByText('Categorias das despesas administrativas da plataforma.')).toBeVisible();
  await expect(page.getByText('Hospedagem e servidores')).toBeVisible();

  // Admin Master não vê os gastos da empresa do teste anterior
  await page.getByRole('navigation', { name: 'Seções do financeiro' }).getByRole('button', { name: 'Gastos fixos' }).click();
  await expect(page.getByTestId(`gasto-Hospedagem ${marca}`)).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('gasto-Aluguel do escritório')).toHaveCount(0);
  // Esperado: um único 400 = a tentativa proposital de pagamento parcial, recusada pelo banco
  expect(erros.filter((e) => /status of 400/.test(e))).toHaveLength(1);
  expect(erros.filter((e) => !/status of 400/.test(e))).toEqual([]);
});

test('acesso: admin comum vê restrição, empresa não entra no admin, menu sem Financeiro para admin comum', async ({ browser }) => {
  const pa = await browser.newPage();
  await entrar(pa, AD, '/admin');
  await expect(pa.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Tarefas' })).toBeVisible();
  await expect(pa.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Financeiro' })).toHaveCount(0);
  await pa.goto(`${BASE}/admin/financeiro`);
  await expect(pa.getByText('O financeiro da plataforma é restrito ao Admin Master.')).toBeVisible({ timeout: 30000 });
  await pa.close();

  const pe = await browser.newPage();
  await entrar(pe, E, '/app');
  await pe.goto(`${BASE}/admin/financeiro`);
  await pe.waitForURL((u) => u.pathname === '/app', { timeout: 30000 });
  await pe.close();
});

test('layout de Gastos fixos sem rolagem lateral de 320 a 1920px (empresa e admin)', async ({ browser }) => {
  for (const [conta, destino, url] of [[E, '/app', '/app/financeiro#gastos-fixos'], [M, '/admin', '/admin/financeiro']] as const) {
    const page = await browser.newPage();
    await entrar(page, conta, destino);
    await page.goto(`${BASE}${url}`);
    await expect(page.getByText('Gastos fixos por categoria')).toBeVisible({ timeout: 30000 });
    for (const largura of LARGURAS) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.waitForTimeout(150);
      const excesso = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(excesso, `${url} @${largura}px`).toBeLessThanOrEqual(1);
    }
    await page.setViewportSize({ width: 320, height: 800 });
    await page.getByRole('button', { name: 'Novo gasto fixo' }).click();
    await expect(page.getByRole('dialog').getByLabel(/^Nome do gasto fixo/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `formulário ${url} @320`).toBeLessThanOrEqual(1);
    await page.close();
  }
});
