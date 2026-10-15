import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { sessaoSimulada, USUARIO_SIMULADO, type Rotas } from './apoio/sessao-simulada';

// E4 — Meu Contador (empresário) e Painel do Contador, com a API do Supabase SIMULADA: não acessa o banco.
// Regras de banco (vínculo, permissões, indicadores, histórico, isolamento) em tests/sql/meu-contador.mjs.

const BASE = 'http://localhost:3000';
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const dia = (d: number) => new Date(Date.parse(`${hoje}T12:00:00Z`) + d * 86400000).toISOString().slice(0, 10);
const EMPRESA = { id: 'aaaaaaaa-0000-4000-8000-000000000001', razao_social: 'EMPRESA EXEMPLO LTDA', nome_comercial: 'Empresa Exemplo', cnpj: '12345678000190', tipo_empresa: 'comum' };
const VINCULO = {
  id: 'v1', funcao: 'principal', status: 'ativo', permissoes: ['ver_documentos', 'gerenciar_obrigacoes'], origem: 'empresa', criado_em: `${hoje}T08:00:00Z`, aprovado_em: `${hoje}T09:00:00Z`,
  encerrado_em: null, motivo_encerramento: null, id_contador: 'c1', contador_nome: 'João da Silva', contador_email: 'joao@escritorio.test', id_escritorio: 'e1',
  escritorio_nome: 'Escritório Contábil Exemplo', nome_profissional: 'João da Silva', crc: 'SP-123456/O-1', cidade: 'São Paulo', estado: 'SP', especialidades: ['Simples Nacional'],
  foto_caminho: null, email_comercial: 'contato@exemplocontabil.test', telefone_comercial: '11999999999',
};
const RESUMO = { documentos_solicitados: 3, obrigacoes_pendentes: 2, aguardando_resposta: 1, aguardando_contador: 1, obrigacoes_atrasadas: 1, itens_concluidos: 7, documentos_compartilhados: 4 };
const HISTORICO = [
  { quando: `${hoje}T12:00:00Z`, tipo: 'solicitacao', descricao: 'Documento solicitado: Extrato bancário', autor: 'João da Silva' },
  { quando: `${hoje}T11:00:00Z`, tipo: 'vinculo', descricao: 'Permissões ou função do contador alteradas', autor: 'Ana Souza' },
];
const PAINEL = [
  { id_empresa: EMPRESA.id, nome: 'Empresa Exemplo', cnpj: '12345678000190', permissoes: ['ver_documentos', 'gerenciar_obrigacoes', 'ver_financeiro'], solicitacoes_aguardando_analise: 1,
    solicitacoes_aguardando_empresa: 2, obrigacoes_abertas: 3, obrigacoes_atrasadas: 1, obrigacoes_7_dias: 1, itens_concluidos: 5 },
  { id_empresa: 'bbbbbbbb-0000-4000-8000-000000000002', nome: 'Comércio Alfa', cnpj: '98765432000111', permissoes: ['ver_documentos'], solicitacoes_aguardando_analise: 0,
    solicitacoes_aguardando_empresa: 0, obrigacoes_abertas: null, obrigacoes_atrasadas: null, obrigacoes_7_dias: null, itens_concluidos: 2 },
];
const PROXIMAS = [{ id: 'o1', id_empresa: EMPRESA.id, empresa_nome: 'Empresa Exemplo', titulo: 'DAS Simples Nacional', data_vencimento: dia(-1), situacao: 'atrasada' }];

function rotas(papel: 'empresa' | 'contador', extra?: Rotas): Rotas {
  return (caminho, url, req) => {
    const e = extra?.(caminho, url, req);
    if (e) return e;
    if (caminho === 'perfis') return { corpo: [{ nome_completo: papel === 'empresa' ? 'Ana Souza' : 'João da Silva', tipo_usuario: papel === 'empresa' ? 'empresa' : 'contador', funcao_global: 'user' }] };
    if (caminho === 'usuarios_empresas') return { corpo: [{ empresas: EMPRESA }] };
    if (caminho === 'rpc/vinculos_da_empresa') return { corpo: [VINCULO] };
    if (caminho === 'rpc/resumo_relacionamento_contabil') return { corpo: RESUMO };
    if (caminho === 'rpc/historico_relacionamento_contabil') return { corpo: HISTORICO };
    if (caminho === 'rpc/painel_contador') return { corpo: PAINEL };
    if (caminho === 'rpc/proximas_obrigacoes_contador') return { corpo: PROXIMAS };
    if (caminho === 'rpc/responsaveis_obrigacoes') return { corpo: [{ id_usuario: USUARIO_SIMULADO.id, nome: 'Ana Souza', papel: 'empresa' }] };
    if (caminho === 'rpc/resumo_documentos_obrigacoes') return { corpo: { obrigacoes_atrasadas: 1, obrigacoes_7_dias: 1, obrigacoes_abertas: 2, obrigacoes_concluidas_mes: 0 } };
    if (caminho === 'solicitacoes_documentos') return { corpo: [{ id: 's1', id_empresa: EMPRESA.id, titulo: 'Extrato bancário', descricao: 'Setembro/2026', prazo: dia(2), status: 'pendente', id_documento: null,
      motivo_correcao: null, motivo_cancelamento: null, criado_em: `${hoje}T08:00:00Z`, respondido_em: null, analisado_em: null }] };
    if (caminho === 'documentos_empresa') return { corpo: [], total: 0 };
    if (caminho === 'obrigacoes_empresa_situacao') return { corpo: [], total: 0 };
    if (caminho === 'empresas') return { corpo: [] };
    if (caminho === 'rpc/convites_enviados') return { corpo: [] }; // E4.1 (leitura)
    return undefined;
  };
}

async function abrir(ctx: BrowserContext, caminho: string, titulo: string | RegExp): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`${BASE}${caminho}`);
  await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible({ timeout: 90000 });
  return page;
}
const textoRegiao = async (page: Page, nome: string) => ((await page.getByRole('region', { name: nome, exact: true }).textContent()) ?? '').replace(/ /g, ' ');

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

test('empresário: card do escritório, indicadores, abas, perfil completo e histórico', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas('empresa'));
  const page = await abrir(ctx, '/app/meu-contador', 'Meu Contador');
  await expect(page.getByText('Gerencie seu relacionamento contábil.')).toBeVisible();
  const card = page.getByRole('region', { name: 'Seu escritório contábil' });
  await expect(card).toContainText('Escritório Contábil Exemplo');
  await expect(card).toContainText('Vínculo ativo');
  await expect(card).toContainText('Responsável: João da Silva (Contador)');
  await expect(card).toContainText('CRC: SP-123456/O-1');
  await expect(card).toContainText('(11) 99999-9999');
  await expect.poll(() => textoRegiao(page, 'Documentos solicitados')).toContain('3');
  expect(await textoRegiao(page, 'Obrigações pendentes')).toContain('2');
  expect(await textoRegiao(page, 'Aguardando resposta')).toContain('1');
  expect(await textoRegiao(page, 'Itens concluídos')).toContain('7');
  // Aba Solicitações (padrão) reaproveita o módulo da E3
  await expect(page.getByTestId('solicitacao-Extrato bancário')).toBeVisible();
  // Perfil completo
  await page.getByRole('button', { name: 'Ver perfil completo' }).click();
  await expect(page.getByRole('dialog')).toContainText('Ver documentos');
  await expect(page.getByRole('dialog')).toContainText('Gerenciar obrigações');
  await page.keyboard.press('Escape');
  // Permissões: gestão de vínculos existente
  await page.getByRole('button', { name: 'Permissões', exact: true }).click();
  await expect(page.getByRole('button', { name: /Gerenciar/ }).first()).toBeVisible({ timeout: 15000 });
  // Documentos: só os compartilhados
  await page.getByRole('button', { name: 'Documentos', exact: true }).click();
  await expect(page.getByText('É o que o seu contador vê.')).toBeVisible();
  expect(registro.chamadas.some((c) => c.caminho === 'documentos_empresa')).toBe(true);
  // Histórico
  await page.getByRole('button', { name: 'Histórico', exact: true }).click();
  await expect(page.getByTestId('evento-historico')).toHaveCount(2);
  await expect(page.getByRole('region', { name: 'Histórico do relacionamento' })).toContainText('Documento solicitado: Extrato bancário');
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('empresário sem vínculo ativo vê o convite; falha nos indicadores não vira zero', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(ctx, rotas('empresa', (c) => (c === 'rpc/vinculos_da_empresa' ? { corpo: [] } : undefined)));
  const page = await abrir(ctx, '/app/meu-contador', 'Meu Contador');
  await expect(page.getByRole('heading', { name: 'Você ainda não tem um contador' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('link', { name: 'Buscar contador' }).first()).toHaveAttribute('href', '/app/meu-contador/buscar');
  await ctx.close();

  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(ctx2, rotas('empresa', (c) => (c === 'rpc/resumo_relacionamento_contabil' ? { status: 500, corpo: { message: 'falha' } } : undefined)));
  const p2 = await abrir(ctx2, '/app/meu-contador', 'Meu Contador');
  await expect.poll(() => textoRegiao(p2, 'Documentos solicitados')).toContain('Indisponível');
  expect(await textoRegiao(p2, 'Itens concluídos')).not.toMatch(/\b0\b/);
  await ctx2.close();
});

test('contador: painel com empresas, pendências, filtros e próximas obrigações', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await sessaoSimulada(ctx, rotas('contador'));
  const page = await abrir(ctx, '/contador', 'Painel do Contador');
  await expect.poll(() => textoRegiao(page, 'Empresas vinculadas')).toContain('2');
  expect(await textoRegiao(page, 'Pendências')).toContain('3'); // 1 análise + 1 atrasada + 1 a vencer
  expect(await textoRegiao(page, 'A vencer (7 dias)')).toContain('1');
  expect(await textoRegiao(page, 'Itens concluídos')).toContain('7');
  const exemplo = page.getByTestId('empresa-Empresa Exemplo');
  await expect(exemplo).toContainText('CNPJ 12.345.678/0001-90');
  await expect(exemplo).toContainText('3 pendências');
  await expect(exemplo).toContainText('Atrasada');
  await expect(exemplo).toHaveAttribute('href', `/contador/empresas/${EMPRESA.id}`);
  // Empresa sem a permissão de obrigações: situação explícita, não "em dia"
  await expect(page.getByTestId('empresa-Comércio Alfa')).toContainText('Sem acesso a obrigações');
  await page.getByPlaceholder('Buscar empresa ou CNPJ...').fill('alfa');
  await expect(page.getByTestId('empresa-Empresa Exemplo')).toHaveCount(0);
  await page.getByPlaceholder('Buscar empresa ou CNPJ...').fill('');
  await page.getByRole('combobox').first().selectOption('atrasada');
  await expect(page.getByTestId('empresa-Comércio Alfa')).toHaveCount(0);
  await expect(page.getByTestId('proxima-DAS Simples Nacional')).toContainText('Atrasada');
  await expect(page.getByTestId('proxima-DAS Simples Nacional')).toContainText('Empresa Exemplo');
  await ctx.close();
});

test('contador: espaço da empresa respeita permissões; empresa não vinculada é negada', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(ctx, rotas('contador'));
  const page = await abrir(ctx, `/contador/empresas/${EMPRESA.id}`, 'Empresa Exemplo');
  const abas = page.getByRole('navigation', { name: 'Espaço da empresa' });
  for (const a of ['Visão geral', 'Solicitações', 'Documentos', 'Obrigações', 'Financeiro', 'Tarefas']) await expect(abas.getByRole('link', { name: a, exact: true })).toBeVisible();
  await abas.getByRole('link', { name: 'Solicitações', exact: true }).click();
  await expect(page.getByTestId('solicitacao-Extrato bancário')).toBeVisible({ timeout: 15000 });
  const alfa = await abrir(ctx, '/contador/empresas/bbbbbbbb-0000-4000-8000-000000000002', 'Comércio Alfa');
  const abasAlfa = alfa.getByRole('navigation', { name: 'Espaço da empresa' });
  await expect(abasAlfa.getByRole('link', { name: 'Obrigações', exact: true })).toHaveCount(0);
  await expect(abasAlfa.getByRole('link', { name: 'Financeiro', exact: true })).toHaveCount(0);
  const negada = await ctx.newPage();
  await negada.goto(`${BASE}/contador/empresas/cccccccc-0000-4000-8000-000000000003`);
  await expect(negada.getByText('Você não tem acesso a esta empresa.')).toBeVisible({ timeout: 90000 });
  await ctx.close();
});

test('layout sem rolagem lateral de 320 a 1920px (Meu Contador e Painel do Contador)', async ({ browser }) => {
  for (const [papel, caminho, titulo] of [['empresa', '/app/meu-contador', 'Meu Contador'], ['contador', '/contador', 'Painel do Contador'], ['contador', `/contador/empresas/${EMPRESA.id}`, 'Empresa Exemplo']] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await sessaoSimulada(ctx, rotas(papel));
    const page = await abrir(ctx, caminho, titulo);
    await page.waitForTimeout(500);
    for (const largura of [320, 375, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.waitForTimeout(200);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${caminho} @${largura}`).toBeLessThanOrEqual(1);
    }
    await ctx.close();
  }
});
