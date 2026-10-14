import { test, expect, type Page } from '@playwright/test';
import { sessaoSimulada, type Rotas } from './apoio/sessao-simulada';

// E2 — classificação financeira (interface), com a API do Supabase SIMULADA: não acessa o banco.
// As regras de banco (saldo, indicadores, concorrência, estorno, isolamento) estão em tests/sql/classificacao-financeira.mjs.

const BASE = 'http://localhost:3000';
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const EMPRESA = { id: 'aaaaaaaa-0000-4000-8000-000000000001', razao_social: 'ALFA LTDA', nome_comercial: 'Alfa', cnpj: '12345678000190', tipo_empresa: 'comum' };
const CATEGORIAS = [
  { id: 'c-rec', tipo: 'receita', nome: 'Vendas', cor: '#16a34a', icone: 'tag', ativa: true },
  { id: 'c-desp', tipo: 'despesa', nome: 'Pessoal', cor: '#8b5cf6', icone: 'users', ativa: true },
];
const RESUMO = {
  periodo_inicio: `${hoje.slice(0, 7)}-01`, periodo_fim: hoje, receitas_mes: 3000, despesas_mes: 700, receitas_mes_anterior: 0, despesas_mes_anterior: 0,
  pagamentos_financiamentos_mes: 5500, juros_financiamentos_mes: 500, saldo_acumulado: 10300, qtd_contas: 1,
  a_pagar_30_valor: 0, a_pagar_30_qtd: 0, a_pagar_vencidas_qtd: 0, a_receber_vencidas_qtd: 0, a_receber_30_valor: 0, a_receber_30_qtd: 0, tem_lancamentos: true,
  pro_labore_mes: 800, distribuicoes_lucros_mes: 1200, aportes_socios_mes: 5000, entradas_financiamentos_mes: 10000, amortizacao_financiamentos_mes: 5000,
  transferencias_mes: 400, entradas_caixa_mes: 18000, saidas_caixa_mes: 8200,
  serie: Array.from({ length: 6 }, (_, i) => ({ mes: `${hoje.slice(0, 7)}-01`, receitas: i === 5 ? 18000 : 0, despesas: i === 5 ? 8200 : 0, receitas_operacionais: i === 5 ? 3000 : 0, despesas_operacionais: i === 5 ? 700 : 0 })),
  despesas_por_categoria: [],
};
const LANC = (descricao: string, tipo: string, natureza: string) => ({
  id: descricao, id_empresa: EMPRESA.id, tipo, descricao, valor: 800, id_categoria: tipo === 'receita' ? 'c-rec' : 'c-desp', categoria_nome: 'Pessoal', categoria_cor: '#8b5cf6',
  categoria_icone: 'users', data_competencia: hoje, data_vencimento: hoje, data_pagamento: hoje, status: 'pago', situacao: 'pago', contraparte: 'Sócio A',
  observacoes: null, qtd_anexos: 0, id_conta_financeira: 'cta', conta_nome: 'Banco', natureza_financeira: natureza, id_contrato: null, numero_parcela: null, valor_juros: null,
});

function rotasBase(extra?: Rotas): Rotas {
  return (caminho, url, req) => {
    const e = extra?.(caminho, url, req);
    if (e) return e;
    if (caminho === 'perfis') return { corpo: [{ nome_completo: 'Ana Souza', tipo_usuario: 'empresa', funcao_global: 'user' }] };
    if (caminho === 'usuarios_empresas') return { corpo: [{ empresas: EMPRESA }] };
    if (caminho === 'categorias_financeiras') return { corpo: CATEGORIAS };
    if (caminho === 'contas_financeiras_saldo') return { corpo: [{ id: 'cta', nome: 'Banco', instituicao: 'Banco', tipo: 'conta_corrente', saldo_inicial: 1000, data_saldo_inicial: hoje, principal: true, permite_saldo_negativo: false, arquivada_em: null, saldo: 10300, cor: '#f97316' }] };
    if (caminho === 'rpc/resumo_financeiro') return { corpo: RESUMO };
    if (caminho === 'lancamentos_financeiros_situacao') {
      const lista = [LANC('Pró-labore Ana', 'despesa', 'pro_labore'), LANC('Aporte do João', 'receita', 'aporte_socio'), LANC('Conta de luz', 'despesa', 'operacional')];
      return { corpo: lista, total: lista.length };
    }
    return undefined;
  };
}

async function abrir(page: Page, hash: string) {
  await page.goto(`${BASE}/app/financeiro#${hash}`);
  await expect(page.getByRole('heading', { name: 'Financeiro', exact: true })).toBeVisible({ timeout: 90000 });
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

test('Visão geral separa o operacional das outras movimentações', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotasBase());
  const page = await ctx.newPage();
  await abrir(page, 'visao');
  const outras = page.getByRole('region', { name: 'Outras movimentações do mês' });
  await expect(outras).toBeVisible({ timeout: 30000 });
  const t = async (id: string) => ((await outras.getByTestId(`outras-${id}`).textContent()) ?? '').replace(/ /g, ' ');
  expect(await t('pro-labore')).toContain('− R$ 800,00');
  expect(await t('distribuicoes')).toContain('− R$ 1.200,00');
  expect(await t('aportes')).toContain('+ R$ 5.000,00');
  expect(await t('entradas-emprestimos')).toContain('+ R$ 10.000,00');
  expect(await t('amortizacao')).toContain('R$ 5.000,00');
  expect(await t('juros')).toContain('R$ 500,00');
  expect(await t('transferencias')).toContain('R$ 400,00');
  // Receitas do mês = só operacional (o aporte de 5.000 e o empréstimo de 10.000 não entram)
  expect(((await page.getByRole('region', { name: 'Receitas do mês', exact: true }).textContent()) ?? '').replace(/ /g, ' ')).toContain('R$ 3.000,00');
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('lista mostra a classificação; formulário exige o sócio e envia a classificação certa', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const registro = await sessaoSimulada(ctx, rotasBase((caminho) => (caminho === 'rpc/salvar_lancamento_financeiro' ? { corpo: 'novo-id' } : undefined)));
  const page = await ctx.newPage();
  await abrir(page, 'lancamentos');
  await expect(page.getByTestId('natureza-Pró-labore Ana')).toHaveText('Pró-labore', { timeout: 30000 });
  await expect(page.getByTestId('natureza-Aporte do João')).toHaveText('Aporte de sócio');
  await expect(page.getByTestId('natureza-Conta de luz')).toHaveCount(0);

  // Despesa classificada como pró-labore: sócio obrigatório; envia p_natureza
  await page.getByRole('button', { name: 'Novo lançamento' }).click();
  await page.getByRole('menuitem', { name: 'Despesa' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Classificação').selectOption('pro_labore');
  await expect(d.getByTestId('ajuda-natureza')).toContainText('sócios administradores');
  await d.getByLabel('Descrição').fill('Pró-labore de outubro');
  await d.getByLabel('Valor (R$)').fill('300000');
  await d.getByLabel('Categoria').selectOption('c-desp');
  await d.getByRole('button', { name: 'Salvar lançamento' }).click();
  await expect(d.getByRole('alert')).toContainText('Informe o sócio');
  await d.getByLabel(/^Sócio/).fill('Ana Souza');
  await d.getByRole('button', { name: 'Salvar lançamento' }).click();
  await expect(page.getByText('Despesa lançada.')).toBeVisible({ timeout: 15000 });
  const envio = registro.chamadas.filter((c) => c.caminho === 'rpc/salvar_lancamento_financeiro').at(-1)!.corpo as Record<string, unknown>;
  expect({ natureza: envio.p_natureza, socio: envio.p_contraparte, tipo: envio.p_tipo, valor: envio.p_valor }).toEqual({ natureza: 'pro_labore', socio: 'Ana Souza', tipo: 'despesa', valor: '3000.00' });

  // Receita operacional: não envia p_natureza (compatível com o banco antes da 000031)
  await page.getByRole('button', { name: 'Novo lançamento' }).click();
  await page.getByRole('menuitem', { name: 'Receita' }).click();
  await d.getByLabel('Descrição').fill('Venda');
  await d.getByLabel('Valor (R$)').fill('10000');
  await d.getByLabel('Categoria').selectOption('c-rec');
  await d.getByRole('button', { name: 'Salvar lançamento' }).click();
  await expect(page.getByText('Receita lançada.')).toBeVisible({ timeout: 15000 });
  const envio2 = registro.chamadas.filter((c) => c.caminho === 'rpc/salvar_lancamento_financeiro').at(-1)!.corpo as Record<string, unknown>;
  expect('p_natureza' in envio2).toBe(false);
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('sem a migration 000031: classificação não operacional mostra aviso claro', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(ctx, rotasBase((caminho) => (caminho === 'rpc/salvar_lancamento_financeiro' ? { status: 404, corpo: { code: 'PGRST202', message: 'Could not find the function' } } : undefined)));
  const page = await ctx.newPage();
  await abrir(page, 'lancamentos');
  await page.getByRole('button', { name: 'Novo lançamento' }).click();
  await page.getByRole('menuitem', { name: 'Receita' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Classificação').selectOption('aporte_socio');
  await d.getByLabel('Descrição').fill('Aporte');
  await d.getByLabel('Valor (R$)').fill('100000');
  await d.getByLabel('Categoria').selectOption('c-rec');
  await d.getByLabel(/^Sócio que aportou/).fill('João');
  await d.getByRole('button', { name: 'Salvar lançamento' }).click();
  await expect(d.getByRole('alert')).toContainText('classificação financeira será liberada');
  await ctx.close();
});

test('Visão geral e formulário sem rolagem lateral de 320 a 1920px', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await sessaoSimulada(ctx, rotasBase());
  const page = await ctx.newPage();
  await abrir(page, 'visao');
  await expect(page.getByRole('region', { name: 'Outras movimentações do mês' })).toBeVisible({ timeout: 30000 });
  for (const largura of [320, 375, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `visão geral @${largura}`).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByRole('button', { name: 'Novo lançamento' }).click();
  await page.getByRole('menuitem', { name: 'Despesa' }).click();
  await page.getByRole('dialog').getByLabel('Classificação').selectOption('distribuicao_lucros');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'formulário @320').toBeLessThanOrEqual(1);
  await ctx.close();
});
