import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { sessaoSimulada, type Rotas } from './apoio/sessao-simulada';

// Navegação do contador: menu lateral = escritório; espaço da empresa = cabeçalho + menu horizontal (rotas reais).
// API do Supabase SIMULADA (não acessa banco).
const BASE = 'http://localhost:3000';
const LOGAR = { id: 'aaaaaaaa-0000-4000-8000-0000000000a1', nome: 'Logar Digital', cnpj: '10561685000107' };
const UNNIFY = { id: 'bbbbbbbb-0000-4000-8000-0000000000b2', nome: 'UNNIFY', cnpj: '24214920000170' };
const linha = (e: typeof LOGAR, permissoes: string[], extra: Record<string, unknown> = {}) => ({ id_empresa: e.id, nome: e.nome, cnpj: e.cnpj, permissoes,
  solicitacoes_aguardando_analise: 2, solicitacoes_aguardando_empresa: 1, obrigacoes_abertas: 3, obrigacoes_atrasadas: 0, obrigacoes_7_dias: 3, itens_concluidos: 0, ...extra });
const PAINEL = [
  linha(LOGAR, ['ver_documentos', 'gerenciar_obrigacoes', 'gerenciar_impostos', 'ver_financeiro', 'gerenciar_agenda']),
  linha(UNNIFY, ['ver_documentos'], { solicitacoes_aguardando_analise: 7, obrigacoes_abertas: null, obrigacoes_atrasadas: null, obrigacoes_7_dias: null }),
];
const rotas: Rotas = (c, u, req) => {
  if (c === 'perfis') return { corpo: [{ nome_completo: 'Salles Contabilidade', tipo_usuario: 'contador', funcao_global: 'user' }] };
  if (c === 'rpc/painel_contador') return { corpo: PAINEL };
  if (c === 'rpc/resumo_impostos') return { corpo: { a_pagar: 1250, qtd_a_pagar: 1, vencidos: 0, vencendo_7: 1, guias: 0, pagos_90: 0 } };
  if (c === 'rpc/buscar_impostos') {
    const b = JSON.parse(req.postData() ?? '{}') as { p_id_empresa: string };
    return { corpo: b.p_id_empresa === LOGAR.id ? [{ id: 'i1', id_parcelamento: null, numero_parcela: null, tipo: 'das', nome: 'DAS da Logar', orgao: 'Receita Federal', competencia: '2026-09-01',
      vencimento: '2026-10-20', valor: 1250, descricao: null, situacao: 'pendente', data_pagamento: null, data_pagamento_informada: null, id_lancamento: 'l1', guia_caminho: null, guia_nome: null,
      guia_tamanho: null, guia_enviada_em: null, comprovantes: 0, total: 1 }] : [] };
  }
  if (c === 'rpc/pode_gerenciar_financeiro') return { corpo: false };
  if (c === 'rpc/agenda_contador') return { corpo: [] };
  if (c === 'notificacoes' || c === 'empresas') return { corpo: [] };
  return undefined;
};
async function abrir(ctx: BrowserContext, caminho: string): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`${BASE}${caminho}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 90000 });
  return page;
}
const menuEmpresa = (p: Page) => p.getByRole('navigation', { name: 'Espaço da empresa' });
const cabecalho = (p: Page) => p.getByRole('region', { name: 'Empresa selecionada' });

test.describe.configure({ mode: 'serial' });
test.setTimeout(4 * 60 * 1000);

test('menu lateral só com o escritório; espaço da empresa com cabeçalho e menu horizontal por permissão', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1000 } });
  await sessaoSimulada(ctx, rotas);
  const page = await abrir(ctx, `/contador/empresas/${LOGAR.id}`);
  const lateral = page.getByRole('navigation', { name: 'Menu principal' });
  expect(await lateral.getByRole('link').allTextContents()).toEqual(['Início', 'Minhas empresas', 'Agenda', 'Tarefas', 'Perfil profissional', 'Minha conta']);
  await expect(lateral.locator('[aria-disabled="true"]')).toHaveCount(0); // sem itens "mortos"
  await expect(lateral.getByRole('link', { name: 'Minhas empresas' })).toHaveAttribute('aria-current', 'page');
  // Cabeçalho da empresa
  await expect(cabecalho(page).getByRole('heading', { level: 1 })).toHaveText('Logar Digital');
  await expect(cabecalho(page)).toContainText('Vínculo ativo');
  await expect(page.getByTestId('cnpj-empresa')).toHaveText('CNPJ 10.561.685/0001-07');
  // Menu horizontal na ordem, só módulos autorizados; Visão geral ativa
  expect(await menuEmpresa(page).getByRole('link').allTextContents()).toEqual(['Visão geral', 'Solicitações', 'Documentos', 'Obrigações', 'Impostos', 'Financeiro', 'Agenda', 'Tarefas', 'Saúde Empresarial']);
  await expect(menuEmpresa(page).getByRole('link', { name: 'Visão geral' })).toHaveAttribute('aria-current', 'page');
  // Nenhum menu duplicado: um só menu da empresa e nenhum módulo da empresa no menu lateral
  expect(await page.getByRole('navigation', { name: 'Espaço da empresa' }).count()).toBe(1);
  for (const m of ['Documentos', 'Obrigações', 'Impostos', 'Financeiro']) await expect(lateral.getByRole('link', { name: m })).toHaveCount(0);
  // Visão geral: indicadores existentes e permissões
  await expect(page.getByRole('region', { name: 'Solicitações para analisar' })).toContainText('2');
  await expect(page.getByRole('region', { name: 'Permissões concedidas' })).toContainText('Gerenciar impostos e parcelamentos');
  // Empresa com menos permissões
  await page.goto(`${BASE}/contador/empresas/${UNNIFY.id}`);
  await expect(cabecalho(page).getByRole('heading', { level: 1 })).toHaveText('UNNIFY', { timeout: 30000 });
  expect(await menuEmpresa(page).getByRole('link').allTextContents()).toEqual(['Visão geral', 'Solicitações', 'Documentos', 'Tarefas']);
  await expect(page.getByRole('region', { name: 'Obrigações abertas' })).toContainText('Sem permissão');
  await ctx.close();
});

test('navegação entre módulos com rotas reais: contexto mantido, F5, voltar/avançar, teclado e links antigos com #', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await sessaoSimulada(ctx, rotas);
  const page = await abrir(ctx, `/contador/empresas/${LOGAR.id}`);
  await menuEmpresa(page).getByRole('link', { name: 'Impostos' }).click();
  await expect(page).toHaveURL(new RegExp(`/contador/empresas/${LOGAR.id}/impostos$`), { timeout: 30000 });
  await expect(page.getByTestId('imposto-DAS da Logar')).toBeVisible({ timeout: 30000 });
  await expect(cabecalho(page)).toContainText('Logar Digital');
  await expect(menuEmpresa(page).getByRole('link', { name: 'Impostos' })).toHaveAttribute('aria-current', 'page');
  await menuEmpresa(page).getByRole('link', { name: 'Tarefas' }).click();
  await expect(page).toHaveURL(new RegExp(`/contador/empresas/${LOGAR.id}/tarefas$`), { timeout: 30000 });
  await expect(page.getByText('As tarefas internas da empresa pertencem à equipe dela.')).toBeVisible();
  // Voltar / avançar
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/impostos$`), { timeout: 30000 });
  await expect(menuEmpresa(page).getByRole('link', { name: 'Impostos' })).toHaveAttribute('aria-current', 'page');
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/tarefas$`), { timeout: 30000 });
  // F5 mantém rota, módulo e empresa
  await page.reload();
  await expect(cabecalho(page)).toContainText('Logar Digital', { timeout: 60000 });
  await expect(menuEmpresa(page).getByRole('link', { name: 'Tarefas' })).toHaveAttribute('aria-current', 'page');
  // Teclado
  await menuEmpresa(page).getByRole('link', { name: 'Agenda' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/contador/empresas/${LOGAR.id}/agenda$`), { timeout: 30000 });
  await expect(page.getByRole('heading', { level: 2, name: 'Agenda' })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1); // um só h1 (o nome da empresa)
  // Links antigos (#aba, inclusive de notificações já enviadas) abrem o módulo certo
  await page.goto(`${BASE}/contador/empresas/${LOGAR.id}#impostos`);
  await expect(page).toHaveURL(new RegExp(`/contador/empresas/${LOGAR.id}/impostos$`), { timeout: 60000 });
  await ctx.close();
});

test('trocar empresa: atualiza cabeçalho e conteúdo, mantém o módulo quando permitido, sem dados da anterior', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await sessaoSimulada(ctx, rotas);
  const page = await abrir(ctx, `/contador/empresas/${LOGAR.id}/impostos`);
  await expect(page.getByTestId('imposto-DAS da Logar')).toBeVisible({ timeout: 30000 });
  await cabecalho(page).getByRole('button', { name: 'Trocar empresa' }).click();
  const seletor = page.getByRole('dialog', { name: 'Trocar empresa' });
  await expect(seletor.getByRole('button')).toHaveCount(1); // só a outra empresa vinculada (a atual não aparece)
  await expect(seletor).toContainText('CNPJ 24.214.920/0001-70');
  await page.keyboard.press('Escape');
  await expect(seletor).toHaveCount(0);
  await cabecalho(page).getByRole('button', { name: 'Trocar empresa' }).click();
  await page.getByRole('dialog', { name: 'Trocar empresa' }).getByRole('button', { name: /UNNIFY/ }).click();
  // UNNIFY não tem "Gerenciar impostos": vai para a Visão geral da nova empresa
  await expect(page).toHaveURL(new RegExp(`/contador/empresas/${UNNIFY.id}$`), { timeout: 30000 });
  await expect(cabecalho(page).getByRole('heading', { level: 1 })).toHaveText('UNNIFY');
  await expect(page.getByTestId('cnpj-empresa')).toHaveText('CNPJ 24.214.920/0001-70');
  await expect(page.getByText('DAS da Logar')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Solicitações para analisar' })).toContainText('7');
  // Módulo permitido nas duas: mantém o módulo ao trocar
  await menuEmpresa(page).getByRole('link', { name: 'Documentos' }).click();
  await expect(page).toHaveURL(new RegExp(`/contador/empresas/${UNNIFY.id}/documentos$`), { timeout: 30000 });
  await cabecalho(page).getByRole('button', { name: 'Trocar empresa' }).click();
  await page.getByRole('dialog', { name: 'Trocar empresa' }).getByRole('button', { name: /Logar Digital/ }).click();
  await expect(page).toHaveURL(new RegExp(`/contador/empresas/${LOGAR.id}/documentos$`), { timeout: 30000 });
  await expect(cabecalho(page).getByRole('heading', { level: 1 })).toHaveText('Logar Digital');
  await ctx.close();
});

test('acesso: módulo sem permissão por URL direta e empresa sem vínculo continuam negados', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await sessaoSimulada(ctx, rotas);
  const page = await abrir(ctx, `/contador/empresas/${UNNIFY.id}/impostos`);
  await expect(page.getByTestId('sem-permissao-modulo')).toContainText('Impostos: sem permissão nesta empresa.', { timeout: 30000 });
  await expect(page.getByTestId('modulo-impostos')).toHaveCount(0);
  const negada = await ctx.newPage();
  await negada.goto(`${BASE}/contador/empresas/cccccccc-0000-4000-8000-0000000000c3/documentos`);
  await expect(negada.getByText('Você não tem acesso a esta empresa.')).toBeVisible({ timeout: 90000 });
  await expect(negada.getByRole('navigation', { name: 'Espaço da empresa' })).toHaveCount(0);
  await ctx.close();
});

test('responsivo de 320 a 1920px: menu horizontal rola sem estourar a página; no celular o seletor ocupa a largura', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await sessaoSimulada(ctx, rotas);
  const page = await abrir(ctx, `/contador/empresas/${LOGAR.id}/financeiro`);
  await expect(menuEmpresa(page)).toBeVisible({ timeout: 30000 });
  for (const largura of [320, 375, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `@${largura}`).toBeLessThanOrEqual(1);
    const altura = await menuEmpresa(page).evaluate((el) => el.getBoundingClientRect().height);
    expect(altura, `menu compacto @${largura}`).toBeLessThan(70); // uma linha (rola na horizontal), sem quebrar em várias
  }
  await page.setViewportSize({ width: 375, height: 800 });
  // Item ativo visível dentro do menu rolável
  const ativo = menuEmpresa(page).getByRole('link', { name: 'Financeiro' });
  await expect(ativo).toBeInViewport();
  await cabecalho(page).getByRole('button', { name: 'Trocar empresa' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await ctx.close();
});
