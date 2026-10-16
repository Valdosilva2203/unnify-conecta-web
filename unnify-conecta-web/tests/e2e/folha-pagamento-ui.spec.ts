import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { sessaoSimulada, type Rotas } from './apoio/sessao-simulada';

// Folha de Pagamento (interface) com a API do Supabase SIMULADA e estado em memória: nada é gravado no banco.
// Regras (situações, versões, aprovação, Financeiro, acesso, storage) em tests/sql/folha-pagamento.mjs.
const BASE = 'http://localhost:3000';
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const COMP = `${hoje.slice(0, 7)}-01`;
const EMPRESA = { id: 'aaaaaaaa-0000-4000-8000-000000000001', razao_social: 'ALFA LTDA', nome_comercial: 'Alfa', cnpj: '12345678000190', tipo_empresa: 'comum' };
const ID = { joao: 'f0000000-0000-4000-8000-000000000001', maria: 'f0000000-0000-4000-8000-000000000002', carlos: 'f0000000-0000-4000-8000-000000000003',
  ana: 'f0000000-0000-4000-8000-000000000004', pedro: 'f0000000-0000-4000-8000-000000000005' };
const conf = (sem: boolean) => ({ sem_ocorrencias: sem, confirmado_em: `${hoje}T12:00:00Z`, confirmado_por: 'Ana Souza' });
const func = (id: string, nome: string, m: number, cargo: string, sal: number, situacao: string, ocorrencias: number, conferencia: unknown = null) =>
  ({ id, nome, matricula: m, cargo, vinculo: 'clt', data_admissao: '2025-01-10', status_funcionario: 'ativo', salario_base: sal, ocorrencias, pendencias: situacao === 'pendente' ? 1 : 0, situacao, conferencia });
const oc = (id: string, f: string, tipo: string, extra: Record<string, unknown>) => ({ id, id_funcionario: f, tipo, quantidade: null, valor: null, data_inicio: COMP, data_fim: null,
  situacao_justificativa: null, justificativa: null, observacoes: null, criado_em: `${hoje}T10:00:00Z`, ...extra });

function estadoInicial() {
  return {
    status: 'preparacao' as string, versao: 0, contador: true,
    funcionarios: [
      func(ID.ana, 'Ana Costa', 4, 'Vendedora', 1900, 'apto', 1, conf(false)),
      func(ID.carlos, 'Carlos Santos', 3, 'Instalador', 2000, 'apto', 0, conf(true)),
      func(ID.joao, 'João Silva', 1, 'Técnico de Redes', 2200, 'apto', 1, conf(false)),
      func(ID.maria, 'Maria Oliveira', 2, 'Atendente', 1800, 'pendente', 1),
      func(ID.pedro, 'Pedro Almeida', 5, 'Suporte Técnico', 2100, 'a_conferir', 0),
    ],
    ocorrencias: [
      oc('o1', ID.joao, 'horas_extras', { quantidade: 5 }),
      oc('o2', ID.maria, 'faltas', { quantidade: 1, situacao_justificativa: 'pendente' }),
      oc('o3', ID.ana, 'comissoes', { valor: 300, data_inicio: null }),
    ],
    pendencias: [{ id_funcionario: ID.maria, origem: 'ocorrencia', id: 'o2', descricao: 'Justificativa pendente' }],
  };
}
type Estado = ReturnType<typeof estadoInicial>;

function montar(e: Estado, papel: 'empresa' | 'contador' = 'empresa', permissoes = ['ver_folha', 'processar_folha']): Rotas {
  const corpo = (req: { postData: () => string | null }) => JSON.parse(req.postData() ?? '{}') as Record<string, unknown>;
  return (c, _u, req) => {
    if (c === 'perfis') return { corpo: [{ nome_completo: papel === 'contador' ? 'João Contador' : 'Ana Souza', tipo_usuario: papel, funcao_global: 'user' }] };
    if (c === 'usuarios_empresas') return { corpo: [{ empresas: EMPRESA }] };
    if (c === 'rpc/painel_contador') return { corpo: [{ id_empresa: EMPRESA.id, nome: 'Alfa', cnpj: EMPRESA.cnpj, permissoes, solicitacoes_aguardando_analise: 0, solicitacoes_aguardando_empresa: 0,
      obrigacoes_abertas: 0, obrigacoes_atrasadas: 0, obrigacoes_7_dias: 0, itens_concluidos: 0 }] };
    if (c === 'rpc/competencias_folha_empresa') return { corpo: [{ id: 'c1', competencia: COMP, status: e.status, versao_atual: e.versao, atualizado_em: `${hoje}T12:00:00Z` }] };
    if (c === 'rpc/painel_folha_pagamento') return { corpo: {
      competencia: { id: 'c1', competencia: COMP, status: e.status, versao_atual: e.versao, atualizado_em: `${hoje}T12:00:00Z` },
      funcionarios: e.funcionarios, pendencias: e.pendencias,
      pacote: e.versao ? { id: 'p1', versao: e.versao, responsavel: 'Ana Souza', enviado_em: `${hoje}T13:00:00Z`, observacoes: null, enviado_por: 'Ana Souza' } : null,
      devolucao: null, pagamento: null, pode_preparar: papel === 'empresa', pode_processar: papel === 'contador' && permissoes.includes('processar_folha'), contador_habilitado: e.contador } };
    if (c === 'ocorrencias_folha') return { corpo: e.ocorrencias };
    if (c === 'eventos_folha') return { corpo: [{ id: 'e1', id_funcionario: ID.joao, tipo: 'ocorrencia_registrada', descricao: 'Ocorrência registrada: horas extras', versao: null, criado_em: `${hoje}T10:00:00Z`, id_usuario: null }] };
    if (['documentos_folha', 'pacotes_folha', 'valores_folha', 'notificacoes', 'empresas'].includes(c)) return { corpo: [] };
    if (c === 'rpc/confirmar_conferencia_folha') {
      const b = corpo(req);
      const f = e.funcionarios.find((x) => x.id === b.p_id_funcionario)!;
      f.situacao = 'apto'; f.conferencia = conf(!!b.p_sem_ocorrencias);
      return { corpo: 'k1' };
    }
    if (c === 'rpc/salvar_ocorrencia_folha') {
      const b = corpo(req);
      e.ocorrencias.push(oc('novo', b.p_id_funcionario as string, b.p_tipo as string, { quantidade: b.p_quantidade, valor: b.p_valor }));
      const f = e.funcionarios.find((x) => x.id === b.p_id_funcionario)!;
      f.ocorrencias++; f.situacao = 'a_conferir'; f.conferencia = null;
      return { corpo: 'novo' };
    }
    if (c === 'rpc/enviar_folha_contador') { e.status = 'enviada'; e.versao = 1; return { corpo: 'p1' }; }
    if (c === 'rpc/iniciar_processamento_folha') { e.status = 'em_processamento'; return { status: 204 }; }
    return undefined;
  };
}
async function abrir(ctx: BrowserContext, largura = 1536): Promise<Page> {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: largura, height: 1000 });
  await page.goto(`${BASE}/app/folha-pagamento`);
  await expect(page.getByRole('heading', { level: 1, name: 'Folha de Pagamento', exact: true })).toBeVisible({ timeout: 90000 });
  await expect(page.getByTestId('linha-funcionario').first()).toBeVisible({ timeout: 30000 });
  return page;
}
const cartao = (p: Page, r: string) => p.getByTestId(`cartao-${r}`).getByTestId('valor');
const linha = (p: Page, nome: string) => p.getByTestId('linha-funcionario').filter({ hasText: nome });
const chamadas = (r: { chamadas: { caminho: string; corpo: unknown }[] }, c: string) => r.chamadas.filter((x) => x.caminho === c);

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

test('RH: aba ao lado de Funcionários, cabeçalho, indicadores reais 5/3/1/1, 60% e fluxo', async ({ browser }) => {
  const ctx = await browser.newContext();
  await sessaoSimulada(ctx, montar(estadoInicial()));
  const page = await abrir(ctx);
  const barra = page.getByRole('navigation', { name: 'Módulos do departamento' });
  expect(await barra.getByRole('link').allTextContents()).toEqual(['Funcionários', 'Folha de Pagamento', 'Controle de Ponto']);
  await expect(barra.getByRole('link', { name: 'Folha de Pagamento' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Recursos Humanos' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Gerencie as informações da folha e envie ao contador de forma simples e organizada.')).toBeVisible();
  await expect(page.getByTestId('status-competencia')).toHaveText('Em preparação');
  await expect(cartao(page, 'Funcionários')).toHaveText('5');
  await expect(cartao(page, 'Aptos')).toHaveText('3');
  await expect(cartao(page, 'A conferir')).toHaveText('1');
  await expect(cartao(page, 'Pendentes')).toHaveText('1');
  await expect(page.getByTestId('progresso')).toContainText('60%');
  await expect(page.getByTestId('progresso')).toContainText('3 de 5 aptos');
  await expect(linha(page, 'João Silva')).toContainText('Matrícula 0001');
  await expect(linha(page, 'João Silva')).toContainText('5 horas · horas extras');
  await expect(linha(page, 'Ana Costa')).toContainText('R$ 300,00');
  await expect(linha(page, 'Maria Oliveira')).toContainText('Pendente');
  await expect(linha(page, 'Pedro Almeida')).toContainText('A conferir');
  await expect(linha(page, 'Carlos Santos')).toContainText('Nenhuma');
  const etapas = page.getByTestId('fluxo-folha').locator('li');
  await expect(etapas).toHaveCount(6);
  await expect(etapas.nth(0)).toHaveAttribute('data-estado', 'em_andamento');
  await expect(etapas.nth(1)).toHaveAttribute('data-estado', 'aguardando');
  await expect(page.getByRole('button', { name: /Importar ponto/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Enviar folha ao contador' })).toBeDisabled();
  await expect(page.getByText('Faltam 2 de 5 funcionário(s) ficarem aptos.')).toBeVisible();
  // Filtros e busca
  await page.getByRole('button', { name: 'Pendentes (1)' }).click();
  await expect(page.getByTestId('linha-funcionario')).toHaveCount(1);
  await page.getByRole('button', { name: 'Todos (5)' }).click();
  await page.getByLabel('Buscar funcionário').fill('instalador');
  await expect(page.getByTestId('linha-funcionario')).toHaveCount(1);
  await expect(page.getByTestId('linha-funcionario')).toContainText('Carlos Santos');
  await ctx.close();
});

test('painel lateral: ocorrências, dados, Esc fecha; confirmar sem ocorrências atualiza indicadores', async ({ browser }) => {
  const ctx = await browser.newContext();
  const e = estadoInicial();
  const reg = await sessaoSimulada(ctx, montar(e));
  const page = await abrir(ctx);
  await linha(page, 'João Silva').getByRole('button', { name: 'Editar João Silva' }).click();
  const painel = page.getByTestId('painel-funcionario');
  await expect(painel.getByRole('heading', { name: 'João Silva' })).toBeVisible();
  await expect(painel.getByTestId('ocorrencia')).toContainText('Horas extras');
  await expect(painel.getByTestId('ocorrencia')).toContainText('5 horas');
  await painel.getByRole('tab', { name: 'Dados' }).click();
  await expect(painel).toContainText('Técnico de Redes');
  await expect(painel).toContainText('R$ 2.200,00');
  await page.keyboard.press('Escape');
  await expect(painel).toHaveCount(0);
  // Pedro (sem ocorrências): confirmação explícita pelo menu
  await linha(page, 'Pedro Almeida').getByRole('button', { name: 'Mais ações para Pedro Almeida' }).click();
  await page.getByRole('menuitem', { name: 'Confirmar sem ocorrências' }).click();
  await expect(cartao(page, 'Aptos')).toHaveText('4');
  await expect(page.getByTestId('progresso')).toContainText('80%');
  expect(chamadas(reg, 'rpc/confirmar_conferencia_folha').at(-1)?.corpo).toMatchObject({ p_id_funcionario: ID.pedro, p_sem_ocorrencias: true, p_competencia: COMP });
  // Pendente: confirmação indisponível
  await linha(page, 'Maria Oliveira').getByRole('button', { name: 'Mais ações para Maria Oliveira' }).click();
  await expect(page.getByRole('menuitem', { name: 'Confirmar conferência' })).toBeDisabled();
  expect(reg.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('registrar ocorrência: validação por tipo antes do envio e payload correto', async ({ browser }) => {
  const ctx = await browser.newContext();
  const e = estadoInicial();
  const reg = await sessaoSimulada(ctx, montar(e));
  const page = await abrir(ctx);
  await page.getByRole('button', { name: 'Registrar ocorrência' }).click();
  await page.getByLabel('Funcionário', { exact: true }).selectOption(ID.pedro);
  await page.getByRole('button', { name: 'Continuar' }).click();
  const painel = page.getByTestId('painel-funcionario');
  await expect(painel.getByTestId('form-ocorrencia')).toBeVisible();
  await painel.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(painel.getByRole('alert')).toHaveText('Informe a quantidade.');
  expect(chamadas(reg, 'rpc/salvar_ocorrencia_folha')).toHaveLength(0);
  await painel.getByLabel('Tipo *').selectOption('faltas');
  await painel.getByLabel(/Quantidade/).fill('1');
  await painel.getByLabel(/Data inicial/).fill(COMP);
  await painel.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(painel.getByRole('alert')).toHaveText('Informe se há justificativa.');
  await painel.getByLabel('Justificativa *').selectOption('justificada');
  await painel.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Ocorrência registrada.' })).toBeVisible();
  expect(chamadas(reg, 'rpc/salvar_ocorrencia_folha')[0].corpo).toMatchObject({ p_id: null, p_id_empresa: EMPRESA.id, p_competencia: COMP, p_id_funcionario: ID.pedro,
    p_tipo: 'faltas', p_quantidade: 1, p_situacao_justificativa: 'justificada', p_data_inicio: COMP });
  await ctx.close();
});

test('envio consolidado: só com todos aptos, resumo, responsável e confirmação final', async ({ browser }) => {
  const ctx = await browser.newContext();
  const e = estadoInicial();
  e.funcionarios.forEach((f) => { f.situacao = 'apto'; f.pendencias = 0; f.conferencia = conf(f.ocorrencias === 0); });
  e.pendencias = [];
  const reg = await sessaoSimulada(ctx, montar(e));
  const page = await abrir(ctx);
  await expect(page.getByTestId('progresso')).toContainText('100%');
  await page.getByRole('button', { name: 'Enviar folha ao contador' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Enviar folha ao contador' });
  await expect(dialogo.getByTestId('resumo-envio')).toContainText('5 funcionário(s), todos aptos.');
  await expect(dialogo.getByTestId('resumo-envio')).toContainText('Horas extras (1)');
  await expect(dialogo.getByLabel('Responsável pelo envio *')).toHaveValue('Ana Souza');
  await expect(dialogo.getByRole('button', { name: 'Confirmar envio' })).toBeDisabled();
  await dialogo.getByLabel(/Confirmo que conferi/).check();
  await dialogo.getByRole('button', { name: 'Confirmar envio' }).click();
  await expect(page.getByTestId('status-competencia')).toHaveText('Enviada ao contador · v1');
  expect(chamadas(reg, 'rpc/enviar_folha_contador')[0].corpo).toMatchObject({ p_id_empresa: EMPRESA.id, p_competencia: COMP, p_responsavel: 'Ana Souza', p_confirmo: true });
  await expect(page.getByTestId('fluxo-folha').locator('li').nth(1)).toHaveAttribute('data-estado', 'concluido');
  // Depois do envio: somente leitura
  await expect(page.getByRole('button', { name: 'Registrar ocorrência' })).toBeDisabled();
  await expect(linha(page, 'João Silva').getByRole('button', { name: 'Ver João Silva' })).toBeVisible();
  await ctx.close();
});

test('sem contador habilitado o envio fica bloqueado com explicação', async ({ browser }) => {
  const ctx = await browser.newContext();
  const e = estadoInicial();
  e.contador = false;
  await sessaoSimulada(ctx, montar(e));
  const page = await abrir(ctx);
  await expect(page.getByText(/Nenhum contador com vínculo ativo/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar folha ao contador' })).toBeDisabled();
  await ctx.close();
});

test('contador: recebe a folha enviada e inicia o processamento; sem "processar" só lê', async ({ browser }) => {
  const ctx = await browser.newContext();
  const e = estadoInicial();
  e.status = 'enviada'; e.versao = 1;
  const reg = await sessaoSimulada(ctx, montar(e, 'contador'));
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.goto(`${BASE}/contador/empresas/${EMPRESA.id}/folha`);
  await expect(page.getByRole('heading', { name: 'Folha de Pagamento' })).toBeVisible({ timeout: 90000 });
  await expect(page.getByTestId('status-competencia')).toHaveText('Enviada ao contador · v1');
  await expect(page.getByRole('button', { name: 'Registrar ocorrência' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Iniciar processamento' }).click();
  await expect(page.getByTestId('status-competencia')).toHaveText('Em processamento · v1');
  await expect(page.getByRole('button', { name: 'Anexar documento' })).toBeVisible();
  expect(chamadas(reg, 'rpc/iniciar_processamento_folha')[0].corpo).toMatchObject({ p_id_competencia: 'c1' });
  await ctx.close();

  const ctx2 = await browser.newContext();
  await sessaoSimulada(ctx2, montar(estadoInicial(), 'contador', ['ver_folha']));
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/contador/empresas/${EMPRESA.id}/folha`);
  await expect(p2.getByRole('heading', { name: 'Folha de Pagamento' })).toBeVisible({ timeout: 90000 });
  await expect(p2.getByText('A empresa ainda não enviou a folha desta competência.')).toBeVisible();
  await ctx2.close();

  const ctx3 = await browser.newContext();
  await sessaoSimulada(ctx3, montar(estadoInicial(), 'contador', ['ver_documentos']));
  const p3 = await ctx3.newPage();
  await p3.goto(`${BASE}/contador/empresas/${EMPRESA.id}/folha`);
  await expect(p3.getByTestId('sem-permissao-modulo')).toBeVisible({ timeout: 90000 });
  await ctx3.close();
});

test('responsivo 320–1920px sem rolagem horizontal; painel vira tela cheia no celular', async ({ browser }) => {
  const ctx = await browser.newContext();
  await sessaoSimulada(ctx, montar(estadoInicial()));
  const page = await abrir(ctx, 1440);
  for (const largura of [320, 375, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `@${largura}`).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 375, height: 800 });
  await linha(page, 'João Silva').getByRole('button', { name: 'Editar João Silva' }).click();
  const caixa = await page.getByTestId('painel-funcionario').boundingBox();
  expect(caixa!.width).toBeGreaterThanOrEqual(370);
  await ctx.close();
});
