import { test, expect, type Page } from '@playwright/test';
import { sessaoSimulada, type Rotas } from './apoio/sessao-simulada';

// Depositar (Financeiro → Contas e bancos) com a API do Supabase SIMULADA: nada é gravado no banco.
// Regras de banco (atomicidade, saldos, idempotência, classificação, acesso, comprovante) em tests/sql/depositos.mjs.
const BASE = 'http://localhost:3000';
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const EMPRESA = { id: 'aaaaaaaa-0000-4000-8000-000000000001', razao_social: 'ALFA LTDA', nome_comercial: 'Alfa', cnpj: '12345678000190', tipo_empresa: 'comum' };
const conta = (id: string, nome: string, tipo: string, saldo: number, principal = false) =>
  ({ id, nome, instituicao: null, tipo, saldo_inicial: saldo, data_saldo_inicial: hoje, principal, permite_saldo_negativo: false, arquivada_em: null, saldo, cor: '#f97316' });
const CONTAS = [conta('a', 'Banco A', 'conta_corrente', 5000, true), conta('b', 'Banco B', 'conta_corrente', 2000), conta('cx', 'Caixa da loja', 'caixa', 500)];

function rotas(contas = CONTAS, extra?: Rotas): Rotas {
  return (c, u, req) => {
    const e = extra?.(c, u, req);
    if (e) return e;
    if (c === 'perfis') return { corpo: [{ nome_completo: 'Ana Souza', tipo_usuario: 'empresa', funcao_global: 'user' }] };
    if (c === 'usuarios_empresas') return { corpo: [{ empresas: EMPRESA }] };
    if (c === 'contas_financeiras_saldo') return { corpo: contas };
    if (c === 'rpc/inicializar_categorias_financeiras') return { status: 204 };
    if (c === 'rpc/registrar_deposito') return { corpo: (JSON.parse(req.postData() ?? '{}') as { p_id: string }).p_id };
    return undefined;
  };
}
async function abrir(page: Page) {
  await page.goto(`${BASE}/app/financeiro#contas`);
  await expect(page.getByRole('heading', { name: 'Financeiro', exact: true })).toBeVisible({ timeout: 90000 });
  await expect(page.getByRole('button', { name: 'Depositar' })).toBeVisible({ timeout: 30000 });
}
const dialogo = (p: Page) => p.getByRole('dialog', { name: 'Depositar' });

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

test('botão ao lado de Nova conta; entre bancos envia origem, destino, valor e chave idempotente', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const reg = await sessaoSimulada(ctx, rotas());
  const page = await ctx.newPage();
  await abrir(page);
  // Mesmo grupo e logo após "Nova conta", mesma altura
  const nova = await page.getByRole('button', { name: 'Nova conta' }).boundingBox();
  const dep = await page.getByRole('button', { name: 'Depositar' }).boundingBox();
  expect(Math.abs(nova!.y - dep!.y)).toBeLessThan(2);
  expect(Math.abs(nova!.height - dep!.height)).toBeLessThan(1);
  expect(dep!.x).toBeGreaterThan(nova!.x);
  await page.getByRole('button', { name: 'Depositar' }).click();
  const d = dialogo(page);
  await expect(d.getByLabel('Data do depósito')).toHaveValue(hoje);
  // Destino só com contas bancárias (caixa não é destino)
  await expect(d.locator('#dep-destino option', { hasText: 'Caixa da loja' })).toHaveCount(0);
  await d.getByRole('button', { name: 'Confirmar depósito' }).click();
  await expect(d.getByRole('alert')).toHaveText('Informe um valor maior que zero.');
  await d.getByLabel('Valor (R$)').fill('100000');
  await d.getByRole('button', { name: 'Confirmar depósito' }).click();
  await expect(d.getByRole('alert')).toHaveText('Escolha a origem do dinheiro.');
  await d.getByLabel('Outra conta bancária cadastrada').check();
  await expect(d.locator('#dep-origem-conta option', { hasText: 'Banco A' })).toHaveCount(0); // destino não aparece como origem
  await d.locator('#dep-origem-conta').selectOption('b');
  await d.getByRole('button', { name: 'Confirmar depósito' }).click();
  await expect(page.getByText('Depósito registrado.')).toBeVisible();
  const corpo = reg.chamadas.filter((x) => x.caminho === 'rpc/registrar_deposito')[0].corpo as Record<string, unknown>;
  expect(corpo).toMatchObject({ p_id_empresa: EMPRESA.id, p_id_conta_destino: 'a', p_origem: 'conta', p_id_conta_origem: 'b', p_valor: '1000.00', p_data: hoje, p_classificacao: null });
  expect(String(corpo.p_id)).toMatch(/^[0-9a-f-]{36}$/);
  expect(reg.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('espécie usa o caixa; externa exige classificação e sócio/credor; erro do banco é mostrado', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let recusar = true;
  const reg = await sessaoSimulada(ctx, rotas(CONTAS, (c) => (c === 'rpc/registrar_deposito' && recusar
    ? { status: 400, corpo: { code: '23514', message: 'Saldo insuficiente em "Caixa da loja": a conta não permite saldo negativo.', details: null, hint: null } } : undefined)));
  const page = await ctx.newPage();
  await abrir(page);
  await page.getByRole('button', { name: 'Depositar' }).click();
  const d = dialogo(page);
  await d.getByLabel('Valor (R$)').fill('80000');
  await d.getByLabel('Dinheiro em espécie / caixa').check();
  await expect(d.locator('#dep-caixa')).toHaveValue('cx');
  await d.getByRole('button', { name: 'Confirmar depósito' }).click();
  await expect(d.getByRole('alert')).toContainText('Saldo insuficiente');
  const chave1 = (reg.chamadas.filter((x) => x.caminho === 'rpc/registrar_deposito')[0].corpo as { p_id: string }).p_id;
  // Nova tentativa no mesmo modal usa a MESMA chave (sem duplicar)
  recusar = false;
  await d.getByLabel('Valor (R$)').fill('30000');
  await d.getByRole('button', { name: 'Confirmar depósito' }).click();
  await expect(page.getByText('Depósito registrado.')).toBeVisible();
  const segunda = reg.chamadas.filter((x) => x.caminho === 'rpc/registrar_deposito')[1].corpo as Record<string, unknown>;
  expect(segunda).toMatchObject({ p_id: chave1, p_origem: 'especie', p_id_conta_origem: 'cx', p_valor: '300.00' });
  // Externa
  await page.getByRole('button', { name: 'Depositar' }).click();
  await d.getByLabel('Valor (R$)').fill('500000');
  await d.getByLabel('Outra origem externa').check();
  await d.getByRole('button', { name: 'Confirmar depósito' }).click();
  await expect(d.getByRole('alert')).toHaveText('Classifique a origem externa.');
  await d.getByLabel('Classificação').selectOption('aporte_socio');
  await d.getByRole('button', { name: 'Confirmar depósito' }).click();
  await expect(d.getByRole('alert')).toHaveText('Informe o sócio que fez o aporte.');
  await d.getByLabel('Sócio').fill('Ana Souza');
  await d.getByRole('button', { name: 'Confirmar depósito' }).click();
  await expect(page.getByText('Depósito registrado.')).toBeVisible();
  const ext = reg.chamadas.filter((x) => x.caminho === 'rpc/registrar_deposito').at(-1)!.corpo as Record<string, unknown>;
  expect(ext).toMatchObject({ p_origem: 'externa', p_classificacao: 'aporte_socio', p_contraparte: 'Ana Souza', p_id_conta_origem: null, p_valor: '5000.00' });
  expect(ext.p_id).not.toBe(chave1);
  await ctx.close();
});

test('sem caixa cadastrado o depósito em espécie explica a limitação e não envia', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const reg = await sessaoSimulada(ctx, rotas(CONTAS.filter((c) => c.tipo !== 'caixa')));
  const page = await ctx.newPage();
  await abrir(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'Depositar' }).click();
  const d = dialogo(page);
  await d.getByLabel('Valor (R$)').fill('1000');
  await d.getByLabel('Dinheiro em espécie / caixa').check();
  await expect(d.getByText(/Não há caixa cadastrado/)).toBeVisible();
  await d.getByRole('button', { name: 'Confirmar depósito' }).click();
  await expect(d.getByRole('alert').last()).toContainText('Caixa físico');
  expect(reg.chamadas.filter((x) => x.caminho === 'rpc/registrar_deposito')).toHaveLength(0);
  await ctx.close();
});
