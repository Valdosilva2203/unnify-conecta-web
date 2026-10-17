import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { SUPABASE, sessaoSimulada, type Rotas } from './apoio/sessao-simulada';
import { gerarParcelas } from '../../lib/impostos';

// Impostos e parcelamentos (contador e empresário) com a API do Supabase SIMULADA (não acessa banco nem storage).
// Regras de banco (Financeiro, situações, permissões, isolamento, storage) em tests/sql/impostos.mjs.
const BASE = 'http://localhost:3000';
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const EMPRESA = { id: 'aaaaaaaa-0000-4000-8000-000000000001', razao_social: 'EMPRESA EXEMPLO LTDA', nome_comercial: 'Empresa Exemplo', cnpj: '12345678000190', tipo_empresa: 'comum' };
const painel = (permissoes: string[]) => [{ id_empresa: EMPRESA.id, nome: 'Empresa Exemplo', cnpj: '12345678000190', permissoes, solicitacoes_aguardando_analise: 0,
  solicitacoes_aguardando_empresa: 0, obrigacoes_abertas: 0, obrigacoes_atrasadas: 0, obrigacoes_7_dias: 0, itens_concluidos: 0 }];
const imp = (id: string, nome: string, situacao: string, extra: Record<string, unknown> = {}) => ({ id, id_parcelamento: null, numero_parcela: null, tipo: 'das', nome, orgao: 'Receita Federal',
  competencia: `${hoje.slice(0, 7)}-01`, vencimento: hoje, valor: 1250, descricao: 'Guia da competência', situacao, data_pagamento: null, data_pagamento_informada: null,
  id_lancamento: `l-${id}`, guia_caminho: null, guia_nome: null, guia_tamanho: null, guia_enviada_em: null, comprovantes: 0, total: 3, ...extra });
const IMPOSTOS = [
  imp('11111111-1111-4111-8111-111111111111', 'DAS – Simples Nacional', 'pendente', { guia_caminho: `${EMPRESA.id}/11111111-1111-4111-8111-111111111111/guia-x.pdf`, guia_nome: 'DAS.pdf' }),
  imp('22222222-2222-4222-8222-222222222222', 'FGTS Digital', 'vencido', { tipo: 'fgts', orgao: 'Caixa', valor: 850 }),
  imp('33333333-3333-4333-8333-333333333333', 'ISSQN', 'pagamento_informado', { tipo: 'iss', orgao: 'Prefeitura', valor: 180, data_pagamento_informada: hoje }),
];
const PARC = [{ id: 'p1', tributo: 'PGFN – Dívida Ativa', orgao: 'PGFN', numero_acordo: 'ACORDO-1', valor_negociado: 4292.1, observacoes: null, situacao: 'em_andamento', parcelas: 3, pagas: 1, saldo: 1892.1, proximo_vencimento: hoje, atrasadas: 0, criado_em: hoje }];
const PARCELAS = [1, 2, 3].map((n) => imp(`4444444${n}-4444-4444-8444-444444444444`, `PGFN – Dívida Ativa — parcela ${n}/3`, n === 1 ? 'pago' : 'pendente',
  { id_parcelamento: 'p1', numero_parcela: n, tipo: 'parcelamento', competencia: null, valor: [2400, 945.45, 946.65][n - 1] }));
const CONTA = { id: 'k1', nome: 'Banco', instituicao: null, tipo: 'conta_corrente', saldo_inicial: 0, data_saldo_inicial: '2026-01-01', principal: true, permite_saldo_negativo: false, arquivada_em: null, saldo: 5000, cor: null };

function rotas(papel: 'contador' | 'empresa', permissoes = ['ver_documentos', 'gerenciar_impostos'], extra?: Rotas): Rotas {
  return (c, u, req) => {
    const e = extra?.(c, u, req);
    if (e) return e;
    if (c === 'perfis') return { corpo: [{ nome_completo: papel === 'contador' ? 'João da Silva' : 'Ana Souza', tipo_usuario: papel, funcao_global: 'user' }] };
    if (c === 'usuarios_empresas') return { corpo: [{ empresas: EMPRESA }] };
    if (c === 'rpc/painel_contador') return { corpo: painel(permissoes) };
    if (c === 'rpc/resumo_impostos') return { corpo: { a_pagar: 2280, qtd_a_pagar: 3, vencidos: 1, vencendo_7: 2, guias: 1, pagos_90: 4 } };
    if (c === 'rpc/buscar_impostos') { const o = (JSON.parse(req.postData() ?? '{}') as { p_origem: string }).p_origem; return { corpo: o === 'parcelas' ? PARCELAS : o === 'todos' ? [...IMPOSTOS, ...PARCELAS] : IMPOSTOS }; }
    if (c === 'rpc/listar_parcelamentos_tributarios') return { corpo: PARC };
    if (c === 'rpc/pode_gerenciar_financeiro') return { corpo: papel === 'empresa' };
    if (c === 'contas_financeiras_saldo') return { corpo: [CONTA] };
    if (c === 'arquivos_impostos') return { corpo: [] };
    if (c === 'historico_impostos') return { corpo: [{ acao: 'criado', dados: null, criado_em: `${hoje}T12:00:00Z` }] };
    if (c.startsWith('rpc/salvar_imposto') || c === 'rpc/salvar_parcelamento_tributario') return { corpo: '99999999-9999-4999-8999-999999999999' };
    if (['rpc/informar_pagamento_imposto', 'rpc/confirmar_pagamento_imposto', 'rpc/cancelar_imposto', 'rpc/registrar_arquivo_imposto'].includes(c)) return { status: 200, corpo: null };
    if (c === 'notificacoes') return { corpo: [] };
    return undefined;
  };
}
async function abrir(ctx: BrowserContext, caminho: string, titulo: string): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`${BASE}${caminho}`);
  await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible({ timeout: 90000 });
  return page;
}
const chamadas = (r: { chamadas: { caminho: string; corpo: unknown }[] }, c: string) => r.chamadas.filter((x) => x.caminho === c);
const texto = async (p: Page, nome: string) => ((await p.getByRole('region', { name: nome, exact: true }).textContent()) ?? '').replace(/ /g, ' ');

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

test('parcelas geradas sem pular mês e com centavos na última', () => {
  const p = gerarParcelas(100, 3, '2026-01-31');
  expect(p.map((x) => x.vencimento)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  expect(p.map((x) => x.valor)).toEqual([33.33, 33.33, 33.34]);
});

test('contador: aba só com a permissão "Gerenciar impostos", entre Obrigações e Financeiro; indicadores, filtros no servidor, detalhes e guia', async ({ browser }) => {
  const sem = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await sessaoSimulada(sem, rotas('contador', ['ver_documentos', 'gerenciar_obrigacoes', 'ver_financeiro']));
  const ps = await abrir(sem, `/contador/empresas/${EMPRESA.id}`, 'Empresa Exemplo');
  await expect(ps.getByRole('navigation', { name: 'Espaço da empresa' }).getByRole('link', { name: 'Obrigações' })).toBeVisible();
  await expect(ps.getByRole('navigation', { name: 'Espaço da empresa' }).getByRole('link', { name: 'Impostos' })).toHaveCount(0);
  await sem.close();

  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas('contador', ['gerenciar_obrigacoes', 'gerenciar_impostos', 'ver_financeiro']));
  const page = await abrir(ctx, `/contador/empresas/${EMPRESA.id}#impostos`, 'Empresa Exemplo');
  const abas = await page.getByRole('navigation', { name: 'Espaço da empresa' }).getByRole('link').allTextContents();
  expect(abas.indexOf('Impostos')).toBe(abas.indexOf('Obrigações') + 1);
  expect(abas.indexOf('Financeiro')).toBe(abas.indexOf('Impostos') + 1);
  await expect.poll(() => texto(page, 'Impostos a pagar')).toContain('R$ 2.280,00');
  expect(await texto(page, 'Impostos a pagar')).toContain('1 vencidas');
  expect(await texto(page, 'Impostos pagos')).toContain('4');
  await expect(page.getByTestId('imposto-FGTS Digital')).toContainText('Vencido');
  await expect(page.getByTestId('imposto-ISSQN')).toContainText('Pagamento informado');
  expect(chamadas(registro, 'rpc/buscar_impostos').at(-1)!.corpo).toMatchObject({ p_id_empresa: EMPRESA.id, p_origem: 'correntes' });
  await page.getByLabel('Filtrar por status').selectOption('vencido');
  await page.getByLabel('Filtrar por tipo').selectOption('fgts');
  await page.getByLabel('Filtrar por vencimento').selectOption('7');
  await page.getByLabel('Buscar imposto').fill('09/2026');
  await expect.poll(() => chamadas(registro, 'rpc/buscar_impostos').some((x) => { const b = x.corpo as Record<string, unknown>; return b.p_situacao === 'vencido' && b.p_tipo === 'fgts' && b.p_vencimento === '7' && b.p_busca === '09/2026'; })).toBe(true);
  // Detalhes: contador não confirma pagamento (sem permissão financeira); pode informar, enviar guia, editar, cancelar
  await page.getByTestId('imposto-DAS – Simples Nacional').click();
  const det = page.getByRole('complementary', { name: 'Detalhes do imposto' });
  await expect(det.getByRole('button', { name: 'Confirmar pagamento (baixa)' })).toHaveCount(0);
  await expect(det).toContainText('A confirmação do pagamento é feita por quem gerencia o Financeiro');
  await expect(det.getByRole('button', { name: 'Enviar guia' })).toBeVisible();
  await det.getByRole('tab', { name: 'Histórico' }).click();
  await expect(det.getByTestId('historico-imposto')).toContainText('Imposto cadastrado');
  // Ver guia: arquivo baixado do storage privado com a sessão (simulado)
  await ctx.route(`${SUPABASE}/storage/v1/object/**`, (route) => route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4 guia' }));
  const [pop] = await Promise.all([page.waitForEvent('popup'), page.getByTestId('imposto-DAS – Simples Nacional').getByRole('button', { name: 'Ver guia' }).click()]);
  await expect.poll(() => pop.url(), { timeout: 15000 }).toMatch(/^blob:|about:blank/);
  await pop.close();
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('contador: novo imposto com guia, informar pagamento, cancelar; parcelamento com parcelas de valores diferentes', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas('contador'));
  const enviados: string[] = [];
  await ctx.route(`${SUPABASE}/storage/v1/object/**`, (route) => { enviados.push(new URL(route.request().url()).pathname); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"ok"}' }); });
  const page = await abrir(ctx, `/contador/empresas/${EMPRESA.id}#impostos`, 'Empresa Exemplo');
  await page.getByRole('button', { name: 'Novo imposto' }).click();
  const m = page.getByRole('dialog', { name: 'Novo imposto' });
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect(m.getByRole('alert')).toContainText('Escolha o tipo');
  await m.getByLabel('Tipo').selectOption('darf');
  await expect(m.getByLabel('Nome')).toHaveValue('DARF – IRPJ/CSLL');
  await expect(m.getByLabel('Órgão')).toHaveValue('Receita Federal');
  await m.getByLabel('Competência').fill('2026-09');
  await m.getByLabel('Vencimento').fill('2026-10-31');
  await m.getByLabel('Valor (R$)').fill('35000');
  await m.getByLabel('Guia (PDF, opcional)').setInputFiles({ name: 'darf.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 teste') });
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/salvar_imposto').length).toBe(1);
  expect(chamadas(registro, 'rpc/salvar_imposto')[0].corpo).toMatchObject({ p_id: null, p_id_empresa: EMPRESA.id, p_tipo: 'darf', p_competencia: '2026-09-01', p_vencimento: '2026-10-31', p_valor: '350.00' });
  await expect.poll(() => chamadas(registro, 'rpc/registrar_arquivo_imposto').length).toBe(1);
  expect(enviados[0]).toMatch(new RegExp(`/guias-impostos/${EMPRESA.id}/99999999-9999-4999-8999-999999999999/guia-[0-9a-f-]{36}\\.pdf$`));
  await expect(page.getByRole('status').filter({ hasText: 'lançado em Contas a pagar' })).toBeVisible();
  // Informar pagamento
  await page.getByTestId('imposto-DAS – Simples Nacional').click();
  const det = page.getByRole('complementary', { name: 'Detalhes do imposto' });
  await det.getByRole('button', { name: 'Registrar informação de pagamento' }).click();
  const inf = page.getByRole('dialog', { name: /Registrar informação de pagamento/ });
  await expect(inf).toContainText('não');
  await inf.getByRole('button', { name: 'Registrar informação' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/informar_pagamento_imposto').length).toBe(1);
  expect(chamadas(registro, 'rpc/informar_pagamento_imposto')[0].corpo).toMatchObject({ p_data: hoje, p_valor: '1250.00' });
  // Cancelar
  await page.getByTestId('imposto-DAS – Simples Nacional').click();
  await det.getByRole('button', { name: 'Cancelar imposto' }).click();
  const canc = page.getByRole('dialog', { name: /Cancelar DAS/ });
  await canc.getByLabel('Motivo').fill('Guia duplicada');
  await canc.getByRole('button', { name: 'Cancelar', exact: true }).last().click();
  await expect.poll(() => chamadas(registro, 'rpc/cancelar_imposto').length).toBe(1);
  // Parcelamentos
  await page.getByRole('tab', { name: 'Parcelamentos' }).click();
  await expect(page.getByTestId('parcelamento-ACORDO-1')).toContainText('1/3');
  await page.getByTestId('parcelamento-ACORDO-1').click();
  const pan = page.getByRole('complementary', { name: 'Parcelas' });
  await expect(pan.getByTestId('lista-parcelas')).toContainText('R$ 2.400,00');
  await expect(pan.getByTestId('lista-parcelas')).toContainText('R$ 946,65');
  await pan.getByRole('button', { name: 'Parcela 2' }).click();
  await expect(page.getByRole('complementary', { name: 'Detalhes do imposto' })).toContainText('parcela 2/3');
  await page.getByRole('complementary', { name: 'Detalhes do imposto' }).getByRole('button', { name: 'Fechar detalhes' }).click();
  await page.getByRole('button', { name: 'Novo parcelamento' }).click();
  const np = page.getByRole('dialog', { name: 'Novo parcelamento' });
  await np.getByLabel('Tributo').fill('Simples Nacional');
  await np.getByLabel('Órgão').fill('Receita Federal');
  await np.getByLabel('Número do acordo').fill('ACORDO-9');
  await np.getByLabel('Valor negociado (R$)').fill('100000');
  await np.getByLabel('Quantidade de parcelas').fill('3');
  await np.getByLabel('Primeiro vencimento').fill('2099-01-31');
  await np.getByRole('button', { name: 'Gerar parcelas' }).click();
  await expect(np.getByLabel('Vencimento da parcela 2')).toHaveValue('2099-02-28');
  await np.getByLabel('Valor da parcela 1').fill('50000');
  await expect(np.getByTestId('soma-parcelas')).toContainText('diferente do valor negociado');
  await np.getByRole('button', { name: 'Salvar parcelamento' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/salvar_parcelamento_tributario').length).toBe(1);
  expect(chamadas(registro, 'rpc/salvar_parcelamento_tributario')[0].corpo).toMatchObject({ p_numero_acordo: 'ACORDO-9', p_valor_negociado: '1000.00',
    p_parcelas: [{ vencimento: '2099-01-31', valor: 500 }, { vencimento: '2099-02-28', valor: 333.33 }, { vencimento: '2099-03-31', valor: 333.34 }] });
  // Todos
  await page.getByRole('tab', { name: 'Todos' }).click();
  await expect(page.getByTestId('imposto-PGFN – Dívida Ativa — parcela 2/3')).toContainText('Parcelamento');
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('empresário: menu Impostos, confirma pagamento com baixa na conta; estados e layout', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas('empresa'));
  const page = await abrir(ctx, '/app/impostos', 'Impostos');
  await expect(page.getByRole('navigation', { name: 'Módulos do departamento' }).getByRole('link', { name: 'Impostos' })).toHaveAttribute('href', '/app/impostos');
  await page.getByTestId('imposto-ISSQN').click();
  const det = page.getByRole('complementary', { name: 'Detalhes do imposto' });
  await expect(det).toContainText('Não conta como pago');
  await det.getByRole('button', { name: 'Confirmar pagamento (baixa)' }).click();
  const conf = page.getByRole('dialog', { name: /Confirmar pagamento/ });
  await expect(conf.getByTestId('previa-saldo')).toContainText('R$ 4.820,00');
  await conf.getByRole('button', { name: 'Confirmar pagamento' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/confirmar_pagamento_imposto').length).toBe(1);
  expect(chamadas(registro, 'rpc/confirmar_pagamento_imposto')[0].corpo).toMatchObject({ p_id: '33333333-3333-4333-8333-333333333333', p_data: hoje, p_id_conta: 'k1' });
  await ctx.close();

  const ausente = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(ausente, rotas('empresa', undefined, (c) => (c === 'rpc/buscar_impostos' || c === 'rpc/resumo_impostos' ? { status: 404, corpo: { code: 'PGRST202', message: 'Could not find the function in the schema cache' } } : undefined)));
  const pa = await abrir(ausente, '/app/impostos', 'Impostos');
  await expect(pa.getByTestId('impostos-indisponivel')).toContainText('falta aplicar uma atualização do banco', { timeout: 15000 });
  expect(await texto(pa, 'Impostos a pagar')).toContain('Indisponível');
  await ausente.close();

  const vazio = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(vazio, rotas('empresa', undefined, (c) => (c === 'rpc/buscar_impostos' ? { corpo: [] } : undefined)));
  const pv = await abrir(vazio, '/app/impostos', 'Impostos');
  await expect(pv.getByText('Nenhum imposto cadastrado ainda.')).toBeVisible({ timeout: 15000 });
  await vazio.close();

  const l = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await sessaoSimulada(l, rotas('empresa'));
  const pl = await abrir(l, '/app/impostos', 'Impostos');
  await expect(pl.getByTestId('imposto-DAS – Simples Nacional')).toBeVisible({ timeout: 15000 });
  for (const largura of [320, 375, 768, 1024, 1440, 1920]) {
    await pl.setViewportSize({ width: largura, height: 900 });
    await pl.waitForTimeout(200);
    expect(await pl.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `@${largura}`).toBeLessThanOrEqual(1);
  }
  await l.close();
});

test('contador: excluir guia com confirmação (banco primeiro, depois o arquivo); comprovante sem exclusão; erro do banco aparece', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const CAM = `${EMPRESA.id}/11111111-1111-4111-8111-111111111111/guia-x.pdf`;
  let recusar = false;
  const registro = await sessaoSimulada(ctx, rotas('contador', ['ver_documentos', 'gerenciar_impostos'], (c) => {
    if (c === 'arquivos_impostos') return { corpo: [
      { id: 'ar1', tipo: 'guia', caminho: CAM, nome_arquivo: 'DAS SIMPLES.pdf', tamanho: 160000, criado_em: `${hoje}T10:00:00Z` },
      { id: 'ar2', tipo: 'comprovante', caminho: `${EMPRESA.id}/x/comprovante-y.pdf`, nome_arquivo: 'comprovante.pdf', tamanho: 90000, criado_em: `${hoje}T11:00:00Z` }] };
    if (c === 'rpc/excluir_guia_imposto') return recusar ? { status: 400, corpo: { code: '23514', message: 'Imposto já pago: a guia fica guardada como prova do pagamento.', details: null, hint: null } } : { corpo: CAM };
    if (c === '/storage/v1/object/guias-impostos') return { corpo: [] };
  }));
  const page = await abrir(ctx, `/contador/empresas/${EMPRESA.id}/impostos`, 'Empresa Exemplo');
  await page.getByTestId('imposto-DAS – Simples Nacional').click();
  const painel = page.getByRole('complementary', { name: 'Detalhes do imposto' });
  await expect(painel.getByRole('button', { name: 'Excluir guia DAS SIMPLES.pdf' })).toBeVisible({ timeout: 30000 });
  await expect(painel.getByRole('button', { name: /^Excluir guia comprovante/ })).toHaveCount(0); // só guias
  // cancelar não faz nada
  await painel.getByRole('button', { name: 'Excluir guia DAS SIMPLES.pdf' }).click();
  const d = page.getByRole('dialog', { name: 'Excluir guia' });
  await expect(d).toContainText('DAS SIMPLES.pdf');
  await expect(d).toContainText('O imposto, o valor, o vencimento e o lançamento em Contas a pagar continuam como estão');
  await d.getByRole('button', { name: 'Cancelar' }).click();
  expect(chamadas(registro, 'rpc/excluir_guia_imposto')).toHaveLength(0);
  // erro do banco: aparece no modal e o arquivo NÃO é apagado
  recusar = true;
  await painel.getByRole('button', { name: 'Excluir guia DAS SIMPLES.pdf' }).click();
  await d.getByRole('button', { name: 'Excluir guia' }).click();
  await expect(d.getByRole('alert')).toContainText('Imposto já pago');
  expect(chamadas(registro, '/storage/v1/object/guias-impostos')).toHaveLength(0);
  await d.getByRole('button', { name: 'Cancelar' }).click();
  // exclui: RPC primeiro, depois remove o arquivo do bucket privado
  recusar = false;
  await painel.getByRole('button', { name: 'Excluir guia DAS SIMPLES.pdf' }).click();
  await d.getByRole('button', { name: 'Excluir guia' }).click();
  await expect(page.getByText('Guia excluída.')).toBeVisible({ timeout: 15000 });
  expect(chamadas(registro, 'rpc/excluir_guia_imposto').at(-1)!.corpo).toEqual({ p_id_arquivo: 'ar1' });
  const remocao = chamadas(registro, '/storage/v1/object/guias-impostos').at(-1)!;
  expect(JSON.stringify(remocao.corpo)).toContain(CAM);
  expect(registro.escritasBloqueadas.filter((x) => !x.includes('rpc/'))).toEqual([]);
  await ctx.close();
});

test('contador: excluir imposto corrente e parcela com confirmação; imposto pago não oferece exclusão; erro do banco aparece', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  let recusar = true;
  const registro = await sessaoSimulada(ctx, rotas('contador', ['ver_documentos', 'gerenciar_impostos'], (c) => {
    if (c === 'rpc/excluir_imposto') return recusar ? { status: 400, corpo: { code: '23514', message: 'Imposto pago: estorne o pagamento no Financeiro antes de excluí-lo.', details: null, hint: null } } : { status: 200, corpo: null };
  }));
  const page = await abrir(ctx, `/contador/empresas/${EMPRESA.id}/impostos`, 'Empresa Exemplo');
  const det = page.getByRole('complementary', { name: 'Detalhes do imposto' });
  await page.getByTestId('imposto-FGTS Digital').click();
  await expect(det.getByRole('button', { name: 'Excluir imposto' })).toBeVisible({ timeout: 30000 });
  // cancelar na confirmação não chama o banco; erro do banco fica no modal
  await det.getByRole('button', { name: 'Excluir imposto' }).click();
  const d = page.getByRole('dialog', { name: 'Excluir FGTS Digital' });
  await expect(d).toContainText('sai das listas e da conta a pagar do Financeiro');
  await d.getByRole('button', { name: 'Cancelar' }).click();
  expect(chamadas(registro, 'rpc/excluir_imposto')).toHaveLength(0);
  await det.getByRole('button', { name: 'Excluir imposto' }).click();
  await d.getByRole('button', { name: 'Excluir imposto' }).click();
  await expect(d.getByRole('alert')).toContainText('Imposto pago: estorne');
  await d.getByRole('button', { name: 'Cancelar' }).click();
  // sucesso
  recusar = false;
  await det.getByRole('button', { name: 'Excluir imposto' }).click();
  await d.getByRole('button', { name: 'Excluir imposto' }).click();
  await expect(page.getByText('Imposto excluído.')).toBeVisible({ timeout: 15000 });
  expect(chamadas(registro, 'rpc/excluir_imposto').at(-1)!.corpo).toEqual({ p_id: '22222222-2222-4222-8222-222222222222' });
  // parcelas: a paga (parcela 1) não tem exclusão; a pendente (parcela 2) tem e usa o mesmo banco
  await page.getByRole('tab', { name: 'Parcelamentos' }).click();
  await page.getByTestId('parcelamento-ACORDO-1').click();
  const pan = page.getByRole('complementary', { name: 'Parcelas' });
  await pan.getByRole('button', { name: 'Parcela 1' }).click();
  await expect(det).toContainText('parcela 1/3');
  await expect(det.getByRole('button', { name: /^Excluir (parcela|imposto)$/ })).toHaveCount(0);
  await det.getByRole('button', { name: 'Fechar detalhes' }).click(); // volta ao painel de parcelas
  await pan.getByRole('button', { name: 'Parcela 2' }).click();
  await expect(det.getByRole('button', { name: 'Excluir parcela' })).toBeVisible();
  await det.getByRole('button', { name: 'Excluir parcela' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir imposto' }).click();
  await expect(page.getByText('Parcela excluída.')).toBeVisible({ timeout: 15000 });
  expect(chamadas(registro, 'rpc/excluir_imposto').at(-1)!.corpo).toEqual({ p_id: '44444442-4444-4444-8444-444444444444' });
  await ctx.close();
});

test('contador: excluir parcelamento só quando nenhuma parcela está paga', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  let pagas = 1;
  const registro = await sessaoSimulada(ctx, rotas('contador', ['ver_documentos', 'gerenciar_impostos'], (c) => {
    if (c === 'rpc/listar_parcelamentos_tributarios') return { corpo: [{ ...PARC[0], pagas }] };
    if (c === 'rpc/excluir_parcelamento_tributario') return { status: 200, corpo: null };
  }));
  const page = await abrir(ctx, `/contador/empresas/${EMPRESA.id}/impostos`, 'Empresa Exemplo');
  await page.getByRole('tab', { name: 'Parcelamentos' }).click();
  await page.getByTestId('parcelamento-ACORDO-1').click();
  const pan = page.getByRole('complementary', { name: 'Parcelas' });
  await expect(pan).toContainText('estorne antes os pagamentos das parcelas pagas', { timeout: 30000 });
  await expect(pan.getByRole('button', { name: 'Excluir parcelamento' })).toHaveCount(0);
  // sem parcela paga: confirmação e exclusão do parcelamento inteiro
  pagas = 0;
  await page.getByRole('tab', { name: 'Impostos correntes' }).click();
  await page.getByRole('tab', { name: 'Parcelamentos' }).click();
  await page.getByTestId('parcelamento-ACORDO-1').click();
  await pan.getByRole('button', { name: 'Excluir parcelamento' }).click();
  const d = page.getByRole('dialog', { name: 'Excluir parcelamento ACORDO-1' });
  await expect(d).toContainText('TODAS as suas parcelas');
  await d.getByRole('button', { name: 'Excluir parcelamento' }).click();
  await expect(page.getByText('Parcelamento excluído.')).toBeVisible({ timeout: 15000 });
  expect(chamadas(registro, 'rpc/excluir_parcelamento_tributario').at(-1)!.corpo).toEqual({ p_id: 'p1' });
  await ctx.close();
});

test('encargo da folha aprovada em Impostos: selo "Folha de pagamento", sem editar/cancelar/excluir, pagamento normal', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await sessaoSimulada(ctx, rotas('empresa', undefined, (c, u) => {
    if (c === 'impostos') return { corpo: u.searchParams.get('id') === 'eq.22222222-2222-4222-8222-222222222222' ? { id_valor_folha: 'v1' } : { id_valor_folha: null } };
    return undefined;
  }));
  const page = await abrir(ctx, '/app/impostos', 'Impostos');
  await page.getByTestId('imposto-FGTS Digital').click();
  const det = page.getByRole('complementary', { name: 'Detalhes do imposto' });
  await expect(det.getByTestId('origem-folha')).toHaveText('Folha de pagamento');
  await expect(det.getByText('Encargo da folha de pagamento aprovada', { exact: false })).toBeVisible();
  await expect(det.getByRole('button', { name: 'Editar imposto' })).toHaveCount(0);
  await expect(det.getByRole('button', { name: 'Cancelar imposto' })).toHaveCount(0);
  await expect(det.getByRole('button', { name: 'Excluir imposto' })).toHaveCount(0);
  await expect(det.getByRole('button', { name: 'Confirmar pagamento (baixa)' })).toBeVisible();
  // Imposto comum continua editável
  await page.getByTestId('imposto-DAS – Simples Nacional').click();
  await expect(det.getByTestId('origem-folha')).toHaveCount(0);
  await expect(det.getByRole('button', { name: 'Editar imposto' })).toBeVisible();
  await ctx.close();
});
