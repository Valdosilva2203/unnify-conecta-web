import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { sessaoSimulada, type Rotas } from './apoio/sessao-simulada';

// Estoque + Vendas com a API do Supabase SIMULADA (não acessa banco). Regras de banco (atomicidade, concorrência,
// idempotência, saldo, estorno, Financeiro, RLS, contador) em tests/sql/estoque-vendas.mjs.
const BASE = 'http://localhost:3000';
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const EMPRESA = { id: 'aaaaaaaa-0000-4000-8000-000000000001', razao_social: 'EMPRESA EXEMPLO LTDA', nome_comercial: 'Empresa Exemplo', cnpj: '12345678000190', tipo_empresa: 'comum' };
const prod = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({ id, tipo: 'produto', nome, sku: `SKU-${id}`, codigo_barras: null, categoria: 'Vestuário', unidade: 'un',
  custo: 25.5, preco_venda: 59.9, estoque_atual: 32, estoque_minimo: 10, status: 'ativo', situacao_estoque: 'em_estoque', total: 23, ...extra });
const PRODUTOS = [prod('p1', 'Camiseta Básica'), prod('p2', 'Boné Aba Curva', { estoque_atual: 6, situacao_estoque: 'estoque_baixo', preco_venda: 45 }),
  prod('p3', 'Garrafa Térmica', { estoque_atual: 0, situacao_estoque: 'sem_estoque' }), prod('s1', 'Instalação', { tipo: 'servico', unidade: 'serv', estoque_atual: 0, estoque_minimo: 0, preco_venda: 150, custo: 0, situacao_estoque: 'servico', sku: null })];
const RESUMO_E = { cadastrados: 128, produtos: 110, servicos: 18, em_estoque: 86, estoque_baixo: 12, sem_estoque: 8, valor_estoque_custo: 18450.5, novos_mes: 3 };
const VENDAS = [
  { id: 'v1', numero: 1254, data_venda: hoje, cliente: 'João Silva', id_cliente: 'c1', condicao: 'a_prazo', forma_pagamento: 'boleto', itens: 2, tipos: 'produto,servico', total: 364.9, recebido: 100, a_receber: 264.9, situacao: 'aguardando_pagamento', total_linhas: 32 },
  { id: 'v2', numero: 1253, data_venda: hoje, cliente: null, id_cliente: null, condicao: 'a_vista', forma_pagamento: 'pix', itens: 1, tipos: 'produto', total: 59.9, recebido: 59.9, a_receber: 0, situacao: 'concluida', total_linhas: 32 },
  { id: 'v3', numero: 1252, data_venda: hoje, cliente: 'Maria Oliveira', id_cliente: 'c2', condicao: 'a_vista', forma_pagamento: 'dinheiro', itens: 1, tipos: 'produto', total: 45, recebido: 0, a_receber: 0, situacao: 'rascunho', total_linhas: 32 },
];
const DETALHE_V1 = { id: 'v1', numero: 1254, status: 'confirmada', condicao: 'a_prazo', forma_pagamento: 'boleto', subtotal: 364.9, desconto: 0, total: 364.9, data_venda: hoje, vencimento: '2026-11-13', observacoes: null,
  id_cliente: 'c1', motivo_cancelamento: null, clientes: { nome: 'João Silva', nome_fantasia: null },
  itens_venda: [{ id_produto: 's1', tipo: 'servico', descricao: 'Instalação', quantidade: 2, preco_unitario: 150, desconto: 0, total: 300, produtos: { unidade: 'serv', estoque_atual: 0 } },
    { id_produto: 'p1', tipo: 'produto', descricao: 'Camiseta Básica', quantidade: 1, preco_unitario: 64.9, desconto: 0, total: 64.9, produtos: { unidade: 'un', estoque_atual: 32 } }] };
const DETALHE_V3 = { ...DETALHE_V1, id: 'v3', numero: 1252, status: 'rascunho', condicao: 'a_vista', forma_pagamento: 'dinheiro', subtotal: 45, total: 45, id_cliente: 'c2', vencimento: null, clientes: { nome: 'Maria Oliveira', nome_fantasia: null },
  itens_venda: [{ id_produto: 'p2', tipo: 'produto', descricao: 'Boné Aba Curva', quantidade: 1, preco_unitario: 45, desconto: 0, total: 45, produtos: { unidade: 'un', estoque_atual: 6 } }] };
const CONTA = { id: 'k1', nome: 'Caixa loja', instituicao: null, tipo: 'caixa', saldo_inicial: 0, data_saldo_inicial: '2026-01-01', principal: true, permite_saldo_negativo: false, arquivada_em: null, saldo: 1000, cor: null };

function rotas(extra?: Rotas): Rotas {
  return (c, u, req) => {
    const e = extra?.(c, u, req);
    if (e) return e;
    if (c === 'perfis') return { corpo: [{ nome_completo: 'Ana Souza', tipo_usuario: 'empresa', funcao_global: 'user' }] };
    if (c === 'usuarios_empresas') return { corpo: [{ empresas: EMPRESA }] };
    if (c === 'notificacoes') return { corpo: [] };
    if (c === 'rpc/pode_operar_comercial') return { corpo: true };
    if (c === 'rpc/buscar_produtos') return { corpo: PRODUTOS };
    if (c === 'rpc/resumo_estoque') return { corpo: RESUMO_E };
    if (c === 'produtos') {
      if (u.searchParams.get('select') === 'categoria') return { corpo: [{ categoria: 'Vestuário' }, { categoria: 'Acessórios' }] };
      const id = (u.searchParams.get('id') ?? '').replace('eq.', '');
      const p = PRODUTOS.find((x) => x.id === id) ?? PRODUTOS[0];
      return { corpo: { ...p, descricao: 'Algodão 100%', criado_em: '2026-01-10T12:00:00Z', atualizado_em: '2026-10-10T12:00:00Z' } };
    }
    if (c === 'movimentacoes_estoque') return { corpo: [{ id: 'm2', tipo: 'venda', quantidade: -2, saldo_apos: 32, motivo: null, criado_em: `${hoje}T13:00:00Z`, vendas: { numero: 1254 } },
      { id: 'm1', tipo: 'entrada', quantidade: 34, saldo_apos: 34, motivo: 'Compra NF 123', criado_em: `${hoje}T10:00:00Z`, vendas: null }] };
    if (c === 'itens_venda') return { corpo: [{ quantidade: 2, total: 129.8, vendas: { status: 'confirmada' } }] };
    if (c === 'rpc/salvar_produto') return { corpo: 'p-novo' };
    if (c === 'rpc/movimentar_estoque') return { corpo: 'm-novo' };
    if (c === 'rpc/buscar_vendas') return { corpo: VENDAS };
    if (c === 'rpc/resumo_vendas') return { corpo: { vendido: 48750.9, vendido_anterior: 43000, quantidade: 32, quantidade_anterior: 30, a_receber: 8450.75, a_receber_vencido: 300, recebido: 40300.15, recebido_anterior: 35000 } };
    if (c === 'contas_financeiras_saldo') return { corpo: [CONTA] };
    if (c === 'vendas') return { corpo: (u.searchParams.get('id') ?? '').includes('v3') ? DETALHE_V3 : DETALHE_V1 };
    if (c === 'lancamentos_financeiros') return { corpo: [{ id: 'l1', descricao: 'Venda #001254 (parcial)', valor: 100, status: 'pago', data_vencimento: hoje, data_pagamento: hoje }, { id: 'l2', descricao: 'Venda #001254', valor: 264.9, status: 'pendente', data_vencimento: '2026-11-13', data_pagamento: null }] };
    if (c === 'historico_vendas') return { corpo: [{ acao: 'recebimento', dados: { valor: 100 }, criado_em: `${hoje}T14:00:00Z` }, { acao: 'confirmada', dados: { total: 364.9 }, criado_em: `${hoje}T13:00:00Z` }] };
    if (c === 'clientes') return { corpo: [{ id: 'c1', nome: 'João Silva', nome_fantasia: null }, { id: 'c2', nome: 'Maria Oliveira', nome_fantasia: null }] };
    if (c === 'rpc/salvar_venda') return { corpo: 'v-nova' };
    if (c === 'rpc/registrar_recebimento_venda') return { corpo: 'l-novo' };
    if (c === 'rpc/cancelar_venda') return { status: 204 };
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
const norm = (s: string | null) => (s ?? '').replace(/ /g, ' ');

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

test('Estoque: indicadores, lista com filtros no servidor, perfil do item e histórico de movimentações', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas());
  const page = await abrir(ctx, '/app/estoque', 'Estoque');
  const menu = page.getByRole('navigation', { name: 'Módulos do departamento' }); // Compras e Estoque
  await expect(menu.getByRole('link', { name: 'Estoque' })).toHaveAttribute('aria-current', 'page');
  await expect(menu.getByRole('link', { name: 'Compras' })).toHaveAttribute('href', '/app/compras');
  await expect(page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Comercial' })).toHaveAttribute('href', '/app/clientes');
  await expect.poll(() => texto(page, 'Itens cadastrados')).toContain('128');
  expect(await texto(page, 'Itens cadastrados')).toContain('110 produtos · 18 serviços');
  expect(await texto(page, 'Estoque baixo')).toContain('12');
  expect(await texto(page, 'Sem estoque')).toContain('8');
  expect(await texto(page, 'Em estoque')).toContain('R$ 18.450,50');
  await expect(page.getByTestId('produto-Boné Aba Curva')).toContainText('Estoque baixo');
  await expect(page.getByTestId('produto-Instalação')).toContainText('Serviço');
  await page.getByRole('tab', { name: 'Sem estoque' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/buscar_produtos').some((x) => (x.corpo as { p_filtro: string }).p_filtro === 'sem_estoque')).toBe(true);
  await page.getByLabel('Buscar itens').fill('789123');
  await expect.poll(() => chamadas(registro, 'rpc/buscar_produtos').some((x) => (x.corpo as { p_busca: string }).p_busca === '789123')).toBe(true);
  await page.getByLabel('Filtrar por categoria').selectOption('Vestuário');
  await expect.poll(() => chamadas(registro, 'rpc/buscar_produtos').some((x) => (x.corpo as { p_categoria: string }).p_categoria === 'Vestuário')).toBe(true);
  const painel = page.getByRole('complementary', { name: 'Detalhes do item' });
  await expect(painel.getByTestId('saldo-produto')).toContainText('32 un');
  await expect(painel).toContainText('Algodão 100%');
  await expect(painel.getByTestId('movimentacoes')).toContainText('Venda · venda #001254');
  await expect(painel.getByTestId('movimentacoes')).toContainText('Compra NF 123');
  expect(norm(await painel.textContent())).toContain('2 un · R$ 129,80');
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('Estoque: cadastro com validação, saída sem justificativa bloqueada, saída maior que o saldo, ajuste e repetição com a mesma chave', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let duplicado = true;
  let falhaRede = true;
  const registro = await sessaoSimulada(ctx, rotas((c) => {
    if (c === 'rpc/salvar_produto' && duplicado) return { status: 409, corpo: { code: '23505', message: 'Já existe um item com o SKU CAM-001.' } };
    if (c === 'rpc/movimentar_estoque' && falhaRede) { falhaRede = false; return { status: 500, corpo: { code: 'XX000', message: 'falha' } }; }
    return undefined;
  }));
  const page = await abrir(ctx, '/app/estoque', 'Estoque');
  await page.getByRole('button', { name: 'Novo produto ou serviço' }).click();
  const modal = page.getByRole('dialog', { name: 'Novo produto ou serviço' });
  await modal.getByLabel('Nome').fill('Camiseta Polo');
  await modal.getByLabel('SKU / código interno (opcional)').fill('CAM-001');
  await modal.getByLabel('Custo (R$)').fill('2550');
  await modal.getByLabel('Preço de venda (R$)').fill('6990');
  await expect(modal.getByTestId('margem')).toContainText('63,5%');
  await modal.getByLabel('Estoque inicial (opcional)').fill('12,5');
  await modal.getByRole('button', { name: 'Salvar' }).click();
  await expect(modal.getByRole('alert')).toContainText('Já existe um item com o SKU CAM-001.');
  duplicado = false;
  await modal.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/salvar_produto').length).toBe(2);
  expect(chamadas(registro, 'rpc/salvar_produto')[1].corpo).toMatchObject({ p_id: null, p_id_empresa: EMPRESA.id, p_tipo: 'produto', p_nome: 'Camiseta Polo', p_sku: 'CAM-001', p_custo: '25.50', p_preco: '69.90', p_estoque_inicial: 12.5 });
  // Serviço: sem campos de estoque
  await page.getByRole('button', { name: 'Novo produto ou serviço' }).click();
  const serv = page.getByRole('dialog', { name: 'Novo produto ou serviço' });
  await serv.getByRole('radio', { name: 'Serviço (sem estoque)' }).click();
  await expect(serv.getByLabel(/Estoque mínimo/)).toHaveCount(0);
  await expect(serv.getByLabel(/Estoque inicial/)).toHaveCount(0);
  await serv.getByRole('button', { name: 'Cancelar' }).click();
  // Movimentações
  const painel = page.getByRole('complementary', { name: 'Detalhes do item' });
  await painel.getByRole('button', { name: 'Saída' }).click();
  const mov = page.getByRole('dialog', { name: /Movimentar estoque/ });
  await mov.getByLabel(/Quantidade/).fill('40');
  await expect(mov.getByTestId('previa-estoque')).toContainText('32 → -8');
  await mov.getByRole('button', { name: 'Registrar' }).click();
  await expect(mov.getByRole('alert')).toContainText('Estoque insuficiente');
  await mov.getByLabel(/Quantidade/).fill('2');
  await mov.getByRole('button', { name: 'Registrar' }).click();
  await expect(mov.getByRole('alert')).toContainText('justificativa');
  expect(chamadas(registro, 'rpc/movimentar_estoque')).toHaveLength(0);
  await mov.getByRole('radio', { name: 'Ajuste' }).click();
  await mov.getByLabel(/Saldo contado/).fill('30');
  await mov.getByLabel('Justificativa').fill('Inventário mensal');
  await mov.getByRole('button', { name: 'Registrar' }).click();
  await expect(mov.getByRole('alert')).toContainText('Não foi possível registrar');
  await mov.getByRole('button', { name: 'Registrar' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/movimentar_estoque').length).toBe(2);
  const [a, b] = chamadas(registro, 'rpc/movimentar_estoque').map((x) => x.corpo as { p_chave: string; p_tipo: string; p_quantidade: number });
  expect(a).toMatchObject({ p_id_produto: 'p1', p_tipo: 'ajuste', p_quantidade: 30, p_motivo: 'Inventário mensal' });
  expect(b.p_chave).toBe(a.p_chave);
  await expect(page.getByRole('status').filter({ hasText: 'Ajuste registrado.' })).toBeVisible();
  await ctx.close();
});

test('Vendas: indicadores separando vendido e recebido, histórico, detalhe integrado ao Financeiro e recebimento parcial', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas());
  const page = await abrir(ctx, '/app/vendas', 'Vendas');
  await expect.poll(() => texto(page, 'Total vendido')).toContain('R$ 48.750,90');
  expect(await texto(page, 'Total vendido')).toContain('+13,4% vs. período anterior');
  expect(await texto(page, 'Vendas realizadas')).toContain('32');
  expect(await texto(page, 'A receber')).toContain('R$ 300,00 vencido');
  expect(await texto(page, 'Recebido')).toContain('R$ 40.300,15');
  expect(chamadas(registro, 'rpc/resumo_vendas')[0].corpo).toMatchObject({ p_id_empresa: EMPRESA.id, p_inicio: `${hoje.slice(0, 7)}-01`, p_fim: hoje });
  await expect(page.getByTestId('venda-1254')).toContainText('Aguardando pagamento');
  await expect(page.getByTestId('venda-1254')).toContainText('Produtos e serviços');
  await expect(page.getByTestId('venda-1253')).toContainText('Concluída');
  await page.getByRole('tab', { name: 'Rascunhos' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/buscar_vendas').some((x) => (x.corpo as { p_situacao: string }).p_situacao === 'rascunho')).toBe(true);
  await page.getByRole('tab', { name: 'Todas' }).click();
  await page.getByLabel('Período').selectOption('anterior');
  await expect.poll(() => chamadas(registro, 'rpc/resumo_vendas').length).toBeGreaterThan(1);
  await page.getByLabel('Período').selectOption('mes');
  const painel = page.getByRole('complementary', { name: 'Detalhes da venda' });
  await expect(painel.getByTestId('itens-venda')).toContainText('Instalação');
  await expect(painel.getByTestId('a-receber-venda')).toContainText('R$ 264,90');
  await expect(painel.getByTestId('lancamentos-venda')).toContainText('Recebido em');
  await expect(painel.getByTestId('historico-venda')).toContainText('Recebimento registrado');
  await painel.getByRole('button', { name: 'Registrar recebimento' }).click();
  const rec = page.getByRole('dialog', { name: /Registrar recebimento/ });
  await expect(rec.getByLabel('Valor recebido (R$)')).toHaveValue('264,90');
  await rec.getByLabel('Valor recebido (R$)').fill('30000');
  await rec.getByRole('button', { name: 'Registrar recebimento' }).click();
  await expect(rec.getByRole('alert')).toContainText('passa do saldo');
  await rec.getByLabel('Valor recebido (R$)').fill('10000');
  await rec.getByRole('button', { name: 'Registrar recebimento' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/registrar_recebimento_venda').length).toBe(1);
  expect(chamadas(registro, 'rpc/registrar_recebimento_venda')[0].corpo).toMatchObject({ p_id_venda: 'v1', p_valor: '100.00', p_data: hoje, p_id_conta: 'k1' });
  await expect(page.getByRole('status').filter({ hasText: 'Recebimento parcial registrado' })).toBeVisible();
  // Cancelamento com recebimento é bloqueado na tela (o banco também recusa)
  await painel.getByRole('button', { name: 'Cancelar venda' }).click();
  const canc = page.getByRole('dialog', { name: /Cancelar venda/ });
  await expect(canc.getByRole('alert')).toContainText('estorne antes');
  await expect(canc.getByRole('button', { name: 'Cancelar venda' })).toBeDisabled();
  await canc.getByRole('button', { name: 'Voltar' }).click();
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('Nova venda: carrinho com produto + serviço, descontos e totais, estoque insuficiente, à vista recebida, a prazo e chave de repetição', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let falhaRede = true;
  const registro = await sessaoSimulada(ctx, rotas((c) => {
    if (c === 'rpc/salvar_venda' && falhaRede) { falhaRede = false; return { status: 500, corpo: { code: 'XX000', message: 'falha' } }; }
    return undefined;
  }));
  const page = await abrir(ctx, '/app/vendas', 'Vendas');
  await page.getByRole('button', { name: 'Nova venda' }).first().click();
  const m = page.getByRole('dialog', { name: 'Nova venda' });
  await expect(m.getByRole('button', { name: 'Adicionar Garrafa Térmica' })).toBeDisabled();
  await m.getByRole('button', { name: 'Adicionar Boné Aba Curva' }).click();
  await m.getByRole('button', { name: 'Adicionar Instalação' }).click();
  await m.getByRole('button', { name: 'Adicionar Boné Aba Curva' }).click();
  const carrinho = m.getByTestId('carrinho');
  await expect(carrinho.getByLabel('Quantidade (un)')).toHaveValue('2');
  await carrinho.getByLabel('Quantidade (un)').fill('7');
  await m.getByRole('button', { name: 'Continuar' }).click();
  await expect(m.getByRole('alert')).toContainText('Estoque insuficiente para "Boné Aba Curva"');
  await carrinho.getByLabel('Quantidade (un)').fill('2');
  await carrinho.getByLabel('Desconto (R$)').first().fill('1000');
  // 2 × 45 − 10 = 80; + 150 = 230
  await expect(m.getByTestId('total-item-Boné Aba Curva')).toContainText('R$ 80,00');
  await expect(m.getByTestId('total-venda')).toContainText('R$ 230,00');
  await m.getByRole('button', { name: 'Continuar' }).click();
  await m.getByLabel('Cliente (opcional)').selectOption('c1');
  await m.getByLabel('Desconto na venda (R$)').fill('3000');
  await expect(m.getByTestId('total-venda')).toContainText('R$ 200,00');
  await m.getByLabel(/Pagamento já recebido/).check();
  await expect(m.getByTestId('previa-saldo')).toContainText('R$ 1.200,00');
  await m.getByRole('button', { name: 'Confirmar venda' }).click();
  await expect(m.getByRole('alert')).toContainText('Não foi possível salvar a venda.');
  await m.getByRole('button', { name: 'Confirmar venda' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/salvar_venda').length).toBe(2);
  const [v1, v2] = chamadas(registro, 'rpc/salvar_venda').map((x) => x.corpo as Record<string, unknown>);
  expect(v2).toMatchObject({ p_id: null, p_id_empresa: EMPRESA.id, p_id_cliente: 'c1', p_desconto: 30, p_condicao: 'a_vista', p_forma_pagamento: 'pix', p_confirmar: true, p_recebido: true, p_id_conta: 'k1',
    p_itens: [{ id_produto: 'p2', quantidade: 2, preco_unitario: 45, desconto: 10 }, { id_produto: 's1', quantidade: 1, preco_unitario: 150, desconto: 0 }] });
  expect(typeof v1.p_chave).toBe('string');
  expect(v2.p_chave).toBe(v1.p_chave);
  await expect(page.getByRole('status').filter({ hasText: 'Venda confirmada e recebimento registrado.' })).toBeVisible();
  // A prazo: exige vencimento, sem recebimento imediato
  await page.getByRole('button', { name: 'Nova venda' }).first().click();
  const p = page.getByRole('dialog', { name: 'Nova venda' });
  await p.getByRole('button', { name: 'Adicionar Instalação' }).click();
  await p.getByRole('button', { name: 'Continuar' }).click();
  await p.getByRole('radio', { name: 'A prazo' }).click();
  await expect(p.getByLabel(/Pagamento já recebido/)).toHaveCount(0);
  await p.getByRole('button', { name: 'Confirmar venda' }).click();
  await expect(p.getByRole('alert')).toContainText('vencimento');
  await p.getByLabel('Vencimento').fill('2099-12-31');
  await p.getByLabel('Forma de pagamento').selectOption('boleto');
  await p.getByRole('button', { name: 'Confirmar venda' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/salvar_venda').length).toBe(3);
  const v3 = chamadas(registro, 'rpc/salvar_venda')[2].corpo as Record<string, unknown>;
  expect(v3).toMatchObject({ p_condicao: 'a_prazo', p_vencimento: '2099-12-31', p_forma_pagamento: 'boleto', p_recebido: false, p_id_conta: null, p_id_cliente: null });
  expect(v3.p_chave).not.toBe(v1.p_chave);
  await expect(page.getByRole('status').filter({ hasText: 'Contas a receber' })).toBeVisible();
  await ctx.close();
});

test('Rascunho: continuar e confirmar; descartar com motivo; contador só leitura; estados e layout de 320 a 1920px', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas());
  const page = await abrir(ctx, '/app/vendas', 'Vendas');
  await page.getByTestId('venda-1252').click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da venda' });
  await painel.getByRole('button', { name: 'Continuar rascunho' }).click();
  const m = page.getByRole('dialog', { name: 'Continuar rascunho' });
  await expect(m.getByTestId('carrinho')).toContainText('Boné Aba Curva');
  await m.getByRole('button', { name: 'Salvar rascunho' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/salvar_venda').length).toBe(1);
  expect(chamadas(registro, 'rpc/salvar_venda')[0].corpo).toMatchObject({ p_id: 'v3', p_id_cliente: 'c2', p_confirmar: false, p_chave: null });
  await page.getByTestId('venda-1252').click();
  await painel.getByRole('button', { name: 'Descartar rascunho' }).click();
  const canc = page.getByRole('dialog', { name: /Cancelar venda/ });
  await canc.getByRole('button', { name: 'Cancelar venda' }).click();
  await expect(canc.getByRole('alert')).toContainText('motivo');
  await canc.getByLabel('Motivo').fill('Cliente desistiu');
  await canc.getByRole('button', { name: 'Cancelar venda' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/cancelar_venda').length).toBe(1);
  expect(chamadas(registro, 'rpc/cancelar_venda')[0].corpo).toMatchObject({ p_id_venda: 'v3', p_motivo: 'Cliente desistiu' });
  await ctx.close();

  // Contador (só leitura): sem botões de escrita
  const leitor = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await sessaoSimulada(leitor, rotas((c) => (c === 'rpc/pode_operar_comercial' ? { corpo: false } : undefined)));
  const pl = await abrir(leitor, '/app/vendas', 'Vendas');
  await expect(pl.getByTestId('venda-1254')).toBeVisible();
  await expect(pl.getByRole('button', { name: 'Nova venda' })).toHaveCount(0);
  await expect(pl.getByRole('button', { name: 'Registrar recebimento' })).toHaveCount(0);
  const pe = await abrir(leitor, '/app/estoque', 'Estoque');
  await expect(pe.getByTestId('produto-Camiseta Básica')).toBeVisible();
  await expect(pe.getByRole('button', { name: 'Novo produto ou serviço' })).toHaveCount(0);
  await expect(pe.getByRole('button', { name: 'Entrada' })).toHaveCount(0);
  await leitor.close();

  const ausente = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(ausente, rotas((c) => (c.startsWith('rpc/') && c !== 'rpc/pode_operar_comercial' ? { status: 404, corpo: { code: 'PGRST202', message: 'Could not find the function in the schema cache' } } : undefined)));
  const pa = await abrir(ausente, '/app/vendas', 'Vendas');
  await expect(pa.getByTestId('vendas-indisponivel')).toContainText('falta aplicar uma atualização do banco', { timeout: 15000 });
  const pa2 = await abrir(ausente, '/app/estoque', 'Estoque');
  await expect(pa2.getByTestId('estoque-indisponivel')).toContainText('falta aplicar uma atualização do banco', { timeout: 15000 });
  await ausente.close();

  const erro = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(erro, rotas((c) => (c === 'rpc/buscar_vendas' || c === 'rpc/resumo_vendas' ? { status: 500, corpo: { message: 'falha', code: 'XX000' } } : undefined)));
  const per = await abrir(erro, '/app/vendas', 'Vendas');
  await expect(per.getByRole('alert').filter({ hasText: 'Não foi possível carregar as vendas.' })).toBeVisible({ timeout: 15000 });
  expect(await texto(per, 'Total vendido')).toContain('Indisponível');
  await erro.close();

  const vazio = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(vazio, rotas((c) => (c === 'rpc/buscar_produtos' || c === 'rpc/buscar_vendas' ? { corpo: [] } : undefined)));
  const pv = await abrir(vazio, '/app/estoque', 'Estoque');
  await expect(pv.getByRole('button', { name: 'Cadastrar o primeiro item' })).toBeVisible({ timeout: 15000 });
  await vazio.close();

  const l = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await sessaoSimulada(l, rotas());
  for (const [rota, titulo, id] of [['/app/estoque', 'Estoque', 'produto-Camiseta Básica'], ['/app/vendas', 'Vendas', 'venda-1254']] as const) {
    const pg = await abrir(l, rota, titulo);
    await expect(pg.getByTestId(id)).toBeVisible({ timeout: 15000 });
    for (const largura of [320, 375, 768, 1024, 1440, 1920]) {
      await pg.setViewportSize({ width: largura, height: 900 });
      await pg.waitForTimeout(200);
      expect(await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${rota} @${largura}`).toBeLessThanOrEqual(1);
    }
    if (rota === '/app/vendas') {
      await pg.setViewportSize({ width: 320, height: 800 });
      await pg.getByRole('button', { name: 'Nova venda' }).first().click();
      await pg.getByRole('dialog', { name: 'Nova venda' }).getByRole('button', { name: 'Adicionar Instalação' }).click();
      expect(await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'modal @320').toBeLessThanOrEqual(1);
    }
    await pg.close();
  }
  await l.close();
});
