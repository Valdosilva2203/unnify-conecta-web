import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { sessaoSimulada, type Rotas } from './apoio/sessao-simulada';

// Compras com a API do Supabase SIMULADA (não acessa banco). Regras de banco (recebimento parcial/total, estoque, contas a
// pagar, pagamentos, cancelamento, idempotência, concorrência, RLS, contador) em tests/sql/compras.mjs.
const BASE = 'http://localhost:3000';
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const EMPRESA = { id: 'aaaaaaaa-0000-4000-8000-000000000001', razao_social: 'EMPRESA EXEMPLO LTDA', nome_comercial: 'Empresa Exemplo', cnpj: '12345678000190', tipo_empresa: 'comum' };
const linha = (id: string, numero: number, situacao: string, extra: Record<string, unknown> = {}) => ({ id, numero, data_compra: hoje, fornecedor: 'Atacado Central', id_fornecedor: 'f1', condicao: 'a_prazo',
  forma_pagamento: 'boleto', parcelas: 3, itens: 3, total: 1850, valor_recebido: 0, pago: 0, a_pagar: 1850, situacao, total_linhas: 28, ...extra });
const COMPRAS = [linha('c1', 127, 'parcialmente_recebida', { valor_recebido: 1150, pago: 500, a_pagar: 1350 }), linha('c2', 128, 'recebida', { pago: 2500, a_pagar: 0, total: 2500 }),
  linha('c3', 126, 'solicitada'), linha('c4', 125, 'rascunho', { fornecedor: null, id_fornecedor: null }), linha('c5', 124, 'cancelada')];
const DETALHE = { id: 'c1', numero: 127, status: 'confirmada', condicao: 'a_prazo', forma_pagamento: 'boleto', parcelas: 3, primeiro_vencimento: '2026-11-13', previsao_entrega: null, subtotal: 1850, desconto: 0, frete: 0, total: 1850,
  data_compra: hoje, observacoes: null, id_fornecedor: 'f1', motivo_cancelamento: null, criado_em: `${hoje}T14:32:00Z`, fornecedores: { nome: 'Atacado Central LTDA', nome_fantasia: 'Atacado Central' },
  itens_compra: [
    { id: 'i1', id_produto: 'p1', tipo: 'produto', descricao: 'Roteador Wi-Fi 6', quantidade: 10, quantidade_recebida: 10, preco_unitario: 110, desconto: 0, total: 1100, produtos: { unidade: 'un', estoque_atual: 10 } },
    { id: 'i2', id_produto: 'p2', tipo: 'produto', descricao: 'Cabo HDMI 2.0', quantidade: 20, quantidade_recebida: 10, preco_unitario: 15, desconto: 0, total: 300, produtos: { unidade: 'un', estoque_atual: 10 } },
    { id: 'i3', id_produto: 's1', tipo: 'servico', descricao: 'Manutenção de PC', quantidade: 5, quantidade_recebida: 0, preco_unitario: 90, desconto: 0, total: 450, produtos: { unidade: 'serv', estoque_atual: 0 } }] };
const LANCS = [{ id: 'l0', descricao: 'Compra #000127 (1/3) (parcial)', valor: 500, status: 'pago', data_vencimento: hoje, data_pagamento: hoje },
  { id: 'l1', descricao: 'Compra #000127 (1/3)', valor: 116.67, status: 'pendente', data_vencimento: '2026-11-13', data_pagamento: null },
  { id: 'l2', descricao: 'Compra #000127 (2/3)', valor: 616.67, status: 'pendente', data_vencimento: '2026-12-13', data_pagamento: null }];
const PRODUTOS = [
  { id: 'p1', tipo: 'produto', nome: 'Camiseta Unnify', sku: 'CAM', codigo_barras: null, categoria: null, unidade: 'un', custo: 25, preco_venda: 60, estoque_atual: 0, estoque_minimo: 0, status: 'ativo', situacao_estoque: 'sem_estoque', total: 3 },
  { id: 'p2', tipo: 'produto', nome: 'Cabo de rede CAT6', sku: null, codigo_barras: null, categoria: null, unidade: 'm', custo: 3.5, preco_venda: 6, estoque_atual: 40, estoque_minimo: 0, status: 'ativo', situacao_estoque: 'em_estoque', total: 3 },
  { id: 's1', tipo: 'servico', nome: 'Instalação de internet', sku: null, codigo_barras: null, categoria: null, unidade: 'serv', custo: 150, preco_venda: 200, estoque_atual: 0, estoque_minimo: 0, status: 'ativo', situacao_estoque: 'servico', total: 3 }];
const CONTA = { id: 'k1', nome: 'Banco', instituicao: null, tipo: 'conta_corrente', saldo_inicial: 0, data_saldo_inicial: '2026-01-01', principal: true, permite_saldo_negativo: false, arquivada_em: null, saldo: 5000, cor: null };
const FORN = { id: 'f1', tipo_pessoa: 'pj', nome: 'Atacado Central LTDA', nome_fantasia: 'Atacado Central', documento: '11222333000181', telefone: '63999991234', email: 'contato@atacado.com', cidade: 'Augustinópolis', estado: 'TO', status: 'ativo', compras: 6, total_comprado: 12450, a_pagar: 1350, total: 1 };

function rotas(extra?: Rotas): Rotas {
  return (c, u, req) => {
    const e = extra?.(c, u, req);
    if (e) return e;
    if (c === 'perfis') return { corpo: [{ nome_completo: 'Ana Souza', tipo_usuario: 'empresa', funcao_global: 'user' }] };
    if (c === 'usuarios_empresas') return { corpo: [{ empresas: EMPRESA }] };
    if (c === 'notificacoes') return { corpo: [] };
    if (c === 'rpc/pode_operar_comercial') return { corpo: true };
    if (c === 'contas_financeiras_saldo') return { corpo: [CONTA] };
    if (c === 'rpc/resumo_compras') return { corpo: { comprado: 12450, comprado_anterior: 11116.07, quantidade: 28, a_pagar: 4280, a_pagar_vencido: 0, pago: 3200, aguardando_entrega: 8, recebidas: 24 } };
    if (c === 'rpc/buscar_compras') return { corpo: COMPRAS };
    if (c === 'compras') return { corpo: DETALHE };
    if (c === 'lancamentos_financeiros') return { corpo: LANCS };
    if (c === 'recebimentos_compra') return { corpo: [{ id: 'r1', data_recebimento: hoje, observacoes: 'Parcial conforme NF', estornado_em: null, motivo_estorno: null, itens_recebimento_compra: [{ quantidade: 10, itens_compra: { descricao: 'Roteador Wi-Fi 6' } }, { quantidade: 10, itens_compra: { descricao: 'Cabo HDMI 2.0' } }] }] };
    if (c === 'historico_compras') return { corpo: [{ acao: 'pagamento', dados: { valor: 500 }, criado_em: `${hoje}T15:00:00Z` }, { acao: 'recebimento', dados: { itens: 2 }, criado_em: `${hoje}T14:40:00Z` }, { acao: 'confirmada', dados: {}, criado_em: `${hoje}T14:32:00Z` }] };
    if (c === 'fornecedores') return { corpo: u.searchParams.get('id') ? { ...FORN, endereco: 'Rua Goiás, 200', observacoes: 'Fornecedor principal' } : [FORN] };
    if (c === 'rpc/buscar_fornecedores') return { corpo: [FORN] };
    if (c === 'rpc/buscar_produtos') return { corpo: PRODUTOS };
    if (c === 'rpc/salvar_compra') return { corpo: 'c-nova' };
    if (c === 'rpc/registrar_recebimento_compra') return { corpo: 'r-novo' };
    if (c === 'rpc/registrar_pagamento_compra') return { corpo: 'l-novo' };
    if (c === 'rpc/cancelar_compra' || c === 'rpc/estornar_recebimento_compra') return { status: 204 };
    if (c === 'rpc/salvar_fornecedor') return { corpo: 'f-novo' };
    return undefined;
  };
}
async function abrir(ctx: BrowserContext): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/compras`);
  await expect(page.getByRole('heading', { level: 1, name: 'Compras' })).toBeVisible({ timeout: 90000 });
  return page;
}
const chamadas = (r: { chamadas: { caminho: string; corpo: unknown }[] }, c: string) => r.chamadas.filter((x) => x.caminho === c);
const texto = async (p: Page, nome: string) => ((await p.getByRole('region', { name: nome, exact: true }).textContent()) ?? '').replace(/ /g, ' ');

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

test('painel, lista com filtros no servidor e detalhe: comprado ≠ recebido ≠ pago; recebimento parcial e pagamento parcial', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas());
  const page = await abrir(ctx);
  await expect(page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Compras' })).toHaveAttribute('href', '/app/compras');
  await expect.poll(() => texto(page, 'Compras do período')).toContain('R$ 12.450,00');
  expect(await texto(page, 'Compras do período')).toContain('+12%');
  expect(await texto(page, 'A pagar')).toContain('R$ 4.280,00');
  expect(await texto(page, 'Aguardando entrega')).toContain('8');
  expect(await texto(page, 'Recebidas')).toContain('24');
  await expect(page.getByTestId('compra-127')).toContainText('Parcialmente recebida');
  await expect(page.getByTestId('compra-124')).toContainText('Cancelada');
  await page.getByRole('tab', { name: 'Solicitadas' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/buscar_compras').some((x) => (x.corpo as { p_situacao: string }).p_situacao === 'solicitada')).toBe(true);
  await page.getByLabel('Filtrar por fornecedor').selectOption('f1');
  await expect.poll(() => chamadas(registro, 'rpc/buscar_compras').some((x) => (x.corpo as { p_id_fornecedor: string }).p_id_fornecedor === 'f1')).toBe(true);
  await page.getByRole('tab', { name: 'Todas' }).click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da compra' });
  await expect(painel.getByTestId('progresso-recebimento')).toContainText('57% recebido');
  const fin = (await painel.getByTestId('financeiro-compra').textContent())!.replace(/ /g, ' ');
  expect(fin).toContain('Valor compradoR$ 1.850,00');
  expect(fin).toContain('Recebido fisicamenteR$ 1.150,00');
  expect(fin).toContain('PagoR$ 500,00');
  expect(fin).toContain('A pagarR$ 1.350,00');
  // Recebimento parcial: só o pendente, sem passar do comprado
  await painel.getByRole('button', { name: 'Receber itens' }).click();
  const rec = page.getByRole('dialog', { name: /Receber itens da compra #000127/ });
  await expect(rec.getByLabel('Receber agora: Roteador Wi-Fi 6')).toBeDisabled();
  await expect(rec.getByLabel('Receber agora: Cabo HDMI 2.0')).toHaveValue('10');
  await rec.getByLabel('Receber agora: Cabo HDMI 2.0').fill('11');
  await rec.getByRole('button', { name: 'Confirmar recebimento' }).click();
  await expect(rec.getByRole('alert')).toContainText('maior que o pendente');
  expect(chamadas(registro, 'rpc/registrar_recebimento_compra')).toHaveLength(0);
  await rec.getByLabel('Receber agora: Cabo HDMI 2.0').fill('10');
  await rec.getByLabel('Receber agora: Manutenção de PC').fill('0');
  await rec.getByRole('button', { name: 'Confirmar recebimento' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/registrar_recebimento_compra').length).toBe(1);
  const cr = chamadas(registro, 'rpc/registrar_recebimento_compra')[0].corpo as Record<string, unknown>;
  expect(cr).toMatchObject({ p_id_compra: 'c1', p_itens: [{ id_item: 'i2', quantidade: 10 }], p_data: hoje });
  expect(typeof cr.p_chave).toBe('string');
  await expect(page.getByRole('status').filter({ hasText: 'Recebimento parcial registrado' })).toBeVisible();
  // Pagamento parcial de uma parcela
  await painel.getByRole('tab', { name: 'Pagamentos' }).click();
  await expect(painel.getByTestId('contas-compra')).toContainText('Pago em');
  await painel.getByRole('button', { name: 'Pagar Compra #000127 (2/3)' }).click();
  const pag = page.getByRole('dialog', { name: /Registrar pagamento/ });
  await expect(pag.getByLabel('Valor pago (R$)')).toHaveValue('616,67');
  await pag.getByLabel('Valor pago (R$)').fill('20000');
  await pag.getByRole('button', { name: 'Registrar pagamento' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/registrar_pagamento_compra').length).toBe(1);
  expect(chamadas(registro, 'rpc/registrar_pagamento_compra')[0].corpo).toMatchObject({ p_id_lancamento: 'l2', p_valor: '200.00', p_data: hoje, p_id_conta: 'k1' });
  await expect(page.getByRole('status').filter({ hasText: 'Pagamento parcial registrado' })).toBeVisible();
  // Recebimentos e histórico
  await painel.getByRole('tab', { name: 'Recebimentos' }).click();
  await expect(painel.getByTestId('recebimentos')).toContainText('10 Cabo HDMI 2.0');
  await painel.getByRole('button', { name: /Estornar recebimento/ }).click();
  const est = page.getByRole('dialog', { name: 'Estornar recebimento' });
  await est.getByLabel('Motivo').fill('Contagem errada');
  await est.getByRole('button', { name: 'Estornar recebimento' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/estornar_recebimento_compra').length).toBe(1);
  expect(chamadas(registro, 'rpc/estornar_recebimento_compra')[0].corpo).toMatchObject({ p_id_recebimento: 'r1', p_motivo: 'Contagem errada' });
  await painel.getByRole('tab', { name: 'Histórico' }).click();
  await expect(painel.getByTestId('historico-compra')).toContainText('Pagamento registrado');
  // Cancelar com recebimento/pagamento: bloqueado na tela
  await painel.getByRole('button', { name: 'Cancelar compra' }).click();
  const canc = page.getByRole('dialog', { name: /Cancelar compra/ });
  await expect(canc.getByRole('alert')).toContainText('Estorne os recebimentos');
  await expect(canc.getByRole('button', { name: 'Cancelar compra' })).toBeDisabled();
  await canc.getByRole('button', { name: 'Voltar' }).click();
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('nova compra: catálogo do Estoque, produto + serviço, descontos, frete, parcelas e repetição com a mesma chave', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let falhaRede = true;
  const registro = await sessaoSimulada(ctx, rotas((c) => {
    if (c === 'rpc/salvar_compra' && falhaRede) { falhaRede = false; return { status: 500, corpo: { code: 'XX000', message: 'falha' } }; }
    return undefined;
  }));
  const page = await abrir(ctx);
  await page.getByRole('button', { name: 'Nova compra' }).first().click();
  const m = page.getByRole('dialog', { name: 'Nova compra' });
  await m.getByRole('button', { name: 'Adicionar Camiseta Unnify' }).click();
  await m.getByRole('button', { name: 'Adicionar Cabo de rede CAT6' }).click();
  await m.getByRole('button', { name: 'Adicionar Instalação de internet' }).click();
  const lista = m.getByTestId('itens-compra-form');
  await lista.getByLabel('Quantidade (un)').fill('50');
  await lista.getByLabel('Quantidade (m)').fill('20');
  await lista.getByLabel('Desconto (R$)').nth(1).fill('500');
  // 50 × 25 = 1250; 20 × 3,50 − 5 = 65; 150 → 1465
  await expect(m.getByTestId('total-item-Cabo de rede CAT6')).toContainText('R$ 65,00');
  await expect(m.getByTestId('total-compra')).toContainText('R$ 1.465,00');
  await m.getByRole('button', { name: 'Continuar' }).click();
  await m.getByLabel('Fornecedor').selectOption('f1');
  await m.getByRole('radio', { name: 'A prazo' }).click();
  await expect(m.getByLabel(/Pagamento já feito/)).toHaveCount(0);
  await m.getByLabel('Parcelas').selectOption('3');
  await m.getByLabel('Frete (R$)').fill('5000');
  await expect(m.getByTestId('total-compra')).toContainText('R$ 1.515,00');
  await m.getByRole('button', { name: 'Registrar compra' }).click();
  await expect(m.getByRole('alert')).toContainText('primeiro vencimento');
  await m.getByLabel('Primeiro vencimento').fill('2099-12-31');
  await m.getByRole('button', { name: 'Registrar compra' }).click();
  await expect(m.getByRole('alert')).toContainText('Não foi possível salvar a compra.');
  await m.getByRole('button', { name: 'Registrar compra' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/salvar_compra').length).toBe(2);
  const [a, b] = chamadas(registro, 'rpc/salvar_compra').map((x) => x.corpo as Record<string, unknown>);
  expect(b).toMatchObject({ p_id: null, p_id_empresa: EMPRESA.id, p_id_fornecedor: 'f1', p_frete: 50, p_condicao: 'a_prazo', p_parcelas: 3, p_primeiro_vencimento: '2099-12-31', p_confirmar: true, p_pago: false, p_id_conta: null,
    p_itens: [{ id_produto: 'p1', quantidade: 50, preco_unitario: 25, desconto: 0 }, { id_produto: 'p2', quantidade: 20, preco_unitario: 3.5, desconto: 5 }, { id_produto: 's1', quantidade: 1, preco_unitario: 150, desconto: 0 }] });
  expect(b.p_chave).toBe(a.p_chave);
  await expect(page.getByRole('status').filter({ hasText: 'o estoque entra no recebimento' })).toBeVisible();
  // À vista paga na hora e rascunho
  await page.getByRole('button', { name: 'Nova compra' }).first().click();
  const v = page.getByRole('dialog', { name: 'Nova compra' });
  await v.getByRole('button', { name: 'Adicionar Instalação de internet' }).click();
  await v.getByRole('button', { name: 'Salvar rascunho' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/salvar_compra').length).toBe(3);
  expect(chamadas(registro, 'rpc/salvar_compra')[2].corpo).toMatchObject({ p_confirmar: false, p_chave: null });
  await page.getByRole('button', { name: 'Nova compra' }).first().click();
  const w = page.getByRole('dialog', { name: 'Nova compra' });
  await w.getByRole('button', { name: 'Adicionar Instalação de internet' }).click();
  await w.getByRole('button', { name: 'Continuar' }).click();
  await w.getByLabel(/Pagamento já feito/).check();
  await expect(w.getByTestId('previa-saldo')).toContainText('R$ 4.850,00');
  await w.getByRole('button', { name: 'Registrar compra' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/salvar_compra').length).toBe(4);
  expect(chamadas(registro, 'rpc/salvar_compra')[3].corpo).toMatchObject({ p_condicao: 'a_vista', p_pago: true, p_id_conta: 'k1', p_id_fornecedor: null });
  await ctx.close();
});

test('fornecedores: lista, detalhe, cadastro com validação; contador só leitura; estados e layout de 320 a 1920px', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let duplicado = true;
  const registro = await sessaoSimulada(ctx, rotas((c) => (c === 'rpc/salvar_fornecedor' && duplicado ? { status: 409, corpo: { code: '23505', message: 'Já existe um fornecedor com este CNPJ.' } } : undefined)));
  const page = await abrir(ctx);
  await page.getByRole('tab', { name: 'Fornecedores' }).click();
  await expect(page.getByTestId('fornecedor-Atacado Central')).toContainText('11.222.333/0001-81');
  const det = page.getByRole('complementary', { name: 'Detalhes do fornecedor' });
  await expect(det).toContainText('(63) 99999-1234');
  await expect(det).toContainText('Fornecedor principal');
  await page.getByRole('button', { name: 'Novo fornecedor' }).click();
  const m = page.getByRole('dialog', { name: 'Novo fornecedor' });
  await m.getByLabel('Razão social').fill('Tech Suprimentos LTDA');
  await m.getByLabel('CNPJ (opcional)').fill('11222333000180');
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect(m.getByRole('alert')).toContainText('CNPJ inválido');
  await m.getByLabel('CNPJ (opcional)').fill('11222333000181');
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect(m.getByRole('alert')).toContainText('Já existe um fornecedor com este CNPJ.');
  duplicado = false;
  await m.getByLabel('CNPJ (opcional)').fill('');
  await m.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/salvar_fornecedor').length).toBe(2);
  expect(chamadas(registro, 'rpc/salvar_fornecedor')[1].corpo).toMatchObject({ p_id: null, p_id_empresa: EMPRESA.id, p_tipo_pessoa: 'pj', p_nome: 'Tech Suprimentos LTDA', p_documento: null, p_status: 'ativo' });
  await ctx.close();

  const leitor = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await sessaoSimulada(leitor, rotas((c) => (c === 'rpc/pode_operar_comercial' ? { corpo: false } : undefined)));
  const pl = await abrir(leitor);
  await expect(pl.getByTestId('compra-127')).toBeVisible();
  await expect(pl.getByRole('button', { name: 'Nova compra' })).toHaveCount(0);
  await expect(pl.getByRole('button', { name: 'Receber itens' })).toHaveCount(0);
  await pl.getByRole('tab', { name: 'Fornecedores' }).click();
  await expect(pl.getByRole('button', { name: 'Novo fornecedor' })).toHaveCount(0);
  await leitor.close();

  const ausente = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(ausente, rotas((c) => (c.startsWith('rpc/') && c !== 'rpc/pode_operar_comercial' ? { status: 404, corpo: { code: 'PGRST202', message: 'Could not find the function in the schema cache' } } : undefined)));
  const pa = await abrir(ausente);
  await expect(pa.getByTestId('compras-indisponivel')).toContainText('falta aplicar uma atualização do banco', { timeout: 15000 });
  expect(await texto(pa, 'A pagar')).toContain('Indisponível');
  await ausente.close();

  const erro = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(erro, rotas((c) => (c === 'rpc/buscar_compras' ? { status: 500, corpo: { message: 'falha', code: 'XX000' } } : undefined)));
  const pe = await abrir(erro);
  await expect(pe.getByRole('alert').filter({ hasText: 'Não foi possível carregar as compras.' })).toBeVisible({ timeout: 15000 });
  await erro.close();

  const vazio = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(vazio, rotas((c) => (c === 'rpc/buscar_compras' ? { corpo: [] } : undefined)));
  const pv = await abrir(vazio);
  await expect(pv.getByRole('button', { name: 'Registrar compra' })).toBeVisible({ timeout: 15000 });
  await vazio.close();

  const l = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await sessaoSimulada(l, rotas());
  const pg = await abrir(l);
  await expect(pg.getByTestId('compra-127')).toBeVisible({ timeout: 15000 });
  for (const largura of [320, 375, 768, 1024, 1440, 1920]) {
    await pg.setViewportSize({ width: largura, height: 900 });
    await pg.waitForTimeout(200);
    expect(await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `@${largura}`).toBeLessThanOrEqual(1);
  }
  await pg.setViewportSize({ width: 320, height: 800 });
  await pg.getByRole('button', { name: 'Receber itens' }).click();
  expect(await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'modal @320').toBeLessThanOrEqual(1);
  await l.close();
});
