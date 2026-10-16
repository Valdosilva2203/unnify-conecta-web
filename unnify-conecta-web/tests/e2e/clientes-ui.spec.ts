import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { sessaoSimulada, type Rotas } from './apoio/sessao-simulada';

// Clientes com a API do Supabase SIMULADA (não acessa banco). Regras de banco (documentos, duplicidade, RLS, IDs de outra
// empresa, contador, vínculo com receitas sem dupla contagem) em tests/sql/clientes.mjs.
const BASE = 'http://localhost:3000';
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const EMPRESA = { id: 'aaaaaaaa-0000-4000-8000-000000000001', razao_social: 'EMPRESA EXEMPLO LTDA', nome_comercial: 'Empresa Exemplo', cnpj: '12345678000190', tipo_empresa: 'comum' };
const linha = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({ id, tipo_pessoa: 'pf', nome, nome_fantasia: null, documento: '52998224725', telefone: '63992345678', email: `${id}@email.com`,
  cidade: 'Augustinópolis', estado: 'TO', status: 'ativo', criado_em: '2024-02-10T12:00:00Z', situacao_financeira: 'em_dia', a_receber: 0, total_recebido: 1850, ultimo_movimento: hoje, total: 23, ...extra });
const LINHAS = [linha('c1', 'João Silva'), linha('c2', 'Maria Oliveira', { situacao_financeira: 'atrasado', a_receber: 300 }), linha('c3', 'Comercial Silva LTDA', { tipo_pessoa: 'pj', nome_fantasia: 'Comercial Silva', documento: '11222333000181' })];
const COMPLETO = { id: 'c1', tipo_pessoa: 'pf', nome: 'João Silva', nome_fantasia: null, documento: '52998224725', telefone: '63992345678', email: 'joao@email.com', cep: '77960000',
  logradouro: 'Rua das Flores', numero: '123', complemento: null, bairro: 'Centro', cidade: 'Augustinópolis', estado: 'TO', status: 'ativo', observacoes: 'Prefere atendimento aos sábados.', criado_em: '2024-02-10T12:00:00Z' };
const RESUMO = { total: 23, ativos: 18, inativos: 3, prospects: 2, novos_mes: 4, novos_mes_anterior: 2, a_receber: 8450, a_receber_vencido: 300,
  evolucao: Array.from({ length: 10 }, (_, i) => ({ mes: `2026-${String(i + 1).padStart(2, '0')}-01`, novos: i % 3, cadastrados: 10 + i })) };
const MOVS = [{ id: 'l1', descricao: 'Venda serviço', valor: 1850, status: 'pago', situacao: 'pago', data_vencimento: hoje, data_pagamento: hoje, categoria: 'Prestação de serviços' },
  { id: 'l2', descricao: 'Mensalidade', valor: 300, status: 'pendente', situacao: 'vencido', data_vencimento: '2026-09-10', data_pagamento: null, categoria: 'Prestação de serviços' }];

function rotas(extra?: Rotas): Rotas {
  return (c, u, req) => {
    const e = extra?.(c, u, req);
    if (e) return e;
    if (c === 'perfis') return { corpo: [{ nome_completo: 'Ana Souza', tipo_usuario: 'empresa', funcao_global: 'user' }] };
    if (c === 'usuarios_empresas') return { corpo: [{ empresas: EMPRESA }] };
    if (c === 'rpc/buscar_clientes') return { corpo: LINHAS };
    if (c === 'rpc/resumo_clientes') return { corpo: RESUMO };
    if (c === 'clientes') return { corpo: u.searchParams.get('id') ? COMPLETO : LINHAS.map((l) => ({ id: l.id, nome: l.nome, tipo_pessoa: l.tipo_pessoa, criado_em: l.criado_em, status: l.status, nome_fantasia: l.nome_fantasia, documento: l.documento })) };
    if (c === 'rpc/financeiro_cliente') return { corpo: MOVS };
    if (c === 'historico_clientes') return { corpo: [{ acao: 'editado', dados: { campos: ['contato', 'endereco'] }, criado_em: `${hoje}T12:00:00Z` }, { acao: 'criado', dados: { status: 'ativo' }, criado_em: '2024-02-10T12:00:00Z' }] };
    if (c === 'rpc/pode_gerenciar_clientes') return { corpo: true };
    if (c === 'rpc/salvar_cliente') return { corpo: 'novo' };
    if (c === 'rpc/receitas_sem_cliente') return { corpo: [{ id: 'l9', descricao: 'Venda balcão', valor: 450, status: 'pendente', data_vencimento: hoje, contraparte: 'João' }] };
    if (c === 'rpc/vincular_cliente_lancamento') return { status: 204 };
    if (c === 'notificacoes') return { corpo: [] };
    return undefined;
  };
}
async function abrir(ctx: BrowserContext, caminho = '/app/clientes', titulo = 'Clientes'): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`${BASE}${caminho}`);
  await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible({ timeout: 90000 });
  return page;
}
const chamadas = (r: { chamadas: { caminho: string; corpo: unknown }[] }, c: string) => r.chamadas.filter((x) => x.caminho === c);
const texto = async (p: Page, nome: string) => ((await p.getByRole('region', { name: nome, exact: true }).textContent()) ?? '').replace(/ /g, ' ');

test.describe.configure({ mode: 'serial' });
test.setTimeout(3 * 60 * 1000);

test('painel, lista paginada no servidor, abas/filtros e detalhes com financeiro real e histórico sem dados pessoais', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas());
  const page = await abrir(ctx);
  await expect(page.getByRole('navigation', { name: 'Módulos do departamento' }).getByRole('link', { name: 'Clientes' })).toHaveAttribute('href', '/app/clientes');
  await expect.poll(() => texto(page, 'A receber')).toContain('R$ 8.450,00');
  expect(await texto(page, 'Clientes cadastrados')).toContain('23');
  expect(await texto(page, 'Clientes ativos')).toContain('78% do total');
  expect(await texto(page, 'Novos no mês')).toContain('+100%');
  await expect(page.getByTestId('cliente-Maria Oliveira')).toContainText('Em atraso');
  await expect(page.getByTestId('cliente-Comercial Silva LTDA')).toContainText('PJ');
  // Abas, busca e paginação vão para o servidor
  await page.getByRole('tab', { name: 'Prospects' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/buscar_clientes').some((x) => (x.corpo as { p_status: string }).p_status === 'prospect')).toBe(true);
  await page.getByLabel('Buscar clientes').fill('Silva');
  await expect.poll(() => chamadas(registro, 'rpc/buscar_clientes').some((x) => (x.corpo as { p_busca: string }).p_busca === 'Silva')).toBe(true);
  await page.getByRole('tab', { name: 'Todos' }).click();
  // Detalhes
  const painel = page.getByRole('complementary', { name: 'Detalhes do cliente' });
  await expect(painel).toContainText('529.982.247-25');
  await expect(painel).toContainText('(63) 99234-5678');
  await expect(painel).toContainText('Prefere atendimento aos sábados.');
  await expect(painel.getByTestId('total-recebido')).toContainText('R$ 1.850,00');
  await painel.getByRole('tab', { name: 'Financeiro' }).click();
  await expect(painel.getByTestId('financeiro-cliente')).toContainText('Vencida');
  await expect(painel.getByTestId('financeiro-cliente')).toContainText('R$ 300,00');
  await painel.getByRole('tab', { name: 'Histórico' }).click();
  await expect(painel.getByTestId('historico-cliente')).toContainText('Dados atualizados');
  await expect(painel.getByTestId('historico-cliente')).toContainText('contato, endereço');
  await painel.getByRole('tab', { name: 'Documentos' }).click();
  await expect(painel).toContainText('ainda não estão disponíveis');
  expect(registro.escritasBloqueadas).toEqual([]);
  await ctx.close();
});

test('cadastro com validação de CPF/CNPJ, duplicidade vinda do banco e vínculo de receita existente', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let duplicado = true;
  const registro = await sessaoSimulada(ctx, rotas((c) => (c === 'rpc/salvar_cliente' && duplicado ? { status: 409, corpo: { code: '23505', message: 'Já existe um cliente com este CPF.' } } : undefined)));
  const page = await abrir(ctx);
  await page.getByRole('button', { name: 'Novo cliente' }).first().click();
  const modal = page.getByRole('dialog', { name: 'Novo cliente' });
  await modal.getByLabel('Nome completo').fill('Lucas Almeida');
  await modal.getByLabel('CPF (opcional)').fill('52998224724');
  await modal.getByRole('button', { name: 'Salvar' }).click();
  await expect(modal.getByRole('alert')).toContainText('CPF inválido');
  expect(chamadas(registro, 'rpc/salvar_cliente')).toHaveLength(0);
  await modal.getByLabel('CPF (opcional)').fill('52998224725');
  await modal.getByRole('button', { name: 'Salvar' }).click();
  await expect(modal.getByRole('alert')).toContainText('Já existe um cliente com este CPF.');
  duplicado = false;
  await modal.getByLabel('CPF (opcional)').fill('');
  await modal.getByLabel('Telefone').fill('63991112233');
  await modal.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/salvar_cliente').length).toBe(2);
  expect(chamadas(registro, 'rpc/salvar_cliente')[1].corpo).toMatchObject({ p_id: null, p_id_empresa: EMPRESA.id, p_tipo_pessoa: 'pf', p_nome: 'Lucas Almeida', p_documento: null, p_telefone: '(63) 99111-2233', p_status: 'ativo' });
  // PJ pede razão social e nome fantasia
  await page.getByRole('button', { name: 'Novo cliente' }).first().click();
  const pj = page.getByRole('dialog', { name: 'Novo cliente' });
  await pj.getByRole('radio', { name: 'Pessoa jurídica' }).click();
  await expect(pj.getByLabel('Razão social')).toBeVisible();
  await expect(pj.getByLabel('Nome fantasia (opcional)')).toBeVisible();
  await pj.getByRole('button', { name: 'Cancelar' }).click();
  // Vincular receita já lançada no Financeiro
  const painel = page.getByRole('complementary', { name: 'Detalhes do cliente' });
  await painel.getByRole('tab', { name: 'Financeiro' }).click();
  await painel.getByRole('button', { name: 'Vincular receita existente' }).click();
  await page.getByRole('dialog', { name: 'Vincular receita' }).getByRole('button', { name: 'Vincular' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/vincular_cliente_lancamento').length).toBe(1);
  expect(chamadas(registro, 'rpc/vincular_cliente_lancamento')[0].corpo).toMatchObject({ p_id_lancamento: 'l9', p_id_cliente: 'c1' });
  await painel.getByRole('button', { name: 'Desvincular Mensalidade' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/vincular_cliente_lancamento').length).toBe(2);
  expect(chamadas(registro, 'rpc/vincular_cliente_lancamento')[1].corpo).toMatchObject({ p_id_lancamento: 'l2', p_id_cliente: null });
  await ctx.close();
});

test('Financeiro: receita lançada com cliente vincula pelo banco', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const registro = await sessaoSimulada(ctx, rotas((c) => {
    if (c === 'categorias_financeiras') return { corpo: [{ id: 'cat1', tipo: 'receita', nome: 'Prestação de serviços', cor: '#0d9488', icone: 'briefcase', ativa: true }] };
    if (c === 'contas_financeiras_saldo') return { corpo: [] };
    if (c === 'rpc/salvar_lancamento_financeiro') return { corpo: 'l-novo' };
    if (c === 'rpc/resumo_financeiro' || c === 'lancamentos_financeiros_situacao') return { corpo: c === 'rpc/resumo_financeiro' ? null : [] };
    return undefined;
  }));
  const page = await abrir(ctx, '/app/financeiro#lancamentos', 'Financeiro');
  await page.getByRole('button', { name: /Novo lançamento/ }).click();
  await page.getByRole('menuitem', { name: 'Receita' }).click();
  const form = page.getByRole('dialog', { name: 'Lançar receita' });
  await form.locator('#lanc-descricao').fill('Consultoria');
  await form.locator('#lanc-valor').fill('120000');
  await form.locator('#lanc-categoria').selectOption('cat1');
  // Cliente cadastrado é o PRIMEIRO campo (antes da Classificação) e a busca aceita nome ou CNPJ/CPF
  const campos = await form.locator('input, select').evaluateAll((els) => els.map((e) => e.id).filter(Boolean));
  expect(campos.indexOf('lanc-cliente-busca')).toBeLessThan(campos.indexOf('lanc-natureza'));
  const busca = form.getByLabel(/Cliente cadastrado/);
  await busca.fill('x');
  await expect(form.getByRole('listbox')).toHaveCount(0); // menos de 2 letras não busca
  await busca.fill('comercial');
  await expect(form.getByRole('listbox', { name: 'Clientes encontrados' }).getByRole('option')).toHaveText([/Comercial Silva/]); // por nome (fantasia ou razão social)
  await expect(form.getByRole('listbox', { name: 'Clientes encontrados' }).getByRole('option')).toContainText('CNPJ 11.222.333/0001-81');
  await busca.fill('11.222.333');
  await expect(form.getByRole('listbox', { name: 'Clientes encontrados' }).getByRole('option')).toHaveCount(1); // por CNPJ (com ou sem pontuação)
  await busca.fill('00000000');
  await expect(form.getByRole('listbox')).toContainText('Nenhum cliente encontrado.');
  await busca.fill('maria');
  await form.getByRole('listbox', { name: 'Clientes encontrados' }).getByRole('option', { name: /Maria Oliveira/ }).click();
  await expect(form.getByTestId('cliente-escolhido')).toContainText('Maria Oliveira');
  await expect(form.getByTestId('cliente-escolhido')).toContainText('CPF 529.982.247-25');
  await form.getByRole('button', { name: 'Salvar lançamento' }).click();
  await expect.poll(() => chamadas(registro, 'rpc/vincular_cliente_lancamento').length).toBe(1);
  expect(chamadas(registro, 'rpc/vincular_cliente_lancamento')[0].corpo).toMatchObject({ p_id_lancamento: 'l-novo', p_id_cliente: 'c2' });
  expect(chamadas(registro, 'rpc/salvar_lancamento_financeiro')[0].corpo).toMatchObject({ p_contraparte: 'Maria Oliveira' });
  await ctx.close();
});

test('estados: vazio, erro, banco sem a migration; layout de 320 a 1920px', async ({ browser }) => {
  const vazio = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(vazio, rotas((c) => (c === 'rpc/buscar_clientes' ? { corpo: [] } : c === 'rpc/resumo_clientes' ? { corpo: { ...RESUMO, total: 0, ativos: 0, inativos: 0, prospects: 0, novos_mes: 0, novos_mes_anterior: 0, a_receber: 0, a_receber_vencido: 0 } } : undefined)));
  const pv = await abrir(vazio);
  await expect(pv.getByText('Nenhum cliente cadastrado ainda.')).toBeVisible({ timeout: 15000 });
  await vazio.close();

  const erro = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(erro, rotas((c) => (c === 'rpc/buscar_clientes' || c === 'rpc/resumo_clientes' ? { status: 500, corpo: { message: 'falha', code: 'XX000' } } : undefined)));
  const pe = await abrir(erro);
  await expect(pe.getByRole('alert').filter({ hasText: 'Não foi possível carregar os clientes.' })).toBeVisible({ timeout: 15000 });
  expect(await texto(pe, 'A receber')).toContain('Indisponível');
  await erro.close();

  const ausente = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sessaoSimulada(ausente, rotas((c) => (c === 'rpc/buscar_clientes' ? { status: 404, corpo: { code: 'PGRST202', message: 'Could not find the function public.buscar_clientes in the schema cache' } } : undefined)));
  const pa = await abrir(ausente);
  await expect(pa.getByTestId('clientes-indisponivel')).toContainText('falta aplicar uma atualização do banco', { timeout: 15000 });
  await ausente.close();

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await sessaoSimulada(ctx, rotas());
  const page = await abrir(ctx);
  await expect(page.getByTestId('cliente-João Silva')).toBeVisible();
  for (const largura of [320, 375, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `@${largura}`).toBeLessThanOrEqual(1);
  }
  await ctx.close();
});

test('CEP preenche o endereço automaticamente (ViaCEP simulado), sem apagar o que foi digitado', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const consultas: string[] = [];
  await ctx.route('https://viacep.com.br/ws/**', (route) => {
    consultas.push(new URL(route.request().url()).pathname);
    const cep = new URL(route.request().url()).pathname.split('/')[2];
    const corpo = cep === '77960000' ? { cep: '77960-000', logradouro: 'Rua Rui Barbosa', bairro: 'Centro', localidade: 'Augustinópolis', uf: 'TO' }
      : cep === '01310100' ? { cep: '01310-100', logradouro: 'Avenida Paulista', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' } : { erro: 'true' };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
  });
  await sessaoSimulada(ctx, rotas());
  const page = await abrir(ctx);
  await page.getByRole('button', { name: 'Novo cliente' }).first().click();
  const m = page.getByRole('dialog', { name: 'Novo cliente' });
  await m.getByLabel('Bairro').fill('Bairro digitado');
  await m.getByLabel('CEP').fill('77960000');
  await expect(m.getByLabel('Logradouro')).toHaveValue('Rua Rui Barbosa');
  await expect(m.getByLabel('Cidade')).toHaveValue('Augustinópolis');
  await expect(m.getByLabel('UF')).toHaveValue('TO');
  await expect(m.getByLabel('Bairro')).toHaveValue('Bairro digitado'); // não sobrescreve o que o usuário digitou
  await expect(m.getByLabel('CEP')).toHaveValue('77960-000');
  await expect(m.getByLabel('Número')).toBeFocused();
  // Outro CEP troca o que veio do CEP anterior
  await m.getByLabel('CEP').fill('01310100');
  await expect(m.getByLabel('Logradouro')).toHaveValue('Avenida Paulista');
  await expect(m.getByLabel('Cidade')).toHaveValue('São Paulo');
  await expect(m.getByLabel('UF')).toHaveValue('SP');
  // CEP inexistente: avisa e mantém os campos
  await m.getByLabel('CEP').fill('99999999');
  await expect(m.getByText('CEP não encontrado. Preencha o endereço manualmente.')).toBeVisible();
  await expect(m.getByLabel('Logradouro')).toHaveValue('Avenida Paulista');
  expect(consultas).toEqual(['/ws/77960000/json/', '/ws/01310100/json/', '/ws/99999999/json/']); // só o CEP sai do navegador
  await ctx.close();
});

test('CNPJ preenche os dados da empresa automaticamente (BrasilAPI simulada), sem apagar o que foi digitado', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const consultas: string[] = [];
  const viacep: string[] = [];
  await ctx.route('https://viacep.com.br/ws/**', (route) => { viacep.push(route.request().url()); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"erro":"true"}' }); });
  await ctx.route('https://brasilapi.com.br/api/cnpj/v1/**', (route) => {
    const cnpj = new URL(route.request().url()).pathname.split('/').pop();
    consultas.push(cnpj ?? '');
    if (cnpj === '11222333000181') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cnpj, razao_social: 'COMERCIAL EXEMPLO LTDA', nome_fantasia: 'EXEMPLO', ddd_telefone_1: '6334939002',
      email: 'CONTATO@EXEMPLO.COM.BR', cep: '77960000', logradouro: 'RUA RUI BARBOSA', numero: '436', complemento: 'SALA 2', bairro: 'CENTRO', municipio: 'AUGUSTINOPOLIS', uf: 'TO' }) });
    if (cnpj === '11444777000161') {
      if (consultas.filter((c) => c === cnpj).length === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cnpj, razao_social: 'SEGUNDA EMPRESA SA', cep: '77001000', logradouro: 'QUADRA 104', numero: 'S/N', bairro: 'PLANO', municipio: 'PALMAS', uf: 'TO' }) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"CNPJ não encontrado"}' });
  });
  await sessaoSimulada(ctx, rotas());
  const page = await abrir(ctx);
  await page.getByRole('button', { name: 'Novo cliente' }).first().click();
  const m = page.getByRole('dialog', { name: 'Novo cliente' });
  await m.getByRole('radio', { name: 'Pessoa jurídica' }).click();
  await m.getByLabel('E-mail').fill('meu@email.com');
  await m.getByLabel('CNPJ (opcional)').fill('11222333000181');
  await expect(m.getByLabel('Razão social')).toHaveValue('COMERCIAL EXEMPLO LTDA');
  await expect(m.getByLabel('Nome fantasia (opcional)')).toHaveValue('EXEMPLO');
  await expect(m.getByLabel('Telefone')).toHaveValue('(63) 3493-9002');
  await expect(m.getByLabel('E-mail')).toHaveValue('meu@email.com'); // não sobrescreve o digitado
  await expect(m.getByLabel('CEP')).toHaveValue('77960-000');
  await expect(m.getByLabel('Logradouro')).toHaveValue('RUA RUI BARBOSA');
  await expect(m.getByLabel('Número')).toHaveValue('436');
  await expect(m.getByLabel('Complemento')).toHaveValue('SALA 2');
  await expect(m.getByLabel('Bairro')).toHaveValue('CENTRO');
  await expect(m.getByLabel('Cidade')).toHaveValue('AUGUSTINOPOLIS');
  await expect(m.getByLabel('UF')).toHaveValue('TO');
  await expect(m.getByText('Dados da empresa preenchidos. Confira antes de salvar.')).toBeVisible();
  expect(viacep).toEqual([]); // o endereço já veio do CNPJ: o CEP não consulta por cima
  // CNPJ inválido não consulta; CNPJ válido não encontrado avisa e mantém os campos
  // Outra empresa: ao digitar o novo CNPJ o que veio da anterior é limpo (o e-mail digitado fica) e a nova é preenchida
  await m.getByLabel('CNPJ (opcional)').fill('11222333000182');
  await expect(m.getByLabel('Razão social')).toHaveValue('');
  await expect(m.getByLabel('Logradouro')).toHaveValue('');
  await expect(m.getByLabel('E-mail')).toHaveValue('meu@email.com');
  await m.getByLabel('CNPJ (opcional)').fill('11444777000161'); // BrasilAPI responde 503 na 1ª e ok na 2ª tentativa
  await expect(m.getByLabel('Razão social')).toHaveValue('SEGUNDA EMPRESA SA', { timeout: 15000 });
  await expect(m.getByLabel('Cidade')).toHaveValue('PALMAS');
  await expect(m.getByLabel('CEP')).toHaveValue('77001-000');
  // CNPJ não encontrado: avisa e deixa os campos livres
  await m.getByLabel('CNPJ (opcional)').fill('45997418000153');
  await expect(m.getByText('Não foi possível buscar os dados deste CNPJ. Preencha manualmente.')).toBeVisible();
  await expect(m.getByLabel('Razão social')).toHaveValue('');
  expect(consultas).toEqual(['11222333000181', '11444777000161', '11444777000161', '45997418000153']);
  // Pessoa física não consulta CNPJ
  await m.getByRole('radio', { name: 'Pessoa física' }).click();
  await m.getByLabel('CPF (opcional)').fill('52998224725');
  expect(consultas).toHaveLength(4); // CPF não consulta
  await ctx.close();
});
