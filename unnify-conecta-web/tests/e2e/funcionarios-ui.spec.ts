import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { sessaoSimulada, type Rotas } from './apoio/sessao-simulada';

// Funcionários com a API do Supabase SIMULADA (não acessa banco). Integridade financeira, recorrência, pagamentos parciais,
// salários, desligamento e acesso em tests/sql/funcionarios.mjs.
const BASE = 'http://localhost:3000';
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const comp = `${hoje.slice(0, 7)}-01`;
const EMPRESA = { id: 'aaaaaaaa-0000-4000-8000-000000000001', razao_social: 'EMPRESA EXEMPLO LTDA', nome_comercial: 'Empresa Exemplo', cnpj: '12345678000190', tipo_empresa: 'comum' };
const LINHAS = [
  { id_funcionario: 'f1', nome: 'Andressa Santos Alves', cargo: 'Atendente', vinculo: 'clt', data_admissao: '2024-01-05', status_funcionario: 'ativo', id_folha: 'fo1',
    salario_base: 1621, adicionais: 150, descontos: 0, total: 1771, pago: 1771, pendente: 0, vencimento: '2026-11-05', situacao: 'pago', ultimo_pagamento: hoje },
  { id_funcionario: 'f2', nome: 'Denilson Amorim', cargo: 'Técnico', vinculo: 'clt', data_admissao: '2023-03-10', status_funcionario: 'ativo', id_folha: 'fo2',
    salario_base: 2107.3, adicionais: 0, descontos: 200, total: 1907.3, pago: 1000, pendente: 907.3, vencimento: '2026-11-05', situacao: 'parcial', ultimo_pagamento: hoje },
];
const FUNCS = [
  { id: 'f1', nome: 'Andressa Santos Alves', cargo: 'Atendente', data_admissao: '2024-01-05', vinculo: 'clt', salario_base: 1621, dia_pagamento: 5, pagamento_mes_seguinte: true, status: 'ativo', data_desligamento: null, observacoes: null },
  { id: 'f2', nome: 'Denilson Amorim', cargo: 'Técnico', data_admissao: '2023-03-10', vinculo: 'clt', salario_base: 2107.3, dia_pagamento: 5, pagamento_mes_seguinte: true, status: 'ativo', data_desligamento: null, observacoes: null },
];
const CONTA = { id: 'k1', nome: 'Sicredi', instituicao: null, tipo: 'conta_corrente', saldo_inicial: 0, data_saldo_inicial: '2026-01-01', principal: true, permite_saldo_negativo: false, arquivada_em: null, saldo: 5000, cor: null };

function rotas(extra?: Rotas): Rotas {
  return (c, u, req) => {
    const e = extra?.(c, u, req);
    if (e) return e;
    if (c === 'perfis') return { corpo: [{ nome_completo: 'Ana Souza', tipo_usuario: 'empresa', funcao_global: 'user' }] };
    if (c === 'usuarios_empresas') return { corpo: [{ empresas: EMPRESA }] };
    if (c === 'rpc/gerar_folha') return { corpo: 0 };
    if (c === 'rpc/resumo_folha') return { corpo: LINHAS };
    if (c === 'funcionarios') return { corpo: FUNCS };
    if (c === 'rpc/evolucao_folha') return { corpo: Array.from({ length: 12 }, (_, i) => ({ competencia: `${hoje.slice(0, 4)}-${String(i + 1).padStart(2, '0')}-01`, previsto: i < 10 ? 3678.3 : 0, pago: i < 9 ? 3678.3 : 0 })) };
    if (c === 'contas_financeiras_saldo') return { corpo: [CONTA] };
    if (c === 'ajustes_folha') return { corpo: [{ id: 'a1', id_folha: 'fo1', tipo: 'adicional', descricao: 'Hora extra', valor: 150, criado_em: `${hoje}T10:00:00Z` }, { id: 'a2', id_folha: 'fo2', tipo: 'desconto', descricao: 'Vale', valor: 200, criado_em: `${hoje}T10:00:00Z` }] };
    if (c === 'rpc/historico_funcionario') return { corpo: [{ tipo: 'pagamento', data: hoje, competencia: comp, descricao: 'Salário', valor: 1000, situacao: 'pago' }] };
    if (['rpc/registrar_pagamento_folha', 'rpc/adicionar_ajuste_folha', 'rpc/salvar_funcionario', 'rpc/desligar_funcionario', 'rpc/remover_ajuste_folha'].includes(c)) return { corpo: 'ok' };
    if (c === 'notificacoes') return { corpo: [] };
    if (c === 'rpc/situacao_portal_funcionario') return { corpo: [{ situacao: 'sem_convite', email: null, convite_expira_em: null, convite_enviado: null, ativado_em: null, revogado_em: null, motivo_revogacao: null }] };
    return undefined;
  };
}
async function abrir(ctx: BrowserContext): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/funcionarios`);
  await expect(page.getByRole('heading', { level: 1, name: 'Funcionários' })).toBeVisible({ timeout: 90000 });
  return page;
}
const chamadas = (r: { chamadas: { caminho: string; corpo: unknown }[] }, c: string) => r.chamadas.filter((x) => x.caminho === c);
const texto = async (p: Page, nome: string) => ((await p.getByRole('region', { name: nome, exact: true }).textContent()) ?? '').replace(/ /g, ' ');

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

test('painel da competência: gera previsões, cards com valores do banco, tabela e resumo do colaborador', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas());
  const page = await abrir(ctx);
  await expect(page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Recursos Humanos' })).toHaveAttribute('href', '/app/funcionarios');
  expect(chamadas(registro, 'rpc/gerar_folha')[0].corpo).toMatchObject({ p_id_empresa: EMPRESA.id, p_competencia: comp });
  await expect.poll(() => texto(page, 'Folha prevista do mês')).toContain('R$ 3.678,30');
  expect(await texto(page, 'Pagamentos realizados')).toContain('R$ 2.771,00');
  expect(await texto(page, 'Pendente de pagamento')).toContain('R$ 907,30');
  expect(await texto(page, 'Pendente de pagamento')).toContain('1 colaborador');
  expect(await texto(page, 'Funcionários ativos')).toContain('2');
  await expect(page.getByTestId('linha-Denilson Amorim')).toContainText('Parcial');
  await page.getByTestId('linha-Denilson Amorim').click();
  await expect(page.getByTestId('resumo-competencia')).toContainText('R$ 1.907,30');
  await expect(page.getByTestId('resumo-competencia')).toContainText('R$ 907,30');
  // Filtro por situação
  await page.getByLabel('Filtrar por situação').selectOption('pago');
  await expect(page.getByTestId('linha-Denilson Amorim')).toHaveCount(0);
  await page.getByLabel('Filtrar por situação').selectOption('');
  // Abas
  await page.getByRole('tab', { name: 'Lançamentos do mês' }).click();
  await expect(page.getByTestId('ajustes-mes')).toContainText('Hora extra');
  await page.getByRole('tab', { name: 'Histórico' }).first().click();
  await expect(page.getByTestId('historico-mensal')).toContainText('R$ 3.678,30');
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('pagamento parcial, ajuste, cadastro com vigência salarial e desligamento chamam as funções do banco', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas());
  const page = await abrir(ctx);
  await page.getByTestId('linha-Denilson Amorim').click();
  const painel = page.getByRole('complementary', { name: 'Resumo do colaborador' });
  await painel.getByRole('button', { name: 'Registrar pagamento' }).click();
  const pag = page.getByRole('dialog', { name: 'Registrar pagamento' });
  await expect(pag.getByLabel('Valor (R$)')).toHaveValue('907,30');
  await pag.getByLabel('Valor (R$)').fill('100000');
  await pag.getByRole('button', { name: 'Confirmar pagamento' }).click();
  await expect(pag.getByRole('alert')).toContainText('passa do pendente');
  await pag.getByLabel('Valor (R$)').fill('50000');
  await pag.getByRole('button', { name: 'Confirmar pagamento' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/registrar_pagamento_folha').length).toBe(1);
  expect(chamadas(registro, 'rpc/registrar_pagamento_folha')[0].corpo).toMatchObject({ p_id_folha: 'fo2', p_valor: '500.00', p_id_conta: 'k1', p_data: hoje });
  await expect(page.getByRole('status').filter({ hasText: 'Pagamento parcial registrado.' })).toBeVisible();
  // Ajuste
  await painel.getByRole('tab', { name: 'Lançamentos' }).click();
  await painel.getByRole('button', { name: 'Adicional ou desconto' }).click();
  const aj = page.getByRole('dialog', { name: 'Adicional ou desconto' });
  await aj.getByRole('radio', { name: 'Desconto' }).click();
  await aj.getByLabel('Descrição').fill('Adiantamento');
  await aj.getByLabel('Valor (R$)').fill('10000');
  await aj.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/adicionar_ajuste_folha').length).toBe(1);
  expect(chamadas(registro, 'rpc/adicionar_ajuste_folha')[0].corpo).toMatchObject({ p_id_folha: 'fo2', p_tipo: 'desconto', p_valor: '100.00' });
  // Edição com novo salário pede a competência de vigência
  await painel.getByRole('tab', { name: 'Visão geral' }).click();
  await painel.getByRole('button', { name: 'Editar' }).click();
  const ed = page.getByRole('dialog', { name: 'Editar funcionário' });
  await ed.getByLabel('Salário-base (R$)').fill('250000');
  await expect(ed.getByLabel('Novo salário vale a partir da competência')).toBeVisible();
  await ed.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/salvar_funcionario').length).toBe(1);
  expect(chamadas(registro, 'rpc/salvar_funcionario')[0].corpo).toMatchObject({ p_id: 'f2', p_salario: '2500.00', p_vigente_desde: comp });
  // Desligar
  await painel.getByRole('button', { name: 'Desligar funcionário' }).click();
  await page.getByRole('dialog', { name: 'Desligar funcionário' }).getByRole('button', { name: 'Desligar' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/desligar_funcionario').length).toBe(1);
  // Novo funcionário
  await page.getByRole('button', { name: 'Novo funcionário' }).first().click();
  const novo = page.getByRole('dialog', { name: 'Novo funcionário' });
  await novo.getByRole('button', { name: 'Salvar' }).click();
  await expect(novo.getByRole('alert')).toContainText('nome');
  await novo.getByLabel('Nome').fill('Lucas Martins Lopes');
  await novo.getByLabel('Admissão').fill('2025-02-20');
  await novo.getByLabel('Salário-base (R$)').fill('98000');
  await novo.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/salvar_funcionario').length).toBe(2);
  expect(chamadas(registro, 'rpc/salvar_funcionario')[1].corpo).toMatchObject({ p_id: null, p_nome: 'Lucas Martins Lopes', p_salario: '980.00', p_vigente_desde: null });
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('estados: vazio, erro (não vira R$ 0,00), banco sem a migration; layout de 320 a 1920px', async ({ browser }) => {
  const vazio = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(vazio, rotas((c) => (c === 'rpc/resumo_folha' || c === 'funcionarios' ? { corpo: [] } : undefined)));
  const pv = await abrir(vazio);
  await expect(pv.getByText('Nenhum funcionário nesta competência')).toBeVisible({ timeout: 15000 });
  await vazio.close();

  const erro = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(erro, rotas((c) => (c === 'rpc/resumo_folha' ? { status: 500, corpo: { message: 'falha', code: 'XX000' } } : undefined)));
  const pe = await abrir(erro);
  await expect(pe.getByRole('alert').filter({ hasText: 'Não foi possível carregar a folha.' })).toBeVisible({ timeout: 15000 });
  expect(await texto(pe, 'Folha prevista do mês')).toContain('Indisponível');
  await expect(pe.getByText('R$ 0,00')).toHaveCount(0);
  await erro.close();

  const ausente = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(ausente, rotas((c) => (c === 'rpc/gerar_folha' ? { status: 404, corpo: { code: 'PGRST202', message: 'Could not find the function public.gerar_folha in the schema cache' } } : undefined)));
  const pa = await abrir(ausente);
  await expect(pa.getByTestId('folha-indisponivel')).toContainText('falta aplicar uma atualização do banco', { timeout: 15000 });
  await ausente.close();

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await sessaoSimulada(ctx, rotas());
  const page = await abrir(ctx);
  await expect(page.getByTestId('linha-Denilson Amorim')).toBeVisible();
  for (const largura of [320, 375, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `@${largura}`).toBeLessThanOrEqual(1);
  }
  await ctx.close();
});

test('adicional ou desconto por porcentagem: prévia, validação, só o percentual vai ao banco e histórico mostra o cálculo', async ({ browser }) => {
  const JOAO = { ...LINHAS[1], id_funcionario: 'f3', nome: 'João Silva', id_folha: 'fo3', salario_base: 2200, adicionais: 220, descontos: 0, total: 2420, pago: 0, pendente: 2420, situacao: 'pendente' };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas((c) => {
    if (c === 'rpc/resumo_folha') return { corpo: [...LINHAS, JOAO] };
    if (c === 'funcionarios') return { corpo: [...FUNCS, { ...FUNCS[1], id: 'f3', nome: 'João Silva', salario_base: 2200 }] };
    if (c === 'ajustes_folha') return { corpo: [{ id: 'a3', id_folha: 'fo3', tipo: 'adicional', descricao: 'Bônus de produtividade', valor: 220, criado_em: `${hoje}T10:00:00Z`, modalidade: 'percentual', percentual: 10, valor_base: 2200 }] };
    if (c === 'rpc/adicionar_ajuste_percentual_folha') return { corpo: 'ok' };
    return undefined;
  }));
  const page = await abrir(ctx);
  await page.getByTestId('linha-João Silva').click();
  const painel = page.getByRole('complementary', { name: 'Resumo do colaborador' });
  await painel.getByRole('tab', { name: 'Lançamentos' }).click();
  await expect(painel).toContainText('10% sobre o salário-base de R$ 2.200,00');
  // Excluir lançamento do colaborador: pede confirmação; Cancelar não chama o banco
  await painel.getByRole('button', { name: 'Excluir Bônus de produtividade' }).click();
  await painel.getByRole('button', { name: 'Cancelar' }).click();
  expect(chamadas(registro, 'rpc/remover_ajuste_folha')).toHaveLength(0);
  await painel.getByRole('button', { name: 'Excluir Bônus de produtividade' }).click();
  await expect(painel.getByText('Excluir este lançamento?')).toBeVisible();
  await painel.getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect.poll(() => chamadas(registro, 'rpc/remover_ajuste_folha').length).toBe(1);
  expect(chamadas(registro, 'rpc/remover_ajuste_folha')[0].corpo).toEqual({ p_id: 'a3' });
  await expect(page.getByRole('status').filter({ hasText: 'Ajuste removido; a previsão foi atualizada.' })).toBeVisible();
  await painel.getByRole('button', { name: 'Adicional ou desconto' }).click();
  const aj = page.getByRole('dialog', { name: 'Adicional ou desconto' });
  await expect(aj.getByLabel('Tipo de cálculo')).toHaveValue('fixo');
  await expect(aj.getByLabel('Valor (R$)')).toBeVisible();
  await aj.getByLabel('Tipo de cálculo').selectOption('percentual');
  await expect(aj.getByLabel('Valor (R$)')).toHaveCount(0);
  await expect(aj.getByLabel('Base de cálculo')).toContainText('Salário-base (R$ 2.200,00)');
  await aj.getByLabel('Descrição').fill('Bônus de produtividade');
  await aj.getByLabel('Porcentagem (%)').fill('0');
  await aj.getByRole('button', { name: 'Salvar' }).click();
  await expect(aj.getByRole('alert')).toContainText('porcentagem maior que zero');
  await aj.getByLabel('Porcentagem (%)').fill('7,5');
  await expect(aj.getByTestId('previa-ajuste')).toContainText('Valor do adicional: + R$ 165,00');
  await aj.getByLabel('Porcentagem (%)').fill('10');
  await expect(aj.getByTestId('previa-ajuste')).toContainText('Valor do adicional: + R$ 220,00');
  await expect(aj.getByTestId('previa-ajuste')).toHaveClass(/bg-green-50/);
  await aj.getByRole('radio', { name: 'Desconto' }).click();
  await aj.getByLabel('Porcentagem (%)').fill('5');
  await expect(aj.getByTestId('previa-ajuste')).toContainText('Valor do desconto: − R$ 110,00');
  await expect(aj.getByTestId('previa-ajuste')).toHaveClass(/bg-red-50/);
  await aj.getByLabel('Porcentagem (%)').fill('150');
  await aj.getByRole('button', { name: 'Salvar' }).click();
  await expect(aj.getByRole('alert')).toContainText('100%');
  await aj.getByLabel('Porcentagem (%)').fill('5');
  await aj.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/adicionar_ajuste_percentual_folha').length).toBe(1);
  const corpo = chamadas(registro, 'rpc/adicionar_ajuste_percentual_folha')[0].corpo as Record<string, unknown>;
  expect(corpo).toEqual({ p_id_folha: 'fo3', p_tipo: 'desconto', p_descricao: 'Bônus de produtividade', p_percentual: '5' }); // sem base nem valor do navegador
  expect(chamadas(registro, 'rpc/adicionar_ajuste_folha')).toHaveLength(0);
  // Modal no celular sem rolagem lateral
  await page.setViewportSize({ width: 375, height: 800 });
  await painel.getByRole('button', { name: 'Adicional ou desconto' }).click().catch(() => {});
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await ctx.close();
});

test('lançamentos recorrentes: lista, novo (30% × 1.621 = 486,30), suspender/encerrar com motivo e não aplicar no mês', async ({ browser }) => {
  const DEN = { ...LINHAS[1], salario_base: 1621, adicionais: 736.3, descontos: 0, total: 2357.3, pago: 0, pendente: 2357.3, situacao: 'pendente' };
  const REC = [
    { id: 'r1', tipo: 'adicional', descricao: 'Ajuda de custo', modalidade: 'fixo', valor: 250, percentual: null, competencia_inicial: comp, competencia_final: null, suspensa_de: null, suspensa_ate: null, situacao: 'ativa', observacoes: null, versao: 1 },
    { id: 'r2', tipo: 'adicional', descricao: 'Periculosidade', modalidade: 'percentual', valor: null, percentual: 30, competencia_inicial: comp, competencia_final: null, suspensa_de: null, suspensa_ate: null, situacao: 'ativa', observacoes: null, versao: 1 },
  ];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas((c) => {
    if (c === 'rpc/resumo_folha') return { corpo: [LINHAS[0], DEN] };
    if (c === 'recorrencias_folha') return { corpo: REC };
    if (c === 'ajustes_folha') return { corpo: [{ id: 'a9', id_folha: 'fo2', tipo: 'adicional', descricao: 'Periculosidade', valor: 486.3, criado_em: `${hoje}T10:00:00Z`, modalidade: 'percentual', percentual: 30, valor_base: 1621, id_recorrencia: 'r2' }] };
    if (['rpc/salvar_recorrencia_folha', 'rpc/suspender_recorrencia_folha', 'rpc/encerrar_recorrencia_folha', 'rpc/nao_aplicar_recorrencia_folha'].includes(c)) return { corpo: 'ok' };
    return undefined;
  }));
  const page = await abrir(ctx);
  await page.getByTestId('linha-Denilson Amorim').click();
  const painel = page.getByRole('complementary', { name: 'Resumo do colaborador' });
  await painel.getByRole('tab', { name: 'Lançamentos' }).click();
  const secao = painel.getByRole('region', { name: 'Lançamentos recorrentes' });
  await expect(secao.getByTestId('recorrente')).toHaveCount(2);
  await expect(secao.getByTestId('recorrente').filter({ hasText: 'Periculosidade' })).toContainText('+ R$ 486,30');
  await expect(secao.getByTestId('recorrente').filter({ hasText: 'Periculosidade' })).toContainText('Ativo');
  // Lançamento gerado no mês: selo Recorrente e "Não aplicar" com motivo (sem exclusão avulsa)
  await expect(painel.getByTestId('ajuste-colaborador')).toContainText('Recorrente');
  await painel.getByRole('button', { name: 'Não aplicar Periculosidade nesta competência' }).click();
  await painel.getByRole('button', { name: 'Não aplicar', exact: true }).click();
  await expect(painel.getByText('Informe o motivo.')).toBeVisible();
  await painel.getByLabel('Não aplicar nesta competência — motivo').fill('Afastado no mês');
  await painel.getByRole('button', { name: 'Não aplicar', exact: true }).click();
  await expect.poll(() => chamadas(registro, 'rpc/nao_aplicar_recorrencia_folha').length).toBe(1);
  expect(chamadas(registro, 'rpc/nao_aplicar_recorrencia_folha')[0].corpo).toEqual({ p_id: 'r2', p_competencia: comp, p_motivo: 'Afastado no mês' });
  expect(chamadas(registro, 'rpc/remover_ajuste_folha')).toHaveLength(0);
  // Novo recorrente percentual
  await painel.getByRole('tab', { name: 'Lançamentos' }).click();
  await secao.getByRole('button', { name: 'Novo recorrente' }).click();
  const md = page.getByRole('dialog', { name: 'Novo lançamento recorrente' });
  await md.getByLabel('Descrição').fill('Insalubridade');
  await md.getByLabel('Modalidade').selectOption('percentual');
  await md.getByLabel('Porcentagem (%)').fill('30');
  await expect(md.getByTestId('previa-recorrente')).toContainText('Valor mensal: + R$ 486,30');
  await expect(md.getByTestId('previa-recorrente')).toContainText('30% × R$ 1.621,00');
  await expect(md.getByLabel('Competência inicial')).toHaveValue(comp.slice(0, 7));
  await md.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/salvar_recorrencia_folha').length).toBe(1);
  expect(chamadas(registro, 'rpc/salvar_recorrencia_folha')[0].corpo).toEqual({ p_id: null, p_id_funcionario: 'f2', p_tipo: 'adicional', p_descricao: 'Insalubridade', p_modalidade: 'percentual',
    p_valor: null, p_percentual: '30', p_competencia_inicial: comp, p_competencia_final: null, p_observacoes: null, p_motivo: null });
  // Editar exige motivo
  await painel.getByRole('tab', { name: 'Lançamentos' }).click();
  await secao.getByRole('button', { name: 'Editar Ajuda de custo' }).click();
  const ed = page.getByRole('dialog', { name: 'Editar lançamento recorrente' });
  await expect(ed.getByLabel('Valor mensal (R$)')).toHaveValue('250,00');
  await ed.getByLabel('Valor mensal (R$)').fill('30000');
  await ed.getByRole('button', { name: 'Salvar' }).click();
  await expect(ed.getByRole('alert')).toHaveText('Informe o motivo da alteração.');
  await ed.getByLabel('Motivo da alteração').fill('Reajuste');
  await ed.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/salvar_recorrencia_folha').length).toBe(2);
  expect(chamadas(registro, 'rpc/salvar_recorrencia_folha')[1].corpo).toMatchObject({ p_id: 'r1', p_valor: '300.00', p_motivo: 'Reajuste' });
  // Suspender e encerrar com motivo
  await painel.getByRole('tab', { name: 'Lançamentos' }).click();
  await secao.getByRole('button', { name: 'Suspender Ajuda de custo' }).click();
  const sus = page.getByRole('dialog', { name: 'Suspender recorrência' });
  await sus.getByRole('button', { name: 'Confirmar' }).click();
  await expect(sus.getByRole('alert')).toHaveText('Informe o motivo.');
  await sus.getByLabel('Motivo').fill('Férias');
  await sus.getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/suspender_recorrencia_folha').length).toBe(1);
  expect(chamadas(registro, 'rpc/suspender_recorrencia_folha')[0].corpo).toEqual({ p_id: 'r1', p_de: comp, p_ate: null, p_motivo: 'Férias' });
  await painel.getByRole('tab', { name: 'Lançamentos' }).click();
  await secao.getByRole('button', { name: 'Encerrar Periculosidade' }).click();
  const enc = page.getByRole('dialog', { name: 'Encerrar recorrência' });
  await enc.getByLabel('Motivo').fill('Fim da exposição');
  await enc.getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/encerrar_recorrencia_folha').length).toBe(1);
  expect(chamadas(registro, 'rpc/encerrar_recorrencia_folha')[0].corpo).toEqual({ p_id: 'r2', p_ultima_competencia: comp, p_motivo: 'Fim da exposição' });
  // Celular: sem rolagem lateral com o painel aberto
  await page.setViewportSize({ width: 375, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await ctx.close();
});
