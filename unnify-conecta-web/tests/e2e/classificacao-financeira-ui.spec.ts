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

test('nova categoria dentro do lançamento: cria sem fechar o formulário, seleciona, valida e mostra erro do banco', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let recusar = false;
  const registro = await sessaoSimulada(ctx, rotasBase((caminho) => {
    if (caminho === 'rpc/salvar_categoria_financeira') return recusar ? { status: 409, corpo: { code: '23505', message: 'Já existe uma categoria com este nome.' } } : { corpo: 'cat-nova' };
    if (caminho === 'rpc/salvar_lancamento_financeiro') return { corpo: 'novo-id' };
  }));
  const page = await ctx.newPage();
  await abrir(page, 'lancamentos');
  await page.getByRole('button', { name: 'Novo lançamento' }).click();
  await page.getByRole('menuitem', { name: 'Receita' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Descrição').fill('Serviço de internet');
  await d.getByRole('button', { name: '+ Nova categoria' }).click();
  // validação local e Esc fecha só o mini-formulário (o lançamento continua aberto)
  await d.getByRole('button', { name: 'Criar categoria' }).click();
  await expect(d.getByRole('alert')).toHaveText('Informe o nome (2 a 60 caracteres).');
  await page.keyboard.press('Escape');
  await expect(d.getByTestId('nova-categoria')).toHaveCount(0);
  await expect(d.getByLabel('Descrição')).toHaveValue('Serviço de internet');
  // cria: vai para o banco com o tipo certo, entra na lista e já fica selecionada
  await d.getByRole('button', { name: '+ Nova categoria' }).click();
  await d.getByLabel(/^Nome da nova categoria/).fill('  Internet  ');
  await d.getByTestId('nova-categoria').getByRole('button', { name: 'Ícone Internet' }).click();
  await d.getByRole('button', { name: 'Criar categoria' }).click();
  await expect(d.getByTestId('categoria-escolhida')).toContainText('Internet');
  await expect(d.getByLabel('Categoria', { exact: true })).toHaveValue('cat-nova');
  await expect(d.getByTestId('nova-categoria')).toHaveCount(0);
  const env = registro.chamadas.filter((c) => c.caminho === 'rpc/salvar_categoria_financeira').at(-1)!.corpo as Record<string, unknown>;
  expect(env).toMatchObject({ p_id: null, p_id_empresa: EMPRESA.id, p_tipo: 'receita', p_nome: 'Internet', p_icone: 'wifi' });
  expect(String(env.p_cor)).toMatch(/^#[0-9a-fA-F]{6}$/);
  // erro do banco (nome repetido) aparece no mini-formulário e nada é selecionado
  recusar = true;
  await d.getByRole('button', { name: '+ Nova categoria' }).click();
  await d.getByLabel(/^Nome da nova categoria/).fill('Vendas');
  await d.getByRole('button', { name: 'Criar categoria' }).click();
  await expect(d.getByTestId('nova-categoria').getByRole('alert')).toContainText('Já existe uma categoria com este nome.');
  await d.getByTestId('nova-categoria').getByRole('button', { name: 'Cancelar' }).click();
  // trocar para Despesa descarta a categoria criada como receita da lista; o lançamento salva com a categoria criada
  await d.getByLabel('Valor (R$)').fill('63400');
  await d.getByRole('button', { name: 'Salvar lançamento' }).click();
  await expect.poll(() => registro.chamadas.filter((c) => c.caminho === 'rpc/salvar_lancamento_financeiro').length).toBeGreaterThan(0);
  expect(registro.chamadas.filter((c) => c.caminho === 'rpc/salvar_lancamento_financeiro').at(-1)!.corpo).toMatchObject({ p_id_categoria: 'cat-nova' });
  await ctx.close();
});

test('Contas a receber ordena pelas últimas criadas; as outras abas mantêm a ordem', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ordens: Record<string, string[]> = {};
  let aba = '';
  await sessaoSimulada(ctx, rotasBase((caminho, url) => {
    if (caminho === 'lancamentos_financeiros_situacao') (ordens[aba] ??= []).push(url.searchParams.get('order') ?? '');
    return undefined;
  }));
  const page = await ctx.newPage();
  aba = 'receber';
  await abrir(page, 'receber');
  await expect.poll(() => ordens.receber?.length ?? 0).toBeGreaterThan(0);
  expect(ordens.receber.at(-1)).toBe('criado_em.desc,id.desc');
  aba = 'pagar';
  await page.getByRole('button', { name: 'Contas a pagar' }).click();
  await expect.poll(() => ordens.pagar?.length ?? 0).toBeGreaterThan(0);
  expect(ordens.pagar.at(-1)).toBe('data_vencimento.asc.nullslast');
  aba = 'lancamentos';
  await page.getByRole('button', { name: 'Lançamentos', exact: true }).click();
  await expect.poll(() => ordens.lancamentos?.length ?? 0).toBeGreaterThan(0);
  expect(ordens.lancamentos.at(-1)).toBe('data_competencia.desc,criado_em.desc');
  await ctx.close();
});

test('Contas a receber mostra o total de TODAS as contas dos filtros (não só da página)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pedidos: { select: string; range: string; situacao: string }[] = [];
  await sessaoSimulada(ctx, rotasBase((caminho, url) => {
    if (caminho !== 'lancamentos_financeiros_situacao') return undefined;
    const select = url.searchParams.get('select') ?? '';
    const inicio = Number(url.searchParams.get('offset') ?? 0), limite = Number(url.searchParams.get('limit') ?? 0);
    pedidos.push({ select, range: `${inicio}-${inicio + limite - 1}`, situacao: url.searchParams.get('situacao') ?? '' });
    if (select === 'valor,tipo') {
      // 1.250 contas em aberto de R$ 0,10 (R$ 125,00) + 1 conta de R$ 0,03 num segundo lote: soma em centavos, sem erro de ponto flutuante
      const todas = url.searchParams.get('situacao')?.includes('pago') ? [{ valor: 999, tipo: 'receita' }] : [...Array.from({ length: 1250 }, () => ({ valor: 0.1, tipo: 'receita' })), { valor: 0.03, tipo: 'receita' }];
      const pedaco = todas.slice(inicio, inicio + limite);
      return { corpo: pedaco, total: todas.length };
    }
    return undefined;
  }));
  const page = await ctx.newPage();
  await abrir(page, 'receber');
  await expect(page.getByTestId('total-filtro')).toContainText('R$ 125,03', { timeout: 30000 });
  await expect(page.getByTestId('total-filtro')).toContainText('Total a receber');
  expect([...new Set(pedidos.filter((p) => p.select === 'valor,tipo').map((p) => p.range))]).toEqual(['0-999', '1000-1999']); // lotes de 1.000 até acabar
  await ctx.close();
});

test('Contas a pagar e Lançamentos mostram o total dos filtros (a pagar; receitas, despesas e saldo)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const somas: string[] = [];
  await sessaoSimulada(ctx, rotasBase((caminho, url) => {
    if (caminho !== 'lancamentos_financeiros_situacao' || url.searchParams.get('select') !== 'valor,tipo') return undefined;
    somas.push(url.searchParams.get('tipo') ?? 'sem-tipo');
    const tipoFiltrado = url.searchParams.get('tipo');
    const todos = [{ valor: 100.1, tipo: 'receita' }, { valor: 200.2, tipo: 'receita' }, { valor: 50.05, tipo: 'despesa' }];
    const lista = tipoFiltrado === 'eq.despesa' ? todos.filter((l) => l.tipo === 'despesa') : tipoFiltrado === 'eq.receita' ? todos.filter((l) => l.tipo === 'receita') : todos;
    return { corpo: lista, total: lista.length };
  }));
  const page = await ctx.newPage();
  await abrir(page, 'pagar');
  await expect(page.getByTestId('total-filtro')).toContainText('Total a pagar', { timeout: 30000 });
  await expect(page.getByTestId('total-filtro')).toContainText('R$ 50,05');
  await page.getByRole('button', { name: 'Lançamentos', exact: true }).click();
  const t = page.getByTestId('total-filtro');
  await expect(t).toContainText('Receitas: R$ 300,30', { timeout: 30000 });
  await expect(t).toContainText('Despesas: R$ 50,05');
  await expect(t).toContainText('Saldo: R$ 250,25');
  expect(somas).toContain('eq.despesa'); // Contas a pagar somou só despesas
  await ctx.close();
});

test('Gastos fixos mostra o total de TODOS os gastos dos filtros, em lotes', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const lotes: string[] = [];
  await sessaoSimulada(ctx, rotasBase((caminho, url) => {
    if (caminho === 'rpc/gerar_ocorrencias_gastos_fixos') return { status: 204 };
    if (caminho === 'rpc/resumo_gastos_fixos') return { corpo: { total_mes: 0, pago_mes: 0, pendente_mes: 0, atrasados: 0, ativos: 1, vencendo_7: 0 } };
    if (caminho === 'ocorrencias_gastos_fixos' || caminho === 'gastos_fixos') return { corpo: [] };
    if (caminho !== 'gastos_fixos_resumo') return undefined;
    if (url.searchParams.get('select') === 'valor') {
      const inicio = Number(url.searchParams.get('offset') ?? 0), limite = Number(url.searchParams.get('limit') ?? 0);
      lotes.push(`${inicio}-${inicio + limite - 1}`);
      const todos = [...Array.from({ length: 1000 }, () => ({ valor: 0.1 })), { valor: 1234.56 }];
      return { corpo: todos.slice(inicio, inicio + limite), total: todos.length };
    }
    return { corpo: [{ id: 'g1', contexto: 'empresa', id_empresa: EMPRESA.id, nome: 'Aluguel', valor: 1234.56, tipo_valor: 'fixo', situacao: 'ativo', recorrencia: 'mensal', categoria_nome: 'Aluguel', cor: '#8b5cf6', icone: 'tag' }], total: 1001 };
  }));
  const page = await ctx.newPage();
  await abrir(page, 'gastos-fixos');
  await expect(page.getByTestId('total-filtro')).toContainText('R$ 1.334,56', { timeout: 30000 }); // 1000 × 0,10 + 1.234,56
  await expect(page.getByTestId('total-filtro')).toContainText('Total dos gastos fixos');
  expect([...new Set(lotes)]).toEqual(['0-999', '1000-1999']);
  await ctx.close();
});
