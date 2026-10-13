import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Financeiro — Contas e bancos (API + banco): cadastro/principal/arquivamento, saldos calculados,
// pagamento e recebimento com conta, pagamento parcial bloqueado, duplicidade, concorrência de saldo,
// transferências atômicas, isolamento entre empresas e permissões do contador.

function carregarEnv(): Record<string, string> {
  const texto = readFileSync(join(__dirname, '..', '..', '.env.local'), 'utf8');
  return Object.fromEntries(
    texto
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
  );
}

const env = carregarEnv();
const admin = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anonimo = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const marca = `fc${Date.now()}`;
const usuarios: string[] = [];
const empresas: string[] = [];
const hojeBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const inicioDoMes = (iso: string) => `${iso.slice(0, 7)}-01`;

function cnpjAleatorio(): string {
  const n = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).concat([0, 0, 0, 1]);
  const dv = (b: number[], p: number[]) => {
    const r = b.reduce((s, d, i) => s + d * p[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(n, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv([...n, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const s = [...n, d1, d2].join('');
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
}

async function criarUsuario(rotulo: string, tipo: 'empresa' | 'contador', comEmpresa: boolean) {
  const email = `delivered+${marca}${rotulo}@resend.dev`;
  const senha = `Fc@${Date.now()}x`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw error;
  usuarios.push(data.user.id);
  await admin().from('perfis').update({ tipo_usuario: tipo }).eq('id_usuario', data.user.id);
  const cliente = anonimo();
  await cliente.auth.signInWithPassword({ email, password: senha });
  let idEmpresa = '';
  if (comEmpresa) {
    const { data: r } = await cliente.rpc('criar_empresa', {
      p_cnpj: cnpjAleatorio(), p_razao_social: `EMPRESA ${rotulo} ${marca} LTDA`, p_telefone: '63999990000',
      p_email_comercial: 'teste@resend.dev', p_cidade: 'Palmas', p_estado: 'TO', p_tipo_empresa: 'comum', p_nome_comercial: `${rotulo} ${marca}`,
    });
    idEmpresa = r?.[0]?.id;
    empresas.push(idEmpresa);
    await cliente.rpc('inicializar_categorias_financeiras', { p_id_empresa: idEmpresa });
  }
  return { id: data.user.id, cliente, idEmpresa };
}

const conta = (cli: SupabaseClient, idEmpresa: string, nome: string, saldo: string, tipo = 'conta_corrente', negativo = false) =>
  cli.rpc('salvar_conta_financeira', {
    p_id: null, p_id_empresa: idEmpresa, p_nome: nome, p_instituicao: tipo === 'caixa' ? null : 'Banco Teste', p_tipo: tipo,
    p_saldo_inicial: saldo, p_data_saldo_inicial: inicioDoMes(hojeBR()), p_permite_saldo_negativo: negativo,
  });

async function saldo(cli: SupabaseClient, idConta: string) {
  const { data } = await cli.from('contas_financeiras_saldo').select('saldo').eq('id', idConta).single();
  return Number(data?.saldo);
}

async function categoria(cli: SupabaseClient, idEmpresa: string, tipo: string, nome: string) {
  const { data } = await cli.from('categorias_financeiras').select('id').eq('id_empresa', idEmpresa).eq('tipo', tipo).eq('nome', nome).single();
  return data!.id as string;
}

async function pendente(cli: SupabaseClient, idEmpresa: string, tipo: 'receita' | 'despesa', descricao: string, valor: string) {
  const { data, error } = await cli.rpc('salvar_lancamento_financeiro', {
    p_id: null, p_id_empresa: idEmpresa, p_tipo: tipo, p_descricao: descricao, p_valor: valor,
    p_id_categoria: await categoria(cli, idEmpresa, tipo, tipo === 'receita' ? 'Prestação de serviços' : 'Fornecedores'),
    p_data_competencia: hojeBR(), p_data_vencimento: hojeBR(), p_data_pagamento: null, p_contraparte: null, p_observacoes: null,
  });
  if (error) throw error;
  return data as string;
}

const baixar = (cli: SupabaseClient, id: string, idConta: string, valor: string | number) =>
  cli.rpc('registrar_baixa_lancamento', { p_id: id, p_data_pagamento: hojeBR(), p_id_conta: idConta, p_valor: valor });

test.describe.configure({ mode: 'serial' });
test.setTimeout(4 * 60 * 1000);

let A: Awaited<ReturnType<typeof criarUsuario>>;
let B: Awaited<ReturnType<typeof criarUsuario>>;
let C: Awaited<ReturnType<typeof criarUsuario>>;
const ids: Record<string, string> = {};

test.beforeAll(async () => {
  A = await criarUsuario('a', 'empresa', true);
  B = await criarUsuario('b', 'empresa', true);
  C = await criarUsuario('c', 'contador', false);
});

test.afterAll(async () => {
  const sb = admin();
  for (const tabela of ['historico_lancamentos_financeiros', 'anexos_financeiros', 'movimentacoes_financeiras', 'historico_contas_financeiras', 'transferencias_financeiras', 'lancamentos_financeiros', 'contas_financeiras', 'categorias_financeiras']) {
    if (empresas.length) await sb.from(tabela).delete().in('id_empresa', empresas);
  }
  for (const id of usuarios.reverse()) await sb.auth.admin.deleteUser(id);
});

test('contas: cadastro, principal única, nome duplicado, arquivamento e reativação', async () => {
  const banco = await conta(A.cliente, A.idEmpresa, 'Banco do Brasil', '1000.00');
  const caixa = await conta(A.cliente, A.idEmpresa, 'Caixa físico', '0', 'caixa');
  expect(banco.error).toBeNull();
  expect(caixa.error).toBeNull();
  Object.assign(ids, { banco: banco.data, caixa: caixa.data });
  const principais = async () => (await A.cliente.from('contas_financeiras').select('id').eq('id_empresa', A.idEmpresa).eq('principal', true)).data?.map((c) => c.id);
  expect(await principais(), 'primeira conta vira principal').toEqual([ids.banco]);
  expect((await A.cliente.rpc('definir_conta_principal', { p_id: ids.caixa })).error).toBeNull();
  expect(await principais(), 'só uma principal').toEqual([ids.caixa]);
  expect((await conta(A.cliente, A.idEmpresa, 'banco do brasil', '0')).error?.message).toContain('Já existe uma conta');
  expect(await saldo(A.cliente, ids.banco)).toBe(1000);
  // Cor do card: padrão quando não informada; inválida é recusada; editável
  expect((await A.cliente.from('contas_financeiras').select('cor').eq('id', ids.banco).single()).data?.cor).toBe('#ea580c');
  const corInvalida = await A.cliente.rpc('salvar_conta_financeira', { p_id: ids.banco, p_id_empresa: A.idEmpresa, p_nome: 'Banco do Brasil', p_instituicao: 'Banco Teste', p_tipo: 'conta_corrente', p_saldo_inicial: '1000.00', p_data_saldo_inicial: inicioDoMes(hojeBR()), p_permite_saldo_negativo: false, p_cor: 'vermelho' });
  expect(corInvalida.error?.message).toContain('Cor inválida');
  expect((await A.cliente.rpc('salvar_conta_financeira', { p_id: ids.banco, p_id_empresa: A.idEmpresa, p_nome: 'Banco do Brasil', p_instituicao: 'Banco Teste', p_tipo: 'conta_corrente', p_saldo_inicial: '1000.00', p_data_saldo_inicial: inicioDoMes(hojeBR()), p_permite_saldo_negativo: false, p_cor: '#2563eb' })).error).toBeNull();
  expect((await A.cliente.from('contas_financeiras_saldo').select('cor, saldo').eq('id', ids.banco).single()).data).toEqual({ cor: '#2563eb', saldo: 1000 });

  // Arquivar a principal: deixa de ser principal e não aceita movimentação
  const extra = await conta(A.cliente, A.idEmpresa, 'Conta antiga', '50.00');
  ids.antiga = extra.data;
  expect((await A.cliente.rpc('arquivar_conta_financeira', { p_id: ids.caixa, p_arquivar: true })).error).toBeNull();
  expect(await principais()).toEqual([]);
  const l = await pendente(A.cliente, A.idEmpresa, 'receita', 'Teste arquivada', '10.00');
  expect((await baixar(A.cliente, l, ids.caixa, '10.00')).error?.message).toContain('arquivada');
  expect((await A.cliente.rpc('arquivar_conta_financeira', { p_id: ids.caixa, p_arquivar: false })).error).toBeNull();
  expect((await A.cliente.rpc('definir_conta_principal', { p_id: ids.banco })).error).toBeNull();
  // Histórico de auditoria registra quem fez
  const { data: hist } = await A.cliente.from('historico_contas_financeiras').select('acao, id_usuario').eq('id_conta', ids.caixa);
  expect(hist?.map((h) => h.acao)).toEqual(expect.arrayContaining(['conta_criada', 'conta_principal', 'conta_arquivada', 'conta_reativada']));
  expect(hist?.every((h) => h.id_usuario === A.id)).toBe(true);
  // Nenhuma credencial bancária é armazenada
  const { data: linha } = await A.cliente.from('contas_financeiras').select('*').eq('id', ids.banco).single();
  expect(Object.keys(linha ?? {}).filter((k) => /senha|agencia|numero|token|credencial/i.test(k))).toEqual([]);
});

test('pagamento e recebimento com conta: saldos, parcial bloqueado, duplicidade, saldo insuficiente e estorno', async () => {
  const receita = await pendente(A.cliente, A.idEmpresa, 'receita', 'Serviço recebido', '500.00');
  expect((await baixar(A.cliente, receita, ids.caixa, '500.00')).error).toBeNull();
  expect(await saldo(A.cliente, ids.caixa)).toBe(500);

  const despesa = await pendente(A.cliente, A.idEmpresa, 'despesa', 'Fornecedor X', '300.00');
  expect((await baixar(A.cliente, despesa, ids.banco, '100.00')).error?.message, 'parcial').toContain('Pagamento parcial');
  expect((await baixar(A.cliente, despesa, ids.banco, '300.00')).error).toBeNull();
  expect((await baixar(A.cliente, despesa, ids.banco, '300.00')).error?.message, 'duplicado').toContain('já foi baixado');
  expect(await saldo(A.cliente, ids.banco)).toBe(700);
  const { data: movs } = await A.cliente.from('movimentacoes_financeiras').select('id').eq('id_lancamento', despesa);
  expect(movs, 'uma única movimentação').toHaveLength(1);
  const { data: l } = await A.cliente.from('lancamentos_financeiros_situacao').select('status, conta_nome').eq('id', despesa).single();
  expect(l).toMatchObject({ status: 'pago', conta_nome: 'Banco do Brasil' });

  // Saldo insuficiente sem permissão de negativo
  const grande = await pendente(A.cliente, A.idEmpresa, 'despesa', 'Despesa grande', '5000.00');
  expect((await baixar(A.cliente, grande, ids.banco, '5000.00')).error?.message).toContain('Saldo insuficiente');
  expect(await saldo(A.cliente, ids.banco)).toBe(700);

  // Concorrência de saldo: duas despesas de 400 ao mesmo tempo com saldo 700 → só uma passa
  const d1 = await pendente(A.cliente, A.idEmpresa, 'despesa', 'Concorrente 1', '400.00');
  const d2 = await pendente(A.cliente, A.idEmpresa, 'despesa', 'Concorrente 2', '400.00');
  const r = await Promise.all([baixar(A.cliente, d1, ids.banco, '400.00'), baixar(A.cliente, d2, ids.banco, '400.00')]);
  expect(r.filter((x) => !x.error)).toHaveLength(1);
  expect(await saldo(A.cliente, ids.banco)).toBe(300);

  // Mesmo lançamento pago 5x ao mesmo tempo → uma movimentação
  const d3 = await pendente(A.cliente, A.idEmpresa, 'despesa', 'Cliques repetidos', '10.00');
  const rr = await Promise.all(Array.from({ length: 5 }, () => baixar(A.cliente, d3, ids.banco, '10.00')));
  expect(rr.filter((x) => !x.error)).toHaveLength(1);
  expect((await A.cliente.from('movimentacoes_financeiras').select('id').eq('id_lancamento', d3)).data).toHaveLength(1);
  expect(await saldo(A.cliente, ids.banco)).toBe(290);

  // Estorno: movimentação fica marcada (não some) e o saldo volta; nova baixa gera nova movimentação única
  expect((await A.cliente.rpc('estornar_baixa_lancamento', { p_id: despesa })).error).toBeNull();
  expect(await saldo(A.cliente, ids.banco)).toBe(590);
  const { data: todas } = await A.cliente.from('movimentacoes_financeiras').select('estornada_em').eq('id_lancamento', despesa);
  expect(todas).toHaveLength(1);
  expect(todas?.[0].estornada_em).not.toBeNull();
  expect((await baixar(A.cliente, despesa, ids.caixa, '300.00')).error).toBeNull();
  expect(await saldo(A.cliente, ids.caixa)).toBe(200);
  // Edição de pago não altera valor (evita dessincronizar a conta)
  const editar = await A.cliente.rpc('salvar_lancamento_financeiro', {
    p_id: despesa, p_id_empresa: A.idEmpresa, p_tipo: 'despesa', p_descricao: 'Fornecedor X', p_valor: '999.00',
    p_id_categoria: await categoria(A.cliente, A.idEmpresa, 'despesa', 'Fornecedores'), p_data_competencia: hojeBR(),
    p_data_vencimento: hojeBR(), p_data_pagamento: hojeBR(), p_contraparte: null, p_observacoes: null,
  });
  expect(editar.error?.message).toContain('estorne o pagamento primeiro');
  ids.despesaPaga = despesa;
});

test('transferências: atômicas, não são receita/despesa, validações, concorrência e estorno', async () => {
  const mes = inicioDoMes(hojeBR());
  const antes = (await A.cliente.rpc('resumo_financeiro', { p_id_empresa: A.idEmpresa, p_mes: mes })).data;
  const t = await A.cliente.rpc('realizar_transferencia', { p_id_conta_origem: ids.banco, p_id_conta_destino: ids.caixa, p_valor: '90.00', p_data: hojeBR(), p_descricao: 'Troco' });
  expect(t.error).toBeNull();
  expect(await saldo(A.cliente, ids.banco)).toBe(500);
  expect(await saldo(A.cliente, ids.caixa)).toBe(290);
  const depois = (await A.cliente.rpc('resumo_financeiro', { p_id_empresa: A.idEmpresa, p_mes: mes })).data;
  expect(depois.receitas_mes, 'transferência não é receita').toBe(antes.receitas_mes);
  expect(depois.despesas_mes, 'transferência não é despesa').toBe(antes.despesas_mes);
  expect(depois.saldo_acumulado, 'saldo total não muda').toBe(antes.saldo_acumulado);
  expect(depois.saldo_acumulado).toBe(500 + 290 + 50); // banco + caixa + conta antiga

  const transf = (o: string, d: string, v: string) => A.cliente.rpc('realizar_transferencia', { p_id_conta_origem: o, p_id_conta_destino: d, p_valor: v, p_data: hojeBR(), p_descricao: null });
  expect((await transf(ids.banco, ids.banco, '1.00')).error?.message).toContain('diferentes');
  expect((await transf(ids.banco, ids.caixa, '0')).error).not.toBeNull();
  expect((await transf(ids.banco, ids.caixa, '1.234')).error).not.toBeNull();
  expect((await transf(ids.caixa, ids.banco, '10000.00')).error?.message).toContain('Saldo insuficiente');

  // Duas transferências simultâneas que juntas estouram o saldo do caixa (290) → só uma
  const r = await Promise.all([transf(ids.caixa, ids.banco, '200.00'), transf(ids.caixa, ids.antiga, '200.00')]);
  expect(r.filter((x) => !x.error)).toHaveLength(1);
  expect(await saldo(A.cliente, ids.caixa)).toBe(90);
  // Transferências opostas simultâneas não travam (ordem de travamento fixa)
  const opostas = await Promise.all([transf(ids.banco, ids.antiga, '5.00'), transf(ids.antiga, ids.banco, '5.00')]);
  expect(opostas.filter((x) => !x.error)).toHaveLength(2);

  // Estorno devolve os valores; não estorna duas vezes
  expect((await A.cliente.rpc('estornar_transferencia', { p_id: t.data })).error).toBeNull();
  expect((await A.cliente.rpc('estornar_transferencia', { p_id: t.data })).error?.message).toContain('já foi estornada');
  const { data: movs } = await A.cliente.from('movimentacoes_financeiras').select('estornada_em').eq('id_transferencia', t.data);
  expect(movs?.length).toBe(2);
  expect(movs?.every((m) => m.estornada_em)).toBe(true);
  ids.transferencia = t.data;
});

test('isolamento: outra empresa não vê nem movimenta contas; IDs manipulados são recusados', async () => {
  expect((await B.cliente.from('contas_financeiras').select('id').eq('id_empresa', A.idEmpresa)).data).toHaveLength(0);
  expect((await B.cliente.from('contas_financeiras_saldo').select('id').eq('id_empresa', A.idEmpresa)).data).toHaveLength(0);
  expect((await B.cliente.from('movimentacoes_financeiras').select('id').eq('id_empresa', A.idEmpresa)).data).toHaveLength(0);
  expect((await B.cliente.from('transferencias_financeiras').select('id').eq('id_empresa', A.idEmpresa)).data).toHaveLength(0);
  expect((await B.cliente.rpc('saldo_conta_financeira', { p_id_conta: ids.banco })).data, 'saldo de outra empresa não vaza').toBeNull();
  expect((await conta(B.cliente, A.idEmpresa, 'Invasora', '0')).error).not.toBeNull();
  expect((await B.cliente.rpc('arquivar_conta_financeira', { p_id: ids.banco, p_arquivar: true })).error).not.toBeNull();
  expect((await B.cliente.rpc('definir_conta_principal', { p_id: ids.caixa })).error).not.toBeNull();
  expect((await B.cliente.rpc('estornar_transferencia', { p_id: ids.transferencia })).error).not.toBeNull();
  // Pagar lançamento de B usando conta de A / transferir de A para B
  const contaB = (await conta(B.cliente, B.idEmpresa, 'Banco B', '100.00')).data as string;
  const lancB = await pendente(B.cliente, B.idEmpresa, 'receita', 'Receita B', '10.00');
  expect((await baixar(B.cliente, lancB, ids.banco, '10.00')).error?.message).toContain('Conta financeira inválida');
  expect((await B.cliente.rpc('realizar_transferencia', { p_id_conta_origem: contaB, p_id_conta_destino: ids.banco, p_valor: '1.00', p_data: hojeBR(), p_descricao: null })).error).not.toBeNull();
  expect((await A.cliente.rpc('realizar_transferencia', { p_id_conta_origem: ids.banco, p_id_conta_destino: contaB, p_valor: '1.00', p_data: hojeBR(), p_descricao: null })).error).not.toBeNull();
  // A também não paga lançamento próprio com conta de B
  const lancA = await pendente(A.cliente, A.idEmpresa, 'despesa', 'Despesa A', '1.00');
  expect((await baixar(A.cliente, lancA, contaB, '1.00')).error?.message).toContain('Conta financeira inválida');
  expect(await saldo(B.cliente, contaB)).toBe(100);
  // Escrita direta e funções internas bloqueadas; anônimo sem acesso
  expect((await A.cliente.from('movimentacoes_financeiras').insert({ id_empresa: A.idEmpresa, id_conta: ids.banco, natureza: 'entrada', valor: 1, data: hojeBR(), origem: 'lancamento', id_lancamento: lancA, descricao: 'x' })).error).not.toBeNull();
  expect((await A.cliente.from('contas_financeiras').update({ saldo_inicial: 999999 }).eq('id', ids.banco)).error).not.toBeNull();
  expect((await A.cliente.rpc('travar_conta_para_movimento', { p_id_conta: ids.banco, p_id_empresa: A.idEmpresa, p_saida: 0 })).error).not.toBeNull();
  expect((await anonimo().from('contas_financeiras_saldo').select('id')).data ?? []).toHaveLength(0);
});

test('contador: contas só com permissão explícita; ver ≠ movimentar; revogação corta o acesso', async () => {
  const { data: idVinculo } = await A.cliente.rpc('solicitar_vinculo_contabil', { p_id_empresa: A.idEmpresa, p_id_contador: C.id, p_id_escritorio: null, p_funcao: 'principal', p_permissoes: null });
  await C.cliente.rpc('responder_vinculo_contabil', { p_id_vinculo: idVinculo, p_aceitar: true, p_id_contador: null });
  const transf = () => C.cliente.rpc('realizar_transferencia', { p_id_conta_origem: ids.banco, p_id_conta_destino: ids.caixa, p_valor: '1.00', p_data: hojeBR(), p_descricao: null });
  expect((await C.cliente.from('contas_financeiras_saldo').select('id').eq('id_empresa', A.idEmpresa)).data ?? []).toHaveLength(0);
  expect((await transf()).error).not.toBeNull();

  await A.cliente.rpc('alterar_vinculo_contabil', { p_id_vinculo: idVinculo, p_funcao: 'principal', p_permissoes: ['ver_financeiro'] });
  expect((await C.cliente.from('contas_financeiras_saldo').select('id').eq('id_empresa', A.idEmpresa)).data?.length).toBeGreaterThan(0);
  expect((await transf()).error, 'ver não movimenta').not.toBeNull();
  expect((await conta(C.cliente, A.idEmpresa, 'Do contador', '0')).error).not.toBeNull();

  await A.cliente.rpc('alterar_vinculo_contabil', { p_id_vinculo: idVinculo, p_funcao: 'principal', p_permissoes: ['ver_financeiro', 'gerenciar_financeiro'] });
  expect((await transf()).error).toBeNull();
  const { data: hist } = await A.cliente.from('historico_contas_financeiras').select('id_usuario').eq('acao', 'transferencia').eq('id_usuario', C.id);
  expect(hist?.length, 'auditoria registra o contador').toBe(1);

  await A.cliente.rpc('alterar_vinculo_contabil', { p_id_vinculo: idVinculo, p_funcao: 'principal', p_permissoes: [] });
  expect((await C.cliente.from('contas_financeiras_saldo').select('id').eq('id_empresa', A.idEmpresa)).data ?? []).toHaveLength(0);
  expect((await transf()).error).not.toBeNull();
});
