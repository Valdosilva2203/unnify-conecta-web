import { test, expect, type Page } from '@playwright/test';
import { sessaoSimulada, type Rotas } from './apoio/sessao-simulada';

// Portal da Empresa: menu lateral por departamentos + cabeçalho do módulo + barra de módulos em pílulas. API do Supabase SIMULADA.
const BASE = 'http://localhost:3000';
const EMPRESA = { id: 'aaaaaaaa-0000-4000-8000-000000000001', razao_social: 'ALFA LTDA', nome_comercial: 'Alfa', cnpj: '12345678000190', tipo_empresa: 'comum' };
const DEPARTAMENTOS = ['Início', 'Administrativo', 'Financeiro', 'Recursos Humanos', 'Comercial', 'Marketing', 'Compras e Estoque', 'Contabilidade e Obrigações'];

const rotas: Rotas = (c) => {
  if (c === 'perfis') return { corpo: [{ nome_completo: 'Ana Souza', tipo_usuario: 'empresa', funcao_global: 'user' }] };
  if (c === 'usuarios_empresas') return { corpo: [{ empresas: EMPRESA }] };
  if (c.startsWith('rpc/')) return { status: 500, corpo: { message: 'falha simulada', code: 'XX000' } }; // as telas mostram o estado de erro; a navegação é o que se testa
  return undefined;
};
const lateral = (p: Page) => p.getByRole('navigation', { name: 'Menu principal' });
const barra = (p: Page) => p.getByRole('navigation', { name: 'Módulos do departamento' });
async function abrir(p: Page, caminho: string, titulo: string) {
  await p.goto(`${BASE}${caminho}`);
  await expect(p.getByRole('heading', { level: 1, name: titulo, exact: true })).toBeVisible({ timeout: 90000 });
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

test('menu lateral só com departamentos; Marketing reservado; módulos reais em pílulas; ativo em laranja', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1000 } });
  await sessaoSimulada(ctx, rotas);
  const page = await ctx.newPage();
  await abrir(page, '/app/obrigacoes', 'Obrigações');
  const itens = lateral(page).locator('a, [aria-disabled="true"]');
  expect((await itens.allTextContents()).map((t) => t.replace('Em breve', '').trim())).toEqual(DEPARTAMENTOS);
  // Departamento da rota destacado; Marketing sem link e marcado como reservado
  await expect(lateral(page).getByRole('link', { name: 'Contabilidade e Obrigações' })).toHaveAttribute('aria-current', 'page');
  await expect(lateral(page).getByRole('link', { name: 'Financeiro' })).not.toHaveAttribute('aria-current', 'page');
  await expect(lateral(page).getByRole('link', { name: 'Marketing' })).toHaveCount(0);
  await expect(lateral(page).locator('[aria-disabled="true"]')).toContainText('Marketing');
  // Cabeçalho do módulo: um único h1 (o do módulo real) e a barra com os módulos do departamento
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  expect(await barra(page).getByRole('link').allTextContents()).toEqual(['Meu contador', 'Documentos', 'Obrigações', 'Impostos', 'Saúde Empresarial']);
  await expect(barra(page).getByRole('link', { name: 'Obrigações' })).toHaveAttribute('aria-current', 'page');
  await expect(barra(page).getByRole('link', { name: 'Obrigações' })).toHaveClass(/bg-orange-600/);
  await expect(barra(page).getByRole('link', { name: 'Impostos' })).not.toHaveClass(/bg-orange-600/);
  // Rotas reais: navegar pela pílula, voltar/avançar e atualizar mantêm departamento e módulo
  await barra(page).getByRole('link', { name: 'Impostos' }).click();
  await expect(page).toHaveURL(/\/app\/impostos$/, { timeout: 30000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Impostos', exact: true })).toBeVisible();
  await expect(barra(page).getByRole('link', { name: 'Impostos' })).toHaveAttribute('aria-current', 'page');
  await expect(lateral(page).getByRole('link', { name: 'Contabilidade e Obrigações' })).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/obrigacoes$/);
  await expect(barra(page).getByRole('link', { name: 'Obrigações' })).toHaveAttribute('aria-current', 'page');
  await page.goForward();
  await expect(barra(page).getByRole('link', { name: 'Impostos' })).toHaveAttribute('aria-current', 'page');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Impostos', exact: true })).toBeVisible({ timeout: 90000 });
  await expect(barra(page).getByRole('link', { name: 'Impostos' })).toHaveAttribute('aria-current', 'page');
  await ctx.close();
});

test('cada departamento abre o módulo inicial real e mostra só os seus módulos', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1000 } });
  await sessaoSimulada(ctx, rotas);
  const page = await ctx.newPage();
  await abrir(page, '/app/obrigacoes', 'Obrigações');
  const casos: [string, RegExp, string, string[] | null][] = [
    ['Administrativo', /\/app\/tarefas$/, 'Tarefas', ['Tarefas', 'Anotações', 'Agenda', 'Minha conta']],
    ['Financeiro', /\/app\/financeiro$/, 'Financeiro', ['Financeiro', 'Recibos', 'Relatórios']],
    ['Recursos Humanos', /\/app\/funcionarios$/, 'Funcionários', ['Funcionários', 'Folha de Pagamento', 'Controle de Ponto']],
    ['Comercial', /\/app\/clientes$/, 'Clientes', ['Clientes', 'Vendas']],
    ['Compras e Estoque', /\/app\/compras$/, 'Compras', ['Compras', 'Estoque']],
    ['Contabilidade e Obrigações', /\/app\/meu-contador$/, 'Meu Contador', ['Meu contador', 'Documentos', 'Obrigações', 'Impostos', 'Saúde Empresarial']],
  ];
  for (const [dep, url, h1, modulos] of casos) {
    await lateral(page).getByRole('link', { name: dep, exact: true }).click();
    await expect(page).toHaveURL(url, { timeout: 30000 });
    await expect(page.getByRole('heading', { level: 1, name: h1, exact: true })).toBeVisible({ timeout: 30000 });
    await expect(lateral(page).getByRole('link', { name: dep, exact: true })).toHaveAttribute('aria-current', 'page');
    if (modulos) expect(await barra(page).getByRole('link').allTextContents(), dep).toEqual(modulos);
    else await expect(barra(page)).toHaveCount(0, { timeout: 5000 });
  }
  // Dentro de um departamento, trocar de módulo mantém o departamento destacado
  await lateral(page).getByRole('link', { name: 'Comercial', exact: true }).click();
  await barra(page).getByRole('link', { name: 'Vendas' }).click();
  await expect(page).toHaveURL(/\/app\/vendas$/, { timeout: 30000 });
  await expect(lateral(page).getByRole('link', { name: 'Comercial', exact: true })).toHaveAttribute('aria-current', 'page');
  await ctx.close();
});

test('layout de 320 a 1920px: barra de módulos rola sem estourar a página', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await sessaoSimulada(ctx, rotas);
  const page = await ctx.newPage();
  await abrir(page, '/app/obrigacoes', 'Obrigações');
  for (const largura of [320, 375, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `@${largura}`).toBeLessThanOrEqual(1);
  }
  await ctx.close();
});
