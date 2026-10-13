import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Parcelamentos (API + banco): contratos, geração atômica, integração com Contas a pagar / Contas e bancos /
// resumo_financeiro, saldo devedor, quitação, estorno, empréstimos e segurança multiempresa.

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
const marca = `ps${Date.now()}`;
const usuarios: string[] = [];
const empresas: string[] = [];
const hojeBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const inicioDoMes = (iso: string) => `${iso.slice(0, 7)}-01`;
const somarDias = (iso: string, d: number) => {
  const x = new Date(`${iso}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
};

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
  const senha = `Ps@${Date.now()}x`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw error;
  usuarios.push(data.user.id);
  await admin().from('perfis').update({ tipo_usuario: tipo }).eq('id_usuario', data.user.id);
  const cliente = anonimo();
  await cliente.auth.signInWithPassword({ email, password: senha });
  let idEmpresa = '';
  if (comEmpresa) {
    const { data: r } = await cliente.rpc('criar_empresa', {
      p_cnpj: cnpjAleatorio(), p_razao_social: `EMPRESA ${rotulo} ${marca} LTDA`, p_telefone: '63999990000', p_email_comercial: 'teste@resend.dev',
      p_cidade: 'Palmas', p_estado: 'TO', p_tipo_empresa: 'comum', p_nome_comercial: `${rotulo} ${marca}`,
    });
    idEmpresa = r?.[0]?.id;
    empresas.push(idEmpresa);
    await cliente.rpc('inicializar_categorias_financeiras', { p_id_empresa: idEmpresa });
  }
  return { id: data.user.id, cliente, idEmpresa };
}

async function categoria(cli: SupabaseClient, idEmpresa: string, tipo: string, nome: string) {
  const { data } = await cli.from('categorias_financeiras').select('id').eq('id_empresa', idEmpresa).eq('tipo', tipo).eq('nome', nome).single();
  return data!.id as string;
}

async function conta(cli: SupabaseClient, idEmpresa: string, nome: string, saldo: string) {
  const { data, error } = await cli.rpc('salvar_conta_financeira', {
    p_id: null, p_id_empresa: idEmpresa, p_nome: nome, p_instituicao: 'Banco Teste', p_tipo: 'conta_corrente', p_saldo_inicial: saldo,
    p_data_saldo_inicial: inicioDoMes(hojeBR()), p_permite_saldo_negativo: false,
  });
  if (error) throw error;
  return data as string;
}

const saldoConta = async (cli: SupabaseClient, id: string) => Number((await cli.from('contas_financeiras_saldo').select('saldo').eq('id', id).single()).data?.saldo);
const resumoContrato = async (cli: SupabaseClient, id: string) => (await cli.from('contratos_parcelados_resumo').select('*').eq('id', id).single()).data;

type Parcela = { numero: number; vencimento: string; valor: string | number; juros?: string | number };
const criarContrato = (cli: SupabaseClient, p: Record<string, unknown>) =>
  cli.rpc('criar_contrato_parcelado', {
    p_contraparte: 'Fornecedor ABC', p_descricao: null, p_taxa_juros: null, p_id_conta_financeira: null, p_entrada: null, p_modalidade: 'personalizadas', ...p,
  });

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
  ids.catForn = await categoria(A.cliente, A.idEmpresa, 'despesa', 'Fornecedores');
  ids.contaA = await conta(A.cliente, A.idEmpresa, 'Banco A', '20000.00');
  ids.contaB = await conta(B.cliente, B.idEmpresa, 'Banco B', '5000.00');
});

test.afterAll(async () => {
  const sb = admin();
  for (const t of ['historico_lancamentos_financeiros', 'anexos_financeiros', 'movimentacoes_financeiras', 'historico_contas_financeiras',
    'transferencias_financeiras', 'historico_contratos', 'anexos_contratos', 'lancamentos_financeiros', 'contratos_parcelados', 'contas_financeiras', 'categorias_financeiras']) {
    if (empresas.length) await sb.from(t).delete().in('id_empresa', empresas);
  }
  for (const id of usuarios.reverse()) await sb.auth.admin.deleteUser(id);
});

test('parcelas fixas: geração determinística no servidor, datas e integração com Contas a pagar', async () => {
  const hoje = hojeBR();
  const { data: sim } = await A.cliente.rpc('simular_parcelas_fixas', { p_valor_total: '1000.00', p_entrada: 0, p_quantidade: 3, p_primeira: '2026-01-31' });
  expect(sim).toEqual([
    { numero: 1, vencimento: '2026-01-31', valor: 333.33 },
    { numero: 2, vencimento: '2026-02-28', valor: 333.33 },
    { numero: 3, vencimento: '2026-03-31', valor: 333.34 },
  ]);
  const { data: parcelas } = await A.cliente.rpc('simular_parcelas_fixas', { p_valor_total: '12000.00', p_entrada: 0, p_quantidade: 12, p_primeira: somarDias(hoje, 10) });
  const r = await criarContrato(A.cliente, {
    p_id_empresa: A.idEmpresa, p_nome: 'Compra da máquina', p_tipo: 'compra_parcelada', p_id_categoria: ids.catForn, p_data_contratacao: hoje,
    p_valor_principal: '12000.00', p_valor_total: '12000.00', p_modalidade: 'fixas', p_parcelas: parcelas,
  });
  expect(r.error).toBeNull();
  ids.maquina = r.data;
  const { data: lista } = await A.cliente.from('lancamentos_financeiros_situacao').select('numero_parcela, valor, status, contrato_nome, natureza_financeira, contrato_qtd_parcelas')
    .eq('id_contrato', ids.maquina).order('numero_parcela');
  expect(lista).toHaveLength(12);
  expect(lista?.[0]).toMatchObject({ numero_parcela: 1, valor: 1000, status: 'pendente', contrato_nome: 'Compra da máquina', natureza_financeira: 'operacional', contrato_qtd_parcelas: 12 });
  const res = await resumoContrato(A.cliente, ids.maquina);
  expect(res).toMatchObject({ qtd_parcelas: 12, qtd_pagas: 0, saldo_devedor: 12000, situacao: 'ativo', percentual_quitado: 0 });
  // Criar o contrato não mexe na conta nem nos indicadores realizados
  expect(await saldoConta(A.cliente, ids.contaA)).toBe(20000);
  const { data: resumo } = await A.cliente.rpc('resumo_financeiro', { p_id_empresa: A.idEmpresa, p_mes: inicioDoMes(hoje) });
  expect(resumo.despesas_mes).toBe(0);
  // Parcelas fixas adulteradas são recusadas
  const adulteradas = (parcelas as Parcela[]).map((p, i) => (i === 0 ? { ...p, valor: 999.99 } : i === 11 ? { ...p, valor: 1000.01 } : p));
  const ruim = await criarContrato(A.cliente, {
    p_id_empresa: A.idEmpresa, p_nome: 'Adulterado', p_tipo: 'compra_parcelada', p_id_categoria: ids.catForn, p_data_contratacao: hoje,
    p_valor_principal: '12000.00', p_valor_total: '12000.00', p_modalidade: 'fixas', p_parcelas: adulteradas,
  });
  expect(ruim.error?.message).toContain('Parcelas fixas não conferem');
});

test('personalizadas com entrada; soma, datas e dados inválidos recusados; geração atômica', async () => {
  const hoje = hojeBR();
  const base = { p_id_empresa: A.idEmpresa, p_tipo: 'boleto_parcelado', p_id_categoria: ids.catForn, p_data_contratacao: hoje, p_valor_principal: '12000.00', p_valor_total: '12000.00' };
  const dez = Array.from({ length: 10 }, (_, i) => ({ numero: i + 1, vencimento: somarDias(hoje, 30 * (i + 1)), valor: '1000.00' }));
  const ok = await criarContrato(A.cliente, { ...base, p_nome: 'Boleto com entrada', p_entrada: { valor: '2000.00', vencimento: hoje }, p_parcelas: dez });
  expect(ok.error).toBeNull();
  ids.boleto = ok.data;
  const res = await resumoContrato(A.cliente, ids.boleto);
  expect(res).toMatchObject({ qtd_parcelas: 10, tem_entrada: true, saldo_devedor: 12000 });
  const { data: entrada } = await A.cliente.from('lancamentos_financeiros').select('valor, status').eq('id_contrato', ids.boleto).eq('numero_parcela', 0).single();
  expect(entrada).toEqual({ valor: 2000, status: 'pendente' });

  const antes = (await admin().from('contratos_parcelados').select('id').eq('id_empresa', A.idEmpresa)).data?.length;
  const lancAntes = (await admin().from('lancamentos_financeiros').select('id').eq('id_empresa', A.idEmpresa)).data?.length;
  const invalidos: [string, Record<string, unknown>][] = [
    ['soma diferente', { p_parcelas: dez }],
    ['quantidade zero', { p_parcelas: [] }],
    ['valor negativo', { p_valor_total: '-1.00', p_parcelas: dez }],
    ['3 casas decimais', { p_valor_total: '10000.001', p_parcelas: dez }],
    ['data antes da contratação', { p_valor_total: '1000.00', p_parcelas: [{ numero: 1, vencimento: somarDias(hoje, -5), valor: '1000.00' }] }],
    ['datas fora de ordem', { p_valor_total: '2000.00', p_parcelas: [{ numero: 1, vencimento: somarDias(hoje, 60), valor: '1000.00' }, { numero: 2, vencimento: somarDias(hoje, 30), valor: '1000.00' }] }],
    ['numeração errada', { p_valor_total: '1000.00', p_parcelas: [{ numero: 2, vencimento: hoje, valor: '1000.00' }] }],
    ['data inexistente', { p_valor_total: '1000.00', p_parcelas: [{ numero: 1, vencimento: '2026-02-30', valor: '1000.00' }] }],
    ['categoria de receita', { p_valor_total: '1000.00', p_id_categoria: await categoria(A.cliente, A.idEmpresa, 'receita', 'Outras receitas'), p_parcelas: [{ numero: 1, vencimento: hoje, valor: '1000.00' }] }],
    ['conta de outra empresa', { p_valor_total: '1000.00', p_id_conta_financeira: ids.contaB, p_parcelas: [{ numero: 1, vencimento: hoje, valor: '1000.00' }] }],
    // Falha na ÚLTIMA parcela (juros > valor): nada pode sobrar gravado
    ['erro na última parcela', { p_valor_total: '2000.00', p_parcelas: [{ numero: 1, vencimento: hoje, valor: '1000.00' }, { numero: 2, vencimento: hoje, valor: '1000.00', juros: '5000.00' }] }],
  ];
  for (const [nome, extra] of invalidos) {
    const r = await criarContrato(A.cliente, { ...base, p_nome: `Inválido ${nome}`, ...extra });
    expect(r.error, nome).not.toBeNull();
  }
  expect((await admin().from('contratos_parcelados').select('id').eq('id_empresa', A.idEmpresa)).data?.length, 'nenhum contrato parcial').toBe(antes);
  expect((await admin().from('lancamentos_financeiros').select('id').eq('id_empresa', A.idEmpresa)).data?.length, 'nenhuma parcela órfã').toBe(lancAntes);
});

test('pagamento pela baixa existente: conta, saldo, duplicidade, concorrência, estorno, saldo devedor e quitação', async () => {
  const hoje = hojeBR();
  const r = await criarContrato(A.cliente, {
    p_id_empresa: A.idEmpresa, p_nome: 'Duas parcelas', p_tipo: 'compra_parcelada', p_id_categoria: ids.catForn, p_data_contratacao: somarDias(hoje, -10),
    p_valor_principal: '3000.00', p_valor_total: '3000.00',
    p_parcelas: [{ numero: 1, vencimento: somarDias(hoje, -1), valor: '1000.00' }, { numero: 2, vencimento: somarDias(hoje, 30), valor: '2000.00' }],
  });
  ids.duas = r.data;
  expect((await resumoContrato(A.cliente, ids.duas))?.situacao, 'parcela vencida → em atraso').toBe('em_atraso');
  const { data: parcelas } = await A.cliente.from('lancamentos_financeiros').select('id, numero_parcela').eq('id_contrato', ids.duas).order('numero_parcela');
  const [p1, p2] = parcelas!.map((p) => p.id);
  const baixar = (id: string, valor: string, idConta = ids.contaA) => A.cliente.rpc('registrar_baixa_lancamento', { p_id: id, p_data_pagamento: hoje, p_id_conta: idConta, p_valor: valor });

  // Parcial bloqueado; 5 pagamentos simultâneos → 1
  expect((await baixar(p1, '500.00')).error?.message).toContain('Pagamento parcial');
  const rr = await Promise.all(Array.from({ length: 5 }, () => baixar(p1, '1000.00')));
  expect(rr.filter((x) => !x.error)).toHaveLength(1);
  expect((await A.cliente.from('movimentacoes_financeiras').select('id').eq('id_lancamento', p1)).data).toHaveLength(1);
  expect(await saldoConta(A.cliente, ids.contaA)).toBe(19000);
  expect(await resumoContrato(A.cliente, ids.duas)).toMatchObject({ qtd_pagas: 1, saldo_devedor: 2000, situacao: 'ativo', percentual_quitado: 33.3 });

  // Conta de outra empresa recusada
  expect((await baixar(p2, '2000.00', ids.contaB)).error?.message).toContain('Conta financeira inválida');
  // Quitação
  expect((await baixar(p2, '2000.00')).error).toBeNull();
  expect(await resumoContrato(A.cliente, ids.duas)).toMatchObject({ qtd_pagas: 2, saldo_devedor: 0, situacao: 'quitado', percentual_quitado: 100 });
  // Estorno reabre (movimentação preservada como estornada)
  expect((await A.cliente.rpc('estornar_baixa_lancamento', { p_id: p2 })).error).toBeNull();
  expect((await A.cliente.rpc('estornar_baixa_lancamento', { p_id: p2 })).error, 'estorno duplicado').not.toBeNull();
  expect(await resumoContrato(A.cliente, ids.duas)).toMatchObject({ qtd_pagas: 1, saldo_devedor: 2000, situacao: 'ativo' });
  expect(await saldoConta(A.cliente, ids.contaA)).toBe(19000);
  const { data: movs } = await A.cliente.from('movimentacoes_financeiras').select('estornada_em').eq('id_lancamento', p2);
  expect(movs?.length).toBe(1);
  expect(movs?.[0].estornada_em).not.toBeNull();

  // Indicadores sem duplicidade: só o pago entra; o contrato em si não é despesa
  const { data: res } = await A.cliente.rpc('resumo_financeiro', { p_id_empresa: A.idEmpresa, p_mes: inicioDoMes(hoje) });
  expect(res).toMatchObject({ despesas_mes: 1000, pagamentos_financiamentos_mes: 0, saldo_acumulado: 19000 });
  const { data: rp } = await A.cliente.rpc('resumo_parcelamentos', { p_id_empresa: A.idEmpresa });
  expect(rp.parcelas_pagas).toBe(1);
  expect(rp.saldo_devedor_total).toBe(12000 + 12000 + 2000); // máquina + boleto (com entrada) + duas parcelas
  const { data: rpTipo } = await A.cliente.rpc('resumo_parcelamentos', { p_id_empresa: A.idEmpresa, p_tipo: 'boleto_parcelado' });
  expect(rpTipo.saldo_devedor_total).toBe(12000);
  ids.p2 = p2;

  // Parcelas protegidas pelas telas genéricas
  expect((await A.cliente.rpc('cancelar_lancamento_financeiro', { p_id: p2 })).error?.message).toContain('pertence a um contrato');
  expect((await A.cliente.rpc('excluir_lancamento_financeiro', { p_id: p2 })).error?.message).toContain('pertence a um contrato');
  const editar = await A.cliente.rpc('salvar_lancamento_financeiro', {
    p_id: p2, p_id_empresa: A.idEmpresa, p_tipo: 'despesa', p_descricao: 'Mudar valor', p_valor: '1.00', p_id_categoria: ids.catForn,
    p_data_competencia: hoje, p_data_vencimento: somarDias(hoje, 30), p_data_pagamento: null, p_contraparte: null, p_observacoes: null,
  });
  expect(editar.error?.message).toContain('pertence a um contrato');
});

test('empréstimo: parcelas não viram despesa operacional; juros informados separados', async () => {
  const hoje = hojeBR();
  const catImp = await categoria(A.cliente, A.idEmpresa, 'despesa', 'Impostos');
  const r = await criarContrato(A.cliente, {
    p_id_empresa: A.idEmpresa, p_nome: 'Capital de giro', p_tipo: 'emprestimo', p_contraparte: 'ProCred', p_id_categoria: catImp, p_data_contratacao: hoje,
    p_valor_principal: '2000.00', p_valor_total: '2200.00', p_taxa_juros: '1.49',
    p_parcelas: [{ numero: 1, vencimento: hoje, valor: '1100.00', juros: '100.00' }, { numero: 2, vencimento: somarDias(hoje, 30), valor: '1100.00', juros: '100.00' }],
  });
  expect(r.error).toBeNull();
  const { data: p } = await A.cliente.from('lancamentos_financeiros').select('id, natureza_financeira, valor_juros').eq('id_contrato', r.data).eq('numero_parcela', 1).single();
  expect(p).toMatchObject({ natureza_financeira: 'financiamento', valor_juros: 100 });
  expect((await A.cliente.rpc('registrar_baixa_lancamento', { p_id: p!.id, p_data_pagamento: hoje, p_id_conta: ids.contaA, p_valor: '1100.00' })).error).toBeNull();
  const { data: res } = await A.cliente.rpc('resumo_financeiro', { p_id_empresa: A.idEmpresa, p_mes: inicioDoMes(hoje) });
  expect(res).toMatchObject({ despesas_mes: 1000, pagamentos_financiamentos_mes: 1100, juros_financiamentos_mes: 100, saldo_acumulado: 17900 });
  expect(res.despesas_por_categoria.find((c: { categoria: string }) => c.categoria === 'Impostos'), 'empréstimo fora das despesas por categoria').toBeUndefined();
  expect(res.serie.at(-1).despesas, 'fluxo de caixa inclui a saída real').toBe(2100);
  ids.emprestimo = r.data;
});

test('cancelar e excluir: preserva pagos; exclusão só sem pagamentos', async () => {
  expect((await A.cliente.rpc('excluir_contrato_parcelado', { p_id: ids.duas })).error?.message).toContain('tem pagamentos registrados');
  expect((await A.cliente.rpc('cancelar_contrato_parcelado', { p_id: ids.duas, p_motivo: '' })).error?.message).toContain('motivo');
  expect((await A.cliente.rpc('cancelar_contrato_parcelado', { p_id: ids.duas, p_motivo: 'Renegociado' })).error).toBeNull();
  expect((await A.cliente.rpc('cancelar_contrato_parcelado', { p_id: ids.duas, p_motivo: 'De novo' })).error?.message).toContain('já está cancelado');
  const { data: parcelas } = await admin().from('lancamentos_financeiros').select('numero_parcela, status').eq('id_contrato', ids.duas).order('numero_parcela');
  expect(parcelas).toEqual([{ numero_parcela: 1, status: 'pago' }, { numero_parcela: 2, status: 'cancelado' }]);
  expect((await resumoContrato(A.cliente, ids.duas))?.situacao).toBe('cancelado');
  // Sem pagamentos: pode excluir (lógico) — some das listas e das Contas a pagar
  expect((await A.cliente.rpc('excluir_contrato_parcelado', { p_id: ids.boleto })).error).toBeNull();
  expect((await A.cliente.from('contratos_parcelados_resumo').select('id').eq('id', ids.boleto)).data).toHaveLength(0);
  expect((await A.cliente.from('lancamentos_financeiros_situacao').select('id').eq('id_contrato', ids.boleto)).data).toHaveLength(0);
  expect((await admin().from('contratos_parcelados').select('excluido_em').eq('id', ids.boleto).single()).data?.excluido_em).not.toBeNull();
});

test('segurança: outra empresa, IDs manipulados, escrita direta e contador por permissão', async () => {
  const hoje = hojeBR();
  // Outra empresa
  expect((await B.cliente.from('contratos_parcelados').select('id').eq('id', ids.maquina)).data).toHaveLength(0);
  expect((await B.cliente.from('contratos_parcelados_resumo').select('id').eq('id_empresa', A.idEmpresa)).data).toHaveLength(0);
  expect((await B.cliente.rpc('resumo_parcelamentos', { p_id_empresa: A.idEmpresa })).error).not.toBeNull();
  expect((await B.cliente.rpc('cancelar_contrato_parcelado', { p_id: ids.maquina, p_motivo: 'Invasão' })).error).not.toBeNull();
  expect((await B.cliente.rpc('excluir_contrato_parcelado', { p_id: ids.maquina })).error).not.toBeNull();
  const { data: parcelaA } = await admin().from('lancamentos_financeiros').select('id').eq('id_contrato', ids.maquina).eq('numero_parcela', 1).single();
  expect((await B.cliente.rpc('registrar_baixa_lancamento', { p_id: parcelaA!.id, p_data_pagamento: hoje, p_id_conta: ids.contaB, p_valor: '1000.00' })).error).not.toBeNull();
  // Contrato em A com categoria de B / criar contrato na empresa de A
  const catB = await categoria(B.cliente, B.idEmpresa, 'despesa', 'Fornecedores');
  expect((await criarContrato(A.cliente, { p_id_empresa: A.idEmpresa, p_nome: 'Cat alheia', p_tipo: 'compra_parcelada', p_id_categoria: catB, p_data_contratacao: hoje, p_valor_principal: '10.00', p_valor_total: '10.00', p_parcelas: [{ numero: 1, vencimento: hoje, valor: '10.00' }] })).error).not.toBeNull();
  expect((await criarContrato(B.cliente, { p_id_empresa: A.idEmpresa, p_nome: 'Invasão', p_tipo: 'compra_parcelada', p_id_categoria: ids.catForn, p_data_contratacao: hoje, p_valor_principal: '10.00', p_valor_total: '10.00', p_parcelas: [{ numero: 1, vencimento: hoje, valor: '10.00' }] })).error).not.toBeNull();
  // Escrita direta bloqueada
  expect((await A.cliente.from('contratos_parcelados').update({ valor_total: 1 }).eq('id', ids.maquina)).error).not.toBeNull();
  expect((await A.cliente.from('lancamentos_financeiros').update({ id_contrato: null }).eq('id', parcelaA!.id)).error).not.toBeNull();
  expect((await anonimo().from('contratos_parcelados_resumo').select('id')).data ?? []).toHaveLength(0);

  // Contador: sem permissão → nada; ver → lê; gerenciar → paga; revogação → nada
  const { data: idVinculo } = await A.cliente.rpc('solicitar_vinculo_contabil', { p_id_empresa: A.idEmpresa, p_id_contador: C.id, p_id_escritorio: null, p_funcao: 'principal', p_permissoes: null });
  await C.cliente.rpc('responder_vinculo_contabil', { p_id_vinculo: idVinculo, p_aceitar: true, p_id_contador: null });
  const ver = () => C.cliente.from('contratos_parcelados_resumo').select('id').eq('id_empresa', A.idEmpresa);
  const pagar = () => C.cliente.rpc('registrar_baixa_lancamento', { p_id: parcelaA!.id, p_data_pagamento: hoje, p_id_conta: ids.contaA, p_valor: '1000.00' });
  expect((await ver()).data ?? []).toHaveLength(0);
  expect((await pagar()).error).not.toBeNull();
  await A.cliente.rpc('alterar_vinculo_contabil', { p_id_vinculo: idVinculo, p_funcao: 'principal', p_permissoes: ['ver_financeiro'] });
  expect((await ver()).data?.length).toBeGreaterThan(0);
  expect((await pagar()).error, 'ver não paga').not.toBeNull();
  await A.cliente.rpc('alterar_vinculo_contabil', { p_id_vinculo: idVinculo, p_funcao: 'principal', p_permissoes: ['ver_financeiro', 'gerenciar_financeiro'] });
  expect((await pagar()).error).toBeNull();
  await A.cliente.rpc('alterar_vinculo_contabil', { p_id_vinculo: idVinculo, p_funcao: 'principal', p_permissoes: [] });
  expect((await ver()).data ?? []).toHaveLength(0);
  expect((await C.cliente.rpc('resumo_parcelamentos', { p_id_empresa: A.idEmpresa })).error).not.toBeNull();
});
