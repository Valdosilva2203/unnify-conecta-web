import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { sessaoSimulada, type Rotas } from './apoio/sessao-simulada';

// Recibos com a API do Supabase SIMULADA (não acessa banco). Regras de banco (numeração, duplicidade, parcial, imutabilidade,
// cancelamento, conciliação, RLS, contador, concorrência) em tests/sql/recibos.mjs.
const BASE = 'http://localhost:3000';
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const EMPRESA = { id: 'aaaaaaaa-0000-4000-8000-000000000001', razao_social: 'EMPRESA EXEMPLO LTDA', nome_comercial: 'Empresa Exemplo', cnpj: '12345678000190', tipo_empresa: 'comum' };
const linha = (id: string, numero: number, extra: Record<string, unknown> = {}) => ({ id, numero, tipo: 'recebimento', situacao: 'emitido', origem: 'financeiro', conciliado: true, pessoa_nome: 'João Silva',
  descricao: 'Corte de cabelo', valor: 40, data_pagamento: hoje, forma_pagamento: 'pix', parcial: false, id_cliente: 'c1', emitido_em: `${hoje}T17:32:00Z`, total: 48, ...extra });
const LINHAS = [linha('r1', 125), linha('r2', 124, { pessoa_nome: 'Maria Costa', origem: 'manual', conciliado: false, valor: 120, descricao: 'Neto limpeza' }),
  linha('r3', 120, { situacao: 'cancelado', pessoa_nome: 'Juliana Dias', valor: 150 }), linha('r4', 118, { tipo: 'pagamento', pessoa_nome: 'Atacado Central', valor: 1250, descricao: 'Pagamento de compra' })];
const DOC = { ...LINHAS[0], pessoa_documento: '52998224725', valor_extenso: 'quarenta reais', valor_total_operacao: null, emitente_nome: 'EMPRESA EXEMPLO LTDA', emitente_documento: '12345678000190',
  emitente_cidade: 'Augustinópolis/TO', emitente_contato: '(63) 99999-0000', observacoes: null, motivo_cancelamento: null, cancelado_em: null, id_lancamento: 'l1', id_venda: 'v215', id_compra: null };
const DOC_MANUAL = { ...DOC, ...LINHAS[1], valor_extenso: 'cento e vinte reais', pessoa_documento: null, id_lancamento: null, id_venda: null, parcial: true, valor_total_operacao: 300 };
const PAGAMENTOS = [{ id: 'l9', tipo: 'receita', descricao: 'Venda #000215', valor: 85, data_pagamento: hoje, contraparte: 'Ana Lima', cliente: 'Ana Lima', id_venda: 'v215', id_compra: null },
  { id: 'l8', tipo: 'despesa', descricao: 'Compra #000118', valor: 1250, data_pagamento: hoje, contraparte: 'Atacado Central', cliente: null, id_venda: null, id_compra: 'c118' },
  { id: 'l7', tipo: 'receita', descricao: 'Serviço avulso', valor: 120, data_pagamento: hoje, contraparte: 'Maria Costa', cliente: null, id_venda: null, id_compra: null }];

function rotas(extra?: Rotas): Rotas {
  return (c, u, req) => {
    const e = extra?.(c, u, req);
    if (e) return e;
    if (c === 'perfis') return { corpo: [{ nome_completo: 'Ana Souza', tipo_usuario: 'empresa', funcao_global: 'user' }] };
    if (c === 'usuarios_empresas') return { corpo: [{ empresas: EMPRESA }] };
    if (c === 'notificacoes') return { corpo: [] };
    if (c === 'rpc/pode_operar_comercial') return { corpo: true };
    if (c === 'clientes') return { corpo: [{ id: 'c1', nome: 'João Silva', nome_fantasia: null }] };
    if (c === 'rpc/resumo_recibos') return { corpo: { emitidos: 48, emitidos_anterior: 43, valor_recebido: 18450, valor_recebido_anterior: 14879.03, valor_pago: 2230, cancelados: 2, nao_conciliados: 1, mes_quantidade: 15, mes_valor: 7320 } };
    if (c === 'rpc/buscar_recibos') return { corpo: LINHAS };
    if (c === 'recibos') return { corpo: (u.searchParams.get('id') ?? '').includes('r2') ? DOC_MANUAL : DOC };
    if (c === 'historico_recibos') return { corpo: [{ acao: 'emitido', dados: { numero: 125 }, criado_em: `${hoje}T17:32:00Z` }] };
    if (c === 'rpc/registrar_evento_recibo') return { status: 204 };
    if (c === 'rpc/pagamentos_sem_recibo') return { corpo: PAGAMENTOS };
    if (c === 'rpc/emitir_recibo') return { corpo: 'r-novo' };
    if (c === 'rpc/cancelar_recibo' || c === 'rpc/conciliar_recibo') return { status: 204 };
    return undefined;
  };
}
async function abrir(ctx: BrowserContext, caminho = '/app/recibos'): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`${BASE}${caminho}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Recibos' })).toBeVisible({ timeout: 90000 });
  return page;
}
const chamadas = (r: { chamadas: { caminho: string; corpo: unknown }[] }, c: string) => r.chamadas.filter((x) => x.caminho === c);
const texto = async (p: Page, nome: string) => ((await p.getByRole('region', { name: nome, exact: true }).textContent()) ?? '').replace(/ /g, ' ');

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

test('painel, lista com filtros no servidor, visualização, PDF/segunda via auditados e compartilhamento sem CPF', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas());
  const page = await abrir(ctx);
  await expect(page.getByRole('navigation', { name: 'Módulos do departamento' }).getByRole('link', { name: 'Recibos' })).toHaveAttribute('href', '/app/recibos');
  await expect.poll(() => texto(page, 'Recibos emitidos')).toContain('48');
  expect(await texto(page, 'Recibos emitidos')).toContain('+11,6%');
  expect(await texto(page, 'Valor recebido documentado')).toContain('R$ 18.450,00');
  expect(await texto(page, 'Cancelados')).toContain('1 manuais não conciliados');
  expect(await texto(page, 'Este mês')).toContain('R$ 7.320,00');
  await expect(page.getByTestId('recibo-124')).toContainText('Não conciliado');
  await expect(page.getByTestId('recibo-120')).toContainText('Cancelado');
  await expect(page.getByTestId('recibo-118')).toContainText('Pagamento');
  await page.getByRole('tab', { name: 'Cancelados' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/buscar_recibos').some((x) => (x.corpo as { p_situacao: string }).p_situacao === 'cancelado')).toBe(true);
  await page.getByLabel('Filtrar por tipo').selectOption('pagamento');
  await page.getByLabel('Filtrar por cliente').selectOption('c1');
  await expect.poll(() => chamadas(registro, 'rpc/buscar_recibos').some((x) => { const b = x.corpo as Record<string, unknown>; return b.p_tipo === 'pagamento' && b.p_id_cliente === 'c1'; })).toBe(true);
  await page.getByRole('tab', { name: 'Todos' }).click();
  await page.getByLabel('Filtrar por tipo').selectOption('');
  await page.getByLabel('Filtrar por cliente').selectOption('');
  const painel = page.getByRole('complementary', { name: 'Visualizar recibo' });
  await expect(painel.getByTestId('valor-recibo')).toContainText('R$ 40,00');
  await expect(painel.getByTestId('extenso-recibo')).toHaveText('quarenta reais');
  await expect(painel).toContainText('529.982.247-25');
  await expect(painel).toContainText('Recebemos de João Silva a importância de R$');
  // WhatsApp/e-mail com mensagem pronta, sem CPF
  const wa = await painel.getByRole('link', { name: 'WhatsApp' }).getAttribute('href');
  const msg = decodeURIComponent(wa!.split('text=')[1]);
  expect(msg).toContain('Recibo nº 000125');
  expect(msg).not.toContain('529');
  expect(await painel.getByRole('link', { name: 'E-mail' }).getAttribute('href')).toMatch(/^mailto:\?subject=/);
  // PDF (impressão) e segunda via: mesmo número, auditados
  const [pdf] = await Promise.all([page.waitForEvent('popup'), painel.getByRole('button', { name: 'Baixar PDF / imprimir' }).click()]);
  await expect(pdf.getByRole('heading', { name: 'RECIBO' })).toBeVisible({ timeout: 15000 });
  await expect(pdf.locator('body')).toContainText('Nº 000125');
  await expect(pdf.locator('body')).toContainText('quarenta reais');
  await expect(pdf.locator('body')).toContainText('não substitui nota fiscal');
  await pdf.close();
  const [via2] = await Promise.all([page.waitForEvent('popup'), painel.getByRole('button', { name: 'Segunda via' }).click()]);
  await expect(via2.locator('body')).toContainText('Nº 000125 — 2ª via');
  await via2.close();
  await expect.poll(() => chamadas(registro, 'rpc/registrar_evento_recibo').map((x) => (x.corpo as { p_acao: string }).p_acao).join()).toBe('download,segunda_via');
  // Recibo manual parcial: não conciliado, vincular
  await page.getByTestId('recibo-124').click();
  await expect(painel).toContainText('Pagamento parcial de R$ 300,00: sem quitação integral.');
  await expect(painel).toContainText('ainda não conciliado');
  await painel.getByRole('button', { name: 'Vincular a recebimento' }).click();
  const conc = page.getByRole('dialog', { name: /Vincular recibo nº 000124/ });
  await expect(conc.getByTestId('pagamentos-sem-recibo')).toContainText('Serviço avulso');
  await expect(conc.getByTestId('pagamentos-sem-recibo')).not.toContainText('Venda #000215');
  await conc.getByRole('radio', { name: /Serviço avulso/ }).click();
  await conc.getByRole('button', { name: 'Vincular' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/conciliar_recibo').length).toBe(1);
  expect(chamadas(registro, 'rpc/conciliar_recibo')[0].corpo).toMatchObject({ p_id_recibo: 'r2', p_id_lancamento: 'l7' });
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('novo recibo: a partir de pagamento confirmado, manual com declaração obrigatória, parcial; cancelamento com justificativa', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let falhaRede = true;
  const registro = await sessaoSimulada(ctx, rotas((c) => {
    if (c === 'rpc/emitir_recibo' && falhaRede) { falhaRede = false; return { status: 500, corpo: { code: 'XX000', message: 'falha' } }; }
    return undefined;
  }));
  const page = await abrir(ctx);
  await page.getByRole('button', { name: 'Novo recibo' }).click();
  const m = page.getByRole('dialog', { name: 'Novo recibo' });
  await m.getByRole('button', { name: 'Emitir recibo' }).click();
  await expect(m.getByRole('alert')).toContainText('Escolha o pagamento');
  await m.getByRole('radio', { name: /Venda #000215/ }).click();
  await m.getByRole('button', { name: 'Emitir recibo' }).click();
  await expect(m.getByRole('alert')).toContainText('Não foi possível emitir');
  await m.getByRole('button', { name: 'Emitir recibo' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/emitir_recibo').length).toBe(2);
  const [a, b] = chamadas(registro, 'rpc/emitir_recibo').map((x) => x.corpo as Record<string, unknown>);
  expect(b).toMatchObject({ p_id_empresa: EMPRESA.id, p_id_lancamento: 'l9', p_valor: null, p_declaracao: false });
  expect(b.p_chave).toBe(a.p_chave);
  await expect(page.getByRole('status').filter({ hasText: 'Recibo emitido e vinculado ao pagamento.' })).toBeVisible();
  // Manual
  await page.getByRole('button', { name: 'Novo recibo' }).click();
  const n = page.getByRole('dialog', { name: 'Novo recibo' });
  await n.getByRole('radio', { name: 'Recibo manual' }).click();
  await n.getByLabel('Nome do pagador').fill('Pedro Santos');
  await n.getByLabel('CPF/CNPJ (opcional)').fill('52998224724');
  await n.getByLabel('Descrição', { exact: true }).fill('Manutenção de PC');
  await n.getByLabel('Valor recebido (R$)').fill('9000');
  await n.getByRole('button', { name: 'Emitir recibo' }).click();
  await expect(n.getByRole('alert')).toContainText('CPF/CNPJ do pagador inválido');
  await n.getByLabel('CPF/CNPJ (opcional)').fill('52998224725');
  await n.getByLabel(/Pagamento parcial/).check();
  await n.getByLabel('Valor total da operação (opcional)').fill('5000');
  await n.getByRole('button', { name: 'Emitir recibo' }).click();
  await expect(n.getByRole('alert')).toContainText('total da operação deve ser maior');
  await n.getByLabel('Valor total da operação (opcional)').fill('20000');
  await n.getByRole('button', { name: 'Emitir recibo' }).click();
  await expect(n.getByRole('alert')).toContainText('efetivamente recebido');
  expect(chamadas(registro, 'rpc/emitir_recibo')).toHaveLength(2);
  await n.getByLabel(/Declaro que este valor foi efetivamente recebido/).check();
  await n.getByRole('button', { name: 'Emitir recibo' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/emitir_recibo').length).toBe(3);
  expect(chamadas(registro, 'rpc/emitir_recibo')[2].corpo).toMatchObject({ p_id_lancamento: null, p_pessoa_nome: 'Pedro Santos', p_pessoa_documento: '529.982.247-25', p_descricao: 'Manutenção de PC',
    p_valor: '90.00', p_data_pagamento: hoje, p_forma_pagamento: 'pix', p_parcial: true, p_valor_total: '200.00', p_declaracao: true });
  await expect(page.getByRole('status').filter({ hasText: 'não conciliado' })).toBeVisible();
  // Cancelamento
  const painel = page.getByRole('complementary', { name: 'Visualizar recibo' });
  await page.getByTestId('recibo-125').click();
  await painel.getByRole('button', { name: 'Cancelar recibo' }).click();
  const canc = page.getByRole('dialog', { name: /Cancelar recibo nº 000125/ });
  await canc.getByLabel('Justificativa').fill('erro');
  await canc.getByRole('button', { name: 'Cancelar recibo' }).click();
  await expect(canc.getByRole('alert')).toContainText('mínimo 5');
  await canc.getByLabel('Justificativa').fill('Valor digitado errado');
  await canc.getByRole('button', { name: 'Cancelar recibo' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/cancelar_recibo').length).toBe(1);
  expect(chamadas(registro, 'rpc/cancelar_recibo')[0].corpo).toMatchObject({ p_id_recibo: 'r1', p_motivo: 'Valor digitado errado' });
  await ctx.close();
});

test('vindo do Financeiro (?lancamento=), contador só leitura, estados e layout de 320 a 1920px', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas());
  const page = await abrir(ctx, '/app/recibos?lancamento=00000000-0000-4000-8000-0000000000l8'.replace('l8', '08'));
  // UUID inexistente na lista → avisa sem emitir
  const m = page.getByRole('dialog', { name: 'Novo recibo' });
  await expect(m.getByRole('alert')).toContainText('não está disponível para recibo');
  await m.getByRole('button', { name: 'Cancelar' }).click();
  await ctx.close();

  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const reg2 = await sessaoSimulada(ctx2, rotas((c) => (c === 'rpc/pagamentos_sem_recibo' ? { corpo: [{ ...PAGAMENTOS[1], id: '11111111-2222-4333-8444-555555555555' }] } : undefined)));
  const p2 = await abrir(ctx2, '/app/recibos?lancamento=11111111-2222-4333-8444-555555555555');
  const m2 = p2.getByRole('dialog', { name: 'Novo recibo' });
  await expect(m2.getByTestId('pagamento-escolhido')).toContainText('Compra #000118');
  await m2.getByRole('button', { name: 'Emitir recibo' }).click();
  await expect.poll(() => chamadas(reg2, 'rpc/emitir_recibo').length).toBe(1);
  expect(chamadas(reg2, 'rpc/emitir_recibo')[0].corpo).toMatchObject({ p_id_lancamento: '11111111-2222-4333-8444-555555555555' });
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx2.close();

  const leitor = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await sessaoSimulada(leitor, rotas((c) => (c === 'rpc/pode_operar_comercial' ? { corpo: false } : undefined)));
  const pl = await abrir(leitor);
  await expect(pl.getByTestId('recibo-125')).toBeVisible();
  await expect(pl.getByRole('button', { name: 'Novo recibo' })).toHaveCount(0);
  await expect(pl.getByRole('button', { name: 'Cancelar recibo' })).toHaveCount(0);
  await expect(pl.getByRole('button', { name: 'Baixar PDF / imprimir' })).toBeVisible();
  await leitor.close();

  const ausente = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(ausente, rotas((c) => (c.startsWith('rpc/') && c !== 'rpc/pode_operar_comercial' ? { status: 404, corpo: { code: 'PGRST202', message: 'Could not find the function in the schema cache' } } : undefined)));
  const pa = await abrir(ausente);
  await expect(pa.getByTestId('recibos-indisponivel')).toContainText('falta aplicar uma atualização do banco', { timeout: 15000 });
  expect(await texto(pa, 'Recibos emitidos')).toContain('Indisponível');
  await ausente.close();

  const erro = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(erro, rotas((c) => (c === 'rpc/buscar_recibos' ? { status: 500, corpo: { message: 'falha', code: 'XX000' } } : undefined)));
  const pe = await abrir(erro);
  await expect(pe.getByRole('alert').filter({ hasText: 'Não foi possível carregar os recibos.' })).toBeVisible({ timeout: 15000 });
  await erro.close();

  const vazio = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(vazio, rotas((c) => (c === 'rpc/buscar_recibos' ? { corpo: [] } : undefined)));
  const pv = await abrir(vazio);
  await expect(pv.getByRole('button', { name: 'Emitir recibo' })).toBeVisible({ timeout: 15000 });
  await vazio.close();

  const l = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await sessaoSimulada(l, rotas());
  const pg = await abrir(l);
  await expect(pg.getByTestId('recibo-125')).toBeVisible({ timeout: 15000 });
  for (const largura of [320, 375, 768, 1024, 1440, 1920]) {
    await pg.setViewportSize({ width: largura, height: 900 });
    await pg.waitForTimeout(200);
    expect(await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `@${largura}`).toBeLessThanOrEqual(1);
  }
  await l.close();
});
