import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { sessaoSimulada, type Rotas } from './apoio/sessao-simulada';

// E5 — Saúde Empresarial com a API do Supabase SIMULADA: não acessa o banco.
// Cálculos, índice, regras, isolamento e permissões são testados no banco local em tests/sql/saude-empresarial.mjs.
// Aqui: exibição fiel dos números calculados, estados (carregando, sem dados, insuficiente, erro, sem acesso), links e layout.

const BASE = 'http://localhost:3000';
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const dia = (d: number) => new Date(Date.parse(`${hoje}T12:00:00Z`) + d * 86400000).toISOString().slice(0, 10);
const mes = (k: number) => { const d = new Date(Date.UTC(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 1 - k, 1)); return d.toISOString().slice(0, 10); };
const EMPRESA = { id: 'aaaaaaaa-0000-4000-8000-000000000001', razao_social: 'EMPRESA EXEMPLO LTDA', nome_comercial: 'Empresa Exemplo', cnpj: '12345678000190', tipo_empresa: 'comum' };
const CAT_PESSOAL = 'dddddddd-0000-4000-8000-000000000001';

// Coerente com a metodologia saude-v1: margem 32,8% → 100; cobertura 8,31 → 100; regularidade 95; evolução 12−8=4 p.p. → 60;
// inadimplência 2,4% → 97,8. Índice = (3000 + 2500 + 1900 + 900 + 978) ÷ 100 = 92,78 → 93 (Boa).
const SAUDE = {
  metodologia: 'saude-v1', hoje, meses: 6, periodo_inicio: dia(-182), periodo_fim: hoje, periodo_anterior_inicio: dia(-365), periodo_anterior_fim: dia(-183),
  tem_lancamentos: true,
  receita_operacional: 48320, receita_operacional_anterior: 43142.86, variacao_receita: 12,
  despesa_operacional: 32450, despesa_operacional_anterior: 30046.3, variacao_despesa: 8,
  resultado_operacional: 15870, resultado_operacional_anterior: 13096.56, variacao_resultado: 21.2,
  lancamentos_operacionais: 40, saldo_registrado: 42560, qtd_contas: 2,
  obrigacoes: { vencidas_valor: 900, vencidas_qtd: 1, a_vencer_valor: 4220, a_vencer_qtd: 4, total: 5120 },
  indicadores: { margem: 32.8, cobertura: 8.31, comprometimento: 67.2, inadimplencia: 2.4, inadimplencia_base: 50000, inadimplencia_aberto: 1200,
    prazo_medio_recebimento: 28, prazo_medio_base: 30, regularidade: 95, regularidade_base: 20 },
  indice: { valor: 93, faixa: 'boa', cobertura_pesos: 100, insuficiencias: [], componentes: [
    { codigo: 'margem', peso: 30, valor: 32.8, pontos: 100, aplicavel: true, motivo: null },
    { codigo: 'cobertura', peso: 25, valor: 8.31, pontos: 100, aplicavel: true, motivo: null },
    { codigo: 'regularidade', peso: 20, valor: 95, pontos: 95, aplicavel: true, motivo: null, base: 20, em_dia: 19 },
    { codigo: 'evolucao', peso: 15, valor: 4, pontos: 60, aplicavel: true, motivo: null },
    { codigo: 'inadimplencia', peso: 10, valor: 2.4, pontos: 97.8, aplicavel: true, motivo: null },
  ] },
  recomendacoes: [
    { codigo: 'contas_vencidas', severidade: 'alta', dados: { qtd: 1, valor: 900, qtd_30_dias_atras: 0, aumentou: true } },
    { codigo: 'concentracao_despesas', severidade: 'media', dados: { categoria: 'Pessoal', percentual: 52.4, valor: 17000 } },
  ],
  despesas_por_categoria: [
    { id_categoria: CAT_PESSOAL, categoria: 'Pessoal', cor: '#3b82f6', icone: 'users', valor: 17000, qtd: 6, percentual: 52.4 },
    { id_categoria: 'dddddddd-0000-4000-8000-000000000002', categoria: 'Fornecedores', cor: '#ef4444', icone: 'tag', valor: 9000, qtd: 9, percentual: 27.7 },
    { id_categoria: 'dddddddd-0000-4000-8000-000000000003', categoria: 'Aluguel', cor: '#f59e0b', icone: 'home', valor: 6450, qtd: 3, percentual: 19.9 },
  ],
  serie_operacional: [5, 4, 3, 2, 1, 0].map((k, i) => ({ mes: mes(k), receitas: 0, despesas: 0, receitas_operacionais: i === 1 ? 0 : 7000 + i * 500, despesas_operacionais: i === 1 ? 0 : 5000 + i * 300 })),
  fluxo_caixa: [5, 4, 3, 2, 1, 0].map((k, i) => ({ mes: mes(k), parcial: k === 0, saldo_final: i === 0 ? null : 30000 + i * 2500, entradas: i === 0 ? 0 : 9000, saidas: i === 0 ? 0 : 6500,
    entradas_nao_operacionais: i === 2 ? 5000 : 0, saidas_nao_operacionais: i === 3 ? 1500 : 0 })),
  contas_a_vencer: [
    { id: 'l0', descricao: 'Fornecedor Alfa', valor: 900, data_vencimento: dia(-3), dias: -3, natureza: 'operacional', categoria: 'Fornecedores' },
    { id: 'l1', descricao: 'DAS Simples Nacional', valor: 1320, data_vencimento: dia(5), dias: 5, natureza: 'operacional', categoria: 'Impostos' },
    { id: 'l2', descricao: 'Conta de energia', valor: 580, data_vencimento: dia(13), dias: 13, natureza: 'operacional', categoria: 'Serviços' },
    { id: 'l3', descricao: 'Aluguel da sede', valor: 2000, data_vencimento: dia(15), dias: 15, natureza: 'operacional', categoria: 'Aluguel' },
    { id: 'l4', descricao: 'Plano de internet', valor: 320, data_vencimento: dia(21), dias: 21, natureza: 'operacional', categoria: 'Serviços' },
  ],
};
const INSUFICIENTE = {
  ...SAUDE,
  receita_operacional: 500, receita_operacional_anterior: 0, variacao_receita: null, despesa_operacional: 0, despesa_operacional_anterior: 0, variacao_despesa: null,
  resultado_operacional: 500, variacao_resultado: null, lancamentos_operacionais: 2, saldo_registrado: null, qtd_contas: 0,
  obrigacoes: { vencidas_valor: 0, vencidas_qtd: 0, a_vencer_valor: 0, a_vencer_qtd: 0, total: 0 },
  indicadores: { margem: 100, cobertura: null, comprometimento: 0, inadimplencia: null, inadimplencia_base: 0, inadimplencia_aberto: 0,
    prazo_medio_recebimento: null, prazo_medio_base: 2, regularidade: null, regularidade_base: 0 },
  indice: { valor: null, faixa: null, cobertura_pesos: 30, insuficiencias: ['poucos_lancamentos', 'cobertura_baixa'], componentes: [
    { codigo: 'margem', peso: 30, valor: 100, pontos: 100, aplicavel: true, motivo: null },
    { codigo: 'cobertura', peso: 25, valor: null, pontos: null, aplicavel: false, motivo: 'sem_contas' },
    { codigo: 'regularidade', peso: 20, valor: null, pontos: null, aplicavel: false, motivo: 'poucas_contas_vencidas' },
    { codigo: 'evolucao', peso: 15, valor: null, pontos: null, aplicavel: false, motivo: 'sem_periodo_anterior' },
    { codigo: 'inadimplencia', peso: 10, valor: null, pontos: null, aplicavel: false, motivo: 'sem_recebiveis_vencidos' },
  ] },
  recomendacoes: [
    { codigo: 'sem_contas', severidade: 'info', dados: {} },
    { codigo: 'dados_insuficientes', severidade: 'info', dados: { motivos: ['poucos_lancamentos', 'cobertura_baixa'], lancamentos: 2 } },
  ],
  despesas_por_categoria: [], contas_a_vencer: [],
  fluxo_caixa: SAUDE.fluxo_caixa.map((m) => ({ ...m, saldo_final: null, entradas: 0, saidas: 0, entradas_nao_operacionais: 0, saidas_nao_operacionais: 0 })),
};
const PAINEL = [
  { id_empresa: EMPRESA.id, nome: 'Empresa Exemplo', cnpj: '12345678000190', permissoes: ['ver_documentos', 'ver_financeiro'], solicitacoes_aguardando_analise: 0,
    solicitacoes_aguardando_empresa: 0, obrigacoes_abertas: null, obrigacoes_atrasadas: null, obrigacoes_7_dias: null, itens_concluidos: 0 },
  { id_empresa: 'bbbbbbbb-0000-4000-8000-000000000002', nome: 'Comércio Alfa', cnpj: '98765432000111', permissoes: ['ver_documentos'], solicitacoes_aguardando_analise: 0,
    solicitacoes_aguardando_empresa: 0, obrigacoes_abertas: null, obrigacoes_atrasadas: null, obrigacoes_7_dias: null, itens_concluidos: 0 },
];

function rotas(papel: 'empresa' | 'contador', saude: Rotas | unknown = SAUDE): Rotas {
  return (caminho, url, req) => {
    if (caminho === 'rpc/saude_empresarial') return typeof saude === 'function' ? (saude as Rotas)(caminho, url, req) : { corpo: saude };
    if (caminho === 'perfis') return { corpo: [{ nome_completo: papel === 'empresa' ? 'Ana Souza' : 'João da Silva', tipo_usuario: papel, funcao_global: 'user' }] };
    if (caminho === 'usuarios_empresas') return { corpo: [{ empresas: EMPRESA }] };
    if (caminho === 'rpc/painel_contador') return { corpo: PAINEL };
    if (caminho === 'empresas') return { corpo: [] };
    return undefined;
  };
}
async function abrir(ctx: BrowserContext, caminho: string, titulo: string | RegExp): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`${BASE}${caminho}`);
  await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible({ timeout: 90000 });
  return page;
}
const texto = async (page: Page, nome: string) => ((await page.getByRole('region', { name: nome, exact: true }).textContent()) ?? '').replace(/ /g, ' ');

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

test('empresário: indicadores, gráficos, índice, recomendações, contas a vencer e metodologia', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas('empresa'));
  const page = await abrir(ctx, '/app/saude-empresarial', 'Saúde Empresarial');
  await expect(page.getByText('Acompanhe a saúde financeira da sua empresa e tome decisões com mais segurança.')).toBeVisible();
  // Item no menu
  await expect(page.getByRole('navigation', { name: 'Módulos do departamento' }).getByRole('link', { name: 'Saúde Empresarial' })).toHaveAttribute('href', '/app/saude-empresarial');
  // Cards principais
  await expect.poll(() => texto(page, 'Receita operacional')).toContain('R$ 48.320,00');
  expect(await texto(page, 'Receita operacional')).toContain('12% vs. período anterior');
  expect(await texto(page, 'Despesa operacional')).toContain('R$ 32.450,00');
  expect(await texto(page, 'Resultado operacional de caixa')).toContain('não é lucro contábil');
  expect(await texto(page, 'Saldo registrado')).toContain('R$ 42.560,00');
  expect(await texto(page, 'Saldo registrado')).toContain('não é saldo bancário confirmado');
  // Índice
  const indice = await texto(page, 'Índice de Saúde Empresarial');
  expect(indice).toContain('928'); // (3000+2500+1900+900+978)÷100 = 92,78 → escala 0–1000 = 928
  expect(indice).toContain('de 1000');
  expect(indice).toContain('Boa');
  expect(indice).toContain('100% dos pesos com dados');
  expect(indice).toContain('Não é score de crédito');
  // Indicadores complementares
  await expect(page.getByTestId('indicador-Margem operacional de caixa')).toContainText('32,8%');
  await expect(page.getByTestId('indicador-Margem operacional de caixa')).toContainText('Favorável');
  await expect(page.getByTestId('indicador-Cobertura de obrigações (30 dias)')).toContainText('8,31×');
  await expect(page.getByTestId('indicador-Prazo médio de recebimento')).toContainText('28 dias');
  // Recomendações com os números calculados
  await expect(page.getByTestId('recomendacao-concentracao_despesas')).toContainText('“Pessoal” representa 52,4% das despesas operacionais');
  await expect(page.getByTestId('recomendacao-contas_vencidas')).toContainText('Aumento de contas vencidas');
  await page.getByTestId('recomendacao-contas_vencidas').locator('summary').click();
  await expect(page.getByTestId('recomendacao-contas_vencidas')).toContainText('O que fazer:');
  // Contas a vencer: vencidas separadas; "Ver todas" vai para o Financeiro existente
  await expect(page.getByTestId('contas-vencidas')).toContainText('Fornecedor Alfa');
  await expect(page.getByTestId('contas-vencidas')).not.toContainText('DAS Simples Nacional');
  const contas = page.getByRole('region', { name: 'Contas a vencer' });
  await expect(contas.getByRole('link', { name: 'Ver todas' })).toHaveAttribute('href', '/app/financeiro#pagar');
  await expect(contas).toContainText('DAS Simples Nacional');
  // Composição: link para os lançamentos da categoria
  await expect(page.getByRole('region', { name: 'Composição das despesas' }).getByRole('link', { name: 'Pessoal' })).toHaveAttribute('href', `/app/financeiro?categoria=${CAT_PESSOAL}#lancamentos`);
  // Metodologia explícita
  await page.getByText('Como o índice é calculado (saude-v1)').click();
  await expect(page.getByTestId('componente-evolucao')).toContainText('+4 p.p.');
  await expect(page.getByTestId('componente-evolucao')).toContainText('60');
  await expect(page.getByTestId('componente-inadimplencia')).toContainText('97,8');
  // Troca de período chama o banco com o novo período
  await page.getByLabel('Período analisado').selectOption('3');
  await expect.poll(() => registro.chamadas.filter((c) => c.caminho === 'rpc/saude_empresarial').some((c) => (c.corpo as { p_meses: number }).p_meses === 3)).toBe(true);
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('dados insuficientes: sem nota, motivos explicados e indicadores indisponíveis', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(ctx, rotas('empresa', INSUFICIENTE));
  const page = await abrir(ctx, '/app/saude-empresarial', 'Saúde Empresarial');
  await expect(page.getByTestId('indice-insuficiente')).toHaveText('Dados insuficientes para calcular a saúde empresarial.', { timeout: 15000 });
  expect(await texto(page, 'Índice de Saúde Empresarial')).toContain('30% dos pesos com dados');
  await expect(page.getByTestId('faixa-indice')).toHaveCount(0);
  expect(await texto(page, 'Saldo registrado')).toContain('Sem contas');
  await expect(page.getByTestId('indicador-Prazo médio de recebimento')).toContainText('Dados insuficientes');
  await expect(page.getByTestId('indicador-Cobertura de obrigações (30 dias)')).toContainText('Sem contas cadastradas');
  await expect(page.getByTestId('recomendacao-dados_insuficientes')).toContainText('há 2 lançamentos operacionais liquidados (mínimo de 5)');
  expect(await texto(page, 'Receita operacional')).toContain('Sem base no período anterior');
  await ctx.close();
});

test('falha de consulta não vira R$ 0,00; sem permissão mostra acesso negado; atualiza ao voltar', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(ctx, rotas('empresa', () => ({ status: 500, corpo: { message: 'falha', code: 'XX000' } })));
  const page = await abrir(ctx, '/app/saude-empresarial', 'Saúde Empresarial');
  await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível calcular os indicadores agora' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('R$ 0,00')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Receita operacional' })).toHaveCount(0);
  await ctx.close();

  // Função ausente no banco (migration 034 pendente): aviso de indisponibilidade, não "tente novamente" e nenhum valor
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(ctxA, rotas('empresa', () => ({ status: 404, corpo: { code: 'PGRST202', message: 'Could not find the function public.saude_empresarial(p_id_empresa, p_meses) in the schema cache' } })));
  const pA = await abrir(ctxA, '/app/saude-empresarial', 'Saúde Empresarial');
  await expect(pA.getByTestId('saude-indisponivel')).toContainText('falta aplicar uma atualização do banco', { timeout: 15000 });
  await expect(pA.getByRole('button', { name: 'Tentar novamente' })).toHaveCount(0);
  await expect(pA.getByText('R$')).toHaveCount(0);
  await ctxA.close();

  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(ctx2, rotas('empresa', () => ({ status: 403, corpo: { message: 'Sem permissão', code: '42501' } })));
  const p2 = await abrir(ctx2, '/app/saude-empresarial', 'Saúde Empresarial');
  await expect(p2.getByText('Você não tem acesso à saúde financeira desta empresa.')).toBeVisible({ timeout: 15000 });
  await ctx2.close();

  const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const registro = await sessaoSimulada(ctx3, rotas('empresa'));
  const p3 = await abrir(ctx3, '/app/saude-empresarial', 'Saúde Empresarial');
  await expect.poll(() => texto(p3, 'Receita operacional')).toContain('R$ 48.320,00');
  const antes = registro.chamadas.filter((c) => c.caminho === 'rpc/saude_empresarial').length;
  await p3.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => registro.chamadas.filter((c) => c.caminho === 'rpc/saude_empresarial').length).toBeGreaterThan(antes);
  expect(await texto(p3, 'Receita operacional')).toContain('R$ 48.320,00'); // atualização silenciosa mantém os números
  await ctx3.close();
});

test('contador: aba Saúde Empresarial só com "Ver financeiro", somente leitura', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await sessaoSimulada(ctx, rotas('contador'));
  const page = await abrir(ctx, `/contador/empresas/${EMPRESA.id}`, 'Empresa Exemplo');
  const abas = page.getByRole('navigation', { name: 'Espaço da empresa' });
  await abas.getByRole('link', { name: 'Saúde Empresarial', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Saúde Empresarial', exact: true })).toBeVisible();
  await expect.poll(() => texto(page, 'Índice de Saúde Empresarial')).toContain('928');
  // Sem links de edição do Financeiro da empresa
  await expect(page.getByRole('region', { name: 'Contas a vencer' }).getByRole('link', { name: 'Ver todas' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Composição das despesas' }).getByRole('link')).toHaveCount(0);
  const alfa = await abrir(ctx, '/contador/empresas/bbbbbbbb-0000-4000-8000-000000000002', 'Comércio Alfa');
  await expect(alfa.getByRole('navigation', { name: 'Espaço da empresa' }).getByRole('link', { name: 'Saúde Empresarial', exact: true })).toHaveCount(0);
  await ctx.close();
});

test('Financeiro abre a lista filtrada pela categoria vinda da Saúde Empresarial', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const filtros: string[] = [];
  await sessaoSimulada(ctx, rotas('empresa'));
  // Rota registrada depois tem prioridade: captura o filtro da lista de lançamentos
  await ctx.route('**/rest/v1/lancamentos_financeiros_situacao**', async (route) => {
    filtros.push(new URL(route.request().url()).searchParams.get('id_categoria') ?? '');
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' });
  });
  const page = await abrir(ctx, `/app/financeiro?categoria=${CAT_PESSOAL}#lancamentos`, 'Financeiro');
  await expect.poll(() => filtros.some((f) => f === `eq.${CAT_PESSOAL}`), { timeout: 15000 }).toBe(true);
  await expect(page.getByRole('button', { name: 'Lançamentos', exact: true })).toHaveAttribute('aria-current', 'page');
  await ctx.close();
});

test('layout sem rolagem lateral de 320 a 1920px (empresário e contador)', async ({ browser }) => {
  for (const [papel, caminho, titulo] of [['empresa', '/app/saude-empresarial', 'Saúde Empresarial'], ['contador', `/contador/empresas/${EMPRESA.id}#saude`, 'Empresa Exemplo']] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await sessaoSimulada(ctx, rotas(papel));
    const page = await abrir(ctx, caminho, titulo);
    await expect(page.getByRole('region', { name: 'Índice de Saúde Empresarial' })).toBeVisible({ timeout: 15000 });
    for (const largura of [320, 375, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.waitForTimeout(250);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${caminho} @${largura}`).toBeLessThanOrEqual(1);
    }
    await ctx.close();
  }
});
