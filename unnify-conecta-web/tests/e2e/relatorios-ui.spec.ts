import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { sessaoSimulada, type Rotas } from './apoio/sessao-simulada';

// Relatórios com a API do Supabase SIMULADA (não acessa banco). Cálculos e acesso em tests/sql/relatorios.mjs.
const BASE = 'http://localhost:3000';
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const mes = `${hoje.slice(0, 7)}-01`;
const fimMes = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);
const EMPRESA = { id: 'aaaaaaaa-0000-4000-8000-000000000001', razao_social: 'EMPRESA EXEMPLO LTDA', nome_comercial: 'Empresa Exemplo', cnpj: '12345678000190', tipo_empresa: 'comum' };
const REL = {
  periodo_inicio: mes, periodo_fim: fimMes, anterior_inicio: '2026-09-01', anterior_fim: '2026-09-30', hoje,
  receitas: 42850, receitas_anterior: 38258.93, receitas_qtd: 12, despesas: 28400, despesas_anterior: 26296.3, despesas_qtd: 20, resultado: 14450, resultado_anterior: 11962.63,
  nao_operacionais_entradas: 5000, nao_operacionais_saidas: 0,
  a_receber: { total: 8250, vencido: 2620, vencendo_7: 2180, em_dia: 3450, qtd: 9 }, a_pagar: { total: 5320, vencido: 1420, vencendo_7: 1420, em_dia: 2480, qtd: 6 },
  despesas_por_categoria: [{ id_categoria: 'k1', categoria: 'Pessoal', cor: '#ea580c', icone: 'users', valor: 9088 }, { id_categoria: 'k2', categoria: 'Aluguel', cor: '#3b82f6', icone: 'house', valor: 19312 }],
  serie: Array.from({ length: 12 }, (_, i) => ({ mes: `2026-${String(((i + 10) % 12) + 1).padStart(2, '0')}-01`, receitas: 1000 * i, despesas: 700 * i, entradas: 1100 * i, saidas: 800 * i })),
};
const LANC = [
  { id: 'l1', tipo: 'receita', descricao: '=Pagamento de cliente', valor: 1850, categoria_nome: 'Serviços', data_competencia: hoje, data_vencimento: hoje, data_pagamento: hoje, status: 'pago', situacao: 'pago', contraparte: 'João Silva', natureza_financeira: 'operacional' },
  { id: 'l2', tipo: 'despesa', descricao: 'Aluguel do escritório', valor: 2500, categoria_nome: 'Aluguel', data_competencia: hoje, data_vencimento: hoje, data_pagamento: null, status: 'pendente', situacao: 'vencido', contraparte: 'Imobiliária Real', natureza_financeira: 'operacional' },
];
const consultas: URL[] = [];
function rotas(extra?: Rotas): Rotas {
  return (c, u, req) => {
    const e = extra?.(c, u, req);
    if (e) return e;
    if (c === 'perfis') return { corpo: [{ nome_completo: 'Ana Souza', tipo_usuario: 'empresa', funcao_global: 'user' }] };
    if (c === 'usuarios_empresas') return { corpo: [{ empresas: EMPRESA }] };
    if (c === 'categorias_financeiras') return { corpo: [{ id: 'k2', tipo: 'despesa', nome: 'Aluguel', cor: '#3b82f6', icone: 'house', ativa: true }] };
    if (c === 'rpc/relatorio_financeiro') return { corpo: REL };
    if (c === 'lancamentos_financeiros_situacao') { consultas.push(u); return { corpo: LANC, total: 23 }; }
    if (c === 'rpc/resumo_clientes') return { corpo: { total: 248, ativos: 186, inativos: 38, prospects: 24, novos_mes: 24, novos_mes_anterior: 20, a_receber: 8450, a_receber_vencido: 300, evolucao: [{ mes, novos: 24, cadastrados: 248 }] } };
    if (c === 'rpc/resumo_folha') return { corpo: [{ nome: 'Andressa', total: 1771, pago: 1771, pendente: 0, situacao: 'pago', adicionais: 150, descontos: 0 }] };
    if (c === 'rpc/evolucao_folha') return { corpo: [{ competencia: mes, previsto: 1771, pago: 1771 }] };
    if (c === 'notificacoes') return { corpo: [] };
    return undefined;
  };
}
async function abrir(ctx: BrowserContext): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/relatorios`);
  await expect(page.getByRole('heading', { level: 1, name: 'Relatórios' })).toBeVisible({ timeout: 90000 });
  return page;
}
const chamadas = (r: { chamadas: { caminho: string; corpo: unknown }[] }, c: string) => r.chamadas.filter((x) => x.caminho === c);
const texto = async (p: Page, nome: string) => ((await p.getByRole('region', { name: nome, exact: true }).textContent()) ?? '').replace(/ /g, ' ');

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

test('visão geral: indicadores com comparação, contas e detalhamento até os registros de origem', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas());
  const page = await abrir(ctx);
  await expect(page.getByRole('navigation', { name: 'Módulos do departamento' }).getByRole('link', { name: 'Relatórios' })).toHaveAttribute('href', '/app/relatorios');
  await expect.poll(() => texto(page, 'Receitas')).toContain('R$ 42.850,00');
  expect(await texto(page, 'Receitas')).toContain('12% vs. período anterior');
  expect(await texto(page, 'Resultado gerencial')).toContain('não é lucro contábil');
  expect(await texto(page, 'A receber')).toContain('R$ 2.620,00 vencido');
  expect(await texto(page, 'Contas a pagar')).toContain('Vencendo (7 dias)');
  expect(chamadas(registro, 'rpc/relatorio_financeiro')[0].corpo).toMatchObject({ p_id_empresa: EMPRESA.id, p_inicio: mes, p_fim: fimMes, p_id_categoria: null });
  await expect(page.getByTestId('tabela-detalhe')).toContainText('Aluguel do escritório');
  consultas.length = 0;
  await page.getByRole('button', { name: 'Receitas: ver registros' }).click();
  await expect(page.getByRole('heading', { name: 'Receitas realizadas' })).toBeVisible();
  await expect.poll(() => consultas.length).toBeGreaterThan(0);
  const q = consultas.at(-1)!.searchParams;
  expect(q.get('tipo')).toBe('eq.receita');
  expect(q.get('status')).toBe('eq.pago');
  expect(q.get('natureza_financeira')).toBe('eq.operacional');
  expect(q.getAll('data_pagamento')).toEqual([`gte.${mes}`, `lte.${fimMes}`]);
  expect(q.get('id_empresa')).toBe(`eq.${EMPRESA.id}`);
  await page.getByLabel('Filtrar por categoria').selectOption('k2');
  await expect.poll(() => chamadas(registro, 'rpc/relatorio_financeiro').some((x) => (x.corpo as { p_id_categoria: string }).p_id_categoria === 'k2')).toBe(true);
  await expect.poll(() => consultas.some((u) => u.searchParams.get('id_categoria') === 'eq.k2')).toBe(true);
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('exportação CSV (mesmos filtros, sem injeção de fórmula) e PDF', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await sessaoSimulada(ctx, rotas());
  const page = await abrir(ctx);
  await expect.poll(() => texto(page, 'Receitas')).toContain('R$ 42.850,00');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^relatorio-todos-\d{4}-\d{2}-01-a-\d{4}-\d{2}-\d{2}\.csv$/);
  const partes: Buffer[] = [];
  for await (const p of await download.createReadStream()) partes.push(p as Buffer);
  const csv = Buffer.concat(partes).toString('utf8');
  expect(csv.startsWith('﻿Data;Descrição;Categoria')).toBe(true);
  expect(csv).toContain("'=Pagamento de cliente");
  expect(csv).toContain('2500,00');
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'PDF' }).click()]);
  await expect(popup.getByRole('heading', { name: /Relatório financeiro — Empresa Exemplo/ })).toBeVisible({ timeout: 15000 });
  await expect(popup.locator('body')).toContainText('Não é lucro contábil');
  await expect(popup.locator('body')).toContainText('=Pagamento de cliente');
  expect(await popup.locator('script').count()).toBe(1);
  await ctx.close();
});

test('abas Clientes e Funcionários; estados de erro e indisponível; layout de 320 a 1920px', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(ctx, rotas());
  const page = await abrir(ctx);
  await page.getByRole('tab', { name: 'Clientes' }).click();
  await expect(page.getByTestId('relatorio-clientes')).toContainText('248');
  await page.getByRole('tab', { name: 'Funcionários' }).click();
  await expect(page.getByTestId('relatorio-funcionarios')).toContainText('R$ 1.771,00');
  await ctx.close();

  const ausente = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(ausente, rotas((c) => (c === 'rpc/relatorio_financeiro' || c === 'rpc/resumo_folha' ? { status: 404, corpo: { code: 'PGRST202', message: 'Could not find the function in the schema cache' } } : undefined)));
  const pa = await abrir(ausente);
  await expect(pa.getByTestId('relatorios-indisponivel')).toContainText('falta aplicar uma atualização do banco', { timeout: 15000 });
  expect(await texto(pa, 'Receitas')).toContain('Indisponível');
  await ausente.close();

  const erro = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(erro, rotas((c) => (c === 'rpc/relatorio_financeiro' ? { status: 500, corpo: { message: 'falha', code: 'XX000' } } : undefined)));
  const pe = await abrir(erro);
  await expect(pe.getByRole('alert').filter({ hasText: 'Não foi possível gerar o relatório.' })).toBeVisible({ timeout: 15000 });
  await expect(pe.getByText('R$ 0,00')).toHaveCount(0);
  await erro.close();

  const l = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await sessaoSimulada(l, rotas());
  const pl = await abrir(l);
  await expect(pl.getByTestId('tabela-detalhe')).toBeVisible({ timeout: 15000 });
  for (const largura of [320, 375, 768, 1024, 1440, 1920]) {
    await pl.setViewportSize({ width: largura, height: 900 });
    await pl.waitForTimeout(200);
    expect(await pl.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `@${largura}`).toBeLessThanOrEqual(1);
  }
  await l.close();
});
