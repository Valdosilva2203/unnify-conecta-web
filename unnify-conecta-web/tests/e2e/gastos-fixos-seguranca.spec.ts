import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Gastos fixos (API + banco): contextos empresa e plataforma isolados, recorrência sem duplicidade (inclusive concorrente),
// edição sem alterar pagamentos, pausar/reativar/encerrar, pagamento/estorno sem duplicar, contador e categorias da plataforma.

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
const marca = `gf${Date.now()}`;
const usuarios: string[] = [];
const empresas: string[] = [];
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const inicioMes = `${hoje.slice(0, 7)}-01`;
const dia = Number(hoje.slice(8, 10));
const amanha = (() => { const x = new Date(`${hoje}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); })();

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

async function criarUsuario(rotulo: string, tipo: 'empresa' | 'contador', comEmpresa: boolean, funcao?: 'admin' | 'admin_master') {
  const email = `delivered+${marca}${rotulo}@resend.dev`;
  const senha = `Gf@${Date.now()}x`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw error;
  usuarios.push(data.user.id);
  await admin().from('perfis').update({ tipo_usuario: tipo, ...(funcao ? { funcao_global: funcao } : {}) }).eq('id_usuario', data.user.id);
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

const categoria = async (cli: SupabaseClient, idEmpresa: string, nome: string) =>
  (await cli.from('categorias_financeiras').select('id').eq('id_empresa', idEmpresa).eq('tipo', 'despesa').eq('nome', nome).single()).data!.id as string;

const salvarGasto = (cli: SupabaseClient, p: Record<string, unknown>) =>
  cli.rpc('salvar_gasto_fixo', {
    p_id: null, p_contraparte: 'Fornecedor', p_subcategoria: null, p_tipo_valor: 'fixo', p_recorrencia: 'mensal', p_dia_vencimento: dia,
    p_data_inicio: inicioMes, p_data_termino: null, p_id_conta_financeira: null, p_observacoes: null, ...p,
  });

const ocorrencias = async (cli: SupabaseClient, idGasto: string) =>
  ((await cli.from('ocorrencias_gastos_fixos').select('id, competencia, data_vencimento, valor, status').eq('id_gasto_fixo', idGasto).order('competencia')).data ?? []);

test.describe.configure({ mode: 'serial' });
test.setTimeout(4 * 60 * 1000);

let A: Awaited<ReturnType<typeof criarUsuario>>;
let B: Awaited<ReturnType<typeof criarUsuario>>;
let C: Awaited<ReturnType<typeof criarUsuario>>;
let M: Awaited<ReturnType<typeof criarUsuario>>;
let AD: Awaited<ReturnType<typeof criarUsuario>>;
const ids: Record<string, string> = {};

test.beforeAll(async () => {
  A = await criarUsuario('a', 'empresa', true);
  B = await criarUsuario('b', 'empresa', true);
  C = await criarUsuario('c', 'contador', false);
  M = await criarUsuario('m', 'empresa', false, 'admin_master');
  AD = await criarUsuario('ad', 'empresa', false, 'admin');
  ids.catA = await categoria(A.cliente, A.idEmpresa, 'Aluguel');
  ids.catB = await categoria(B.cliente, B.idEmpresa, 'Aluguel');
  const { data: contaA } = await A.cliente.rpc('salvar_conta_financeira', {
    p_id: null, p_id_empresa: A.idEmpresa, p_nome: 'Banco A', p_instituicao: 'Banco', p_tipo: 'conta_corrente', p_saldo_inicial: '10000.00',
    p_data_saldo_inicial: inicioMes, p_permite_saldo_negativo: false,
  });
  ids.contaA = contaA as string;
  const { data: catP, error } = await M.cliente.rpc('salvar_categoria_plataforma', { p_id: null, p_nome: `Servidores ${marca}`, p_cor: '#3b82f6', p_icone: 'laptop' });
  if (error) throw error;
  ids.catP = catP as string;
});

test.afterAll(async () => {
  const sb = admin();
  const { data: gastos } = await sb.from('gastos_fixos').select('id').or(`id_empresa.in.(${empresas.join(',')}),criado_por.in.(${usuarios.join(',')})`);
  const idsGastos = (gastos ?? []).map((g) => g.id);
  if (idsGastos.length) {
    await sb.from('historico_gastos_fixos').delete().in('id_gasto_fixo', idsGastos);
    await sb.from('anexos_gastos_fixos').delete().in('id_gasto_fixo', idsGastos);
    await sb.from('ocorrencias_gastos_plataforma').delete().in('id_gasto_fixo', idsGastos);
  }
  for (const idEmpresa of empresas) {
    for (const t of ['historico_lancamentos_financeiros', 'movimentacoes_financeiras', 'historico_contas_financeiras', 'lancamentos_financeiros']) {
      await sb.from(t).delete().eq('id_empresa', idEmpresa);
    }
  }
  if (idsGastos.length) await sb.from('gastos_fixos').delete().in('id', idsGastos);
  for (const idEmpresa of empresas) {
    for (const t of ['contas_financeiras', 'categorias_financeiras']) await sb.from(t).delete().eq('id_empresa', idEmpresa);
  }
  // Só as categorias da plataforma criadas por este teste (as do Admin Master real não são tocadas)
  await sb.from('categorias_financeiras').delete().is('id_empresa', null).in('criado_por', usuarios);
  for (const id of usuarios) await sb.auth.admin.deleteUser(id);
});

test('empresa: ocorrências em Contas a pagar, sem duplicidade e edição sem alterar pagamento', async () => {
  const { data: idGasto, error } = await salvarGasto(A.cliente, {
    p_contexto: 'empresa', p_id_empresa: A.idEmpresa, p_nome: 'Aluguel do escritório', p_id_categoria: ids.catA, p_valor: '1200.00', p_id_conta_financeira: ids.contaA,
  });
  expect(error).toBeNull();
  ids.gastoA = idGasto as string;
  // Gera o mês atual e o seguinte
  let occ = await ocorrencias(A.cliente, ids.gastoA);
  expect(occ.map((o) => o.data_vencimento)[0]).toBe(hoje);
  expect(occ).toHaveLength(2);
  // Viram despesas pendentes comuns (Contas a pagar)
  const { data: pagar } = await A.cliente.from('lancamentos_financeiros_situacao').select('id, descricao, valor, status, tipo').eq('id_empresa', A.idEmpresa).eq('tipo', 'despesa');
  expect(pagar?.filter((l) => l.descricao === 'Aluguel do escritório')).toHaveLength(2);

  // Geração repetida e concorrente não duplica
  const r = await Promise.all(Array.from({ length: 5 }, () => A.cliente.rpc('gerar_ocorrencias_gastos_fixos', { p_contexto: 'empresa', p_id_empresa: A.idEmpresa })));
  expect(r.every((x) => !x.error)).toBe(true);
  expect(r.reduce((s, x) => s + Number(x.data), 0)).toBe(0);
  expect(await ocorrencias(A.cliente, ids.gastoA)).toHaveLength(2);

  // Paga a ocorrência de hoje pela baixa existente; 5 tentativas simultâneas → 1 movimentação
  const pagamentos = await Promise.all(Array.from({ length: 5 }, () =>
    A.cliente.rpc('registrar_baixa_lancamento', { p_id: occ[0].id, p_data_pagamento: hoje, p_id_conta: ids.contaA, p_valor: '1200.00' })));
  expect(pagamentos.filter((x) => !x.error)).toHaveLength(1);
  const { data: movs } = await admin().from('movimentacoes_financeiras').select('id').eq('id_lancamento', occ[0].id);
  expect(movs).toHaveLength(1);

  // Editar valor: a paga fica intacta; a futura pendente acompanha; histórico registra
  const { error: eEd } = await salvarGasto(A.cliente, {
    p_id: ids.gastoA, p_contexto: 'empresa', p_id_empresa: A.idEmpresa, p_nome: 'Aluguel do escritório', p_id_categoria: ids.catA, p_valor: '1350.00', p_id_conta_financeira: ids.contaA,
  });
  expect(eEd).toBeNull();
  occ = await ocorrencias(A.cliente, ids.gastoA);
  expect(occ.map((o) => [Number(o.valor), o.status])).toEqual([[1200, 'pago'], [1350, 'pendente']]);
  const { data: hist } = await A.cliente.from('historico_gastos_fixos').select('acao').eq('id_gasto_fixo', ids.gastoA);
  expect(hist?.map((h) => h.acao).sort()).toEqual(['criado', 'editado']);

  // Mudar o dia: a pendente fora da nova agenda é cancelada e a nova data é gerada; a paga não muda
  const novoDia = dia === 28 ? 27 : 28;
  await salvarGasto(A.cliente, {
    p_id: ids.gastoA, p_contexto: 'empresa', p_id_empresa: A.idEmpresa, p_nome: 'Aluguel do escritório', p_id_categoria: ids.catA, p_valor: '1350.00',
    p_dia_vencimento: novoDia, p_id_conta_financeira: ids.contaA,
  });
  occ = await ocorrencias(A.cliente, ids.gastoA);
  expect(occ.filter((o) => o.status === 'pago')).toHaveLength(1);
  expect(occ.filter((o) => o.status === 'pago')[0].data_vencimento).toBe(hoje);
  expect(occ.filter((o) => o.status === 'pendente').every((o) => Number(o.data_vencimento.slice(8, 10)) === novoDia)).toBe(true);
  expect(new Set(occ.map((o) => o.competencia)).size).toBe(occ.length);

  // Resumo do mês: total = pago + pendente (com previsão), só despesa da empresa
  const { data: resumo } = await A.cliente.rpc('resumo_gastos_fixos', { p_contexto: 'empresa', p_id_empresa: A.idEmpresa, p_mes: inicioMes });
  expect(Number(resumo.pago_mes)).toBe(1200);
  expect(Number(resumo.total_mes)).toBe(Number(resumo.pago_mes) + Number(resumo.pendente_mes));
  expect(resumo.gastos_ativos).toBe(1);
});

test('empresa: pausar cancela as futuras, reativar reabre, encerrar é definitivo', async () => {
  const pendentes = async () => (await ocorrencias(A.cliente, ids.gastoA)).filter((o) => o.status === 'pendente').length;
  const antes = await pendentes();
  expect(antes).toBeGreaterThan(0);
  expect((await A.cliente.rpc('alterar_situacao_gasto_fixo', { p_id: ids.gastoA, p_acao: 'pausar' })).error).toBeNull();
  expect(await pendentes()).toBe(0);
  expect((await A.cliente.rpc('gerar_ocorrencias_gastos_fixos', { p_contexto: 'empresa', p_id_empresa: A.idEmpresa })).data).toBe(0);
  expect((await A.cliente.rpc('alterar_situacao_gasto_fixo', { p_id: ids.gastoA, p_acao: 'reativar' })).error).toBeNull();
  expect(await pendentes()).toBe(antes);
  expect((await A.cliente.rpc('alterar_situacao_gasto_fixo', { p_id: ids.gastoA, p_acao: 'encerrar', p_data_termino: hoje })).error).toBeNull();
  const occ = await ocorrencias(A.cliente, ids.gastoA);
  expect(occ.filter((o) => o.status === 'pendente' && o.data_vencimento > hoje)).toHaveLength(0);
  expect(occ.filter((o) => o.status === 'pago')).toHaveLength(1);
  expect((await A.cliente.rpc('alterar_situacao_gasto_fixo', { p_id: ids.gastoA, p_acao: 'reativar' })).error).not.toBeNull();
  const { error } = await salvarGasto(A.cliente, { p_id: ids.gastoA, p_contexto: 'empresa', p_id_empresa: A.idEmpresa, p_nome: 'X', p_id_categoria: ids.catA, p_valor: '1.00' });
  expect(error?.message).toContain('encerrado');
  const { data: hist } = await A.cliente.from('historico_gastos_fixos').select('acao').eq('id_gasto_fixo', ids.gastoA);
  expect(hist?.map((h) => h.acao)).toEqual(expect.arrayContaining(['pausado', 'reativado', 'encerrado']));
});

test('plataforma: Admin Master cadastra, paga sem duplicar, estorna; parcial e data futura bloqueados', async () => {
  const { data: idGasto, error } = await salvarGasto(M.cliente, {
    p_contexto: 'plataforma', p_id_empresa: null, p_nome: 'Hospedagem Vercel', p_id_categoria: ids.catP, p_valor: '300.00', p_tipo_valor: 'variavel',
  });
  expect(error).toBeNull();
  ids.gastoP = idGasto as string;
  // Conta bancária é exclusiva de empresas
  const { error: eConta } = await salvarGasto(M.cliente, {
    p_contexto: 'plataforma', p_id_empresa: null, p_nome: 'Com conta', p_id_categoria: ids.catP, p_valor: '10.00', p_id_conta_financeira: ids.contaA,
  });
  expect(eConta).not.toBeNull();
  let occ = await ocorrencias(M.cliente, ids.gastoP);
  expect(occ).toHaveLength(2);
  const gerar = await Promise.all(Array.from({ length: 5 }, () => M.cliente.rpc('gerar_ocorrencias_gastos_fixos', { p_contexto: 'plataforma', p_id_empresa: null })));
  expect(gerar.every((x) => !x.error && Number(x.data) === 0)).toBe(true);

  const pagar = (valor: string, data = hoje) => M.cliente.rpc('registrar_pagamento_gasto_plataforma', { p_id: occ[0].id, p_data_pagamento: data, p_valor: valor });
  expect((await pagar('100.00')).error?.message).toContain('parcial');
  expect((await pagar('300.00', amanha)).error).not.toBeNull();
  // Valor variável: ajusta antes de pagar
  expect((await M.cliente.rpc('ajustar_ocorrencia_gasto_plataforma', { p_id: occ[0].id, p_valor: '312.45', p_data_vencimento: occ[0].data_vencimento })).error).toBeNull();
  const r = await Promise.all(Array.from({ length: 5 }, () => pagar('312.45')));
  expect(r.filter((x) => !x.error)).toHaveLength(1);
  occ = await ocorrencias(M.cliente, ids.gastoP);
  expect([Number(occ[0].valor), occ[0].status]).toEqual([312.45, 'pago']);
  // Edição do gasto não altera a paga
  await salvarGasto(M.cliente, { p_id: ids.gastoP, p_contexto: 'plataforma', p_id_empresa: null, p_nome: 'Hospedagem Vercel', p_id_categoria: ids.catP, p_valor: '350.00', p_tipo_valor: 'variavel' });
  occ = await ocorrencias(M.cliente, ids.gastoP);
  expect(occ.map((o) => [Number(o.valor), o.status])).toEqual([[312.45, 'pago'], [350, 'pendente']]);
  // Estorno: volta a pendente; histórico guarda pagamento e estorno
  const est = await Promise.all(Array.from({ length: 3 }, () => M.cliente.rpc('estornar_pagamento_gasto_plataforma', { p_id: occ[0].id })));
  expect(est.filter((x) => !x.error)).toHaveLength(1);
  const { data: hist } = await M.cliente.from('historico_gastos_fixos').select('acao, dados').eq('id_gasto_fixo', ids.gastoP);
  expect(hist?.filter((h) => h.acao === 'pagamento')).toHaveLength(1);
  expect(hist?.filter((h) => h.acao === 'estorno')).toHaveLength(1);
  expect((await ocorrencias(M.cliente, ids.gastoP))[0].status).toBe('pendente');
  const { data: resumo } = await M.cliente.rpc('resumo_gastos_fixos', { p_contexto: 'plataforma', p_id_empresa: null, p_mes: inicioMes });
  expect(resumo.gastos_ativos).toBeGreaterThanOrEqual(1);
});

test('isolamento: empresa x plataforma, empresa A x B, Admin Master sem acesso às empresas', async () => {
  // Empresa não vê nem mexe na plataforma
  expect((await A.cliente.from('gastos_fixos').select('id').eq('contexto', 'plataforma')).data).toEqual([]);
  expect((await A.cliente.from('ocorrencias_gastos_fixos').select('id').eq('contexto', 'plataforma')).data).toEqual([]);
  expect((await A.cliente.from('categorias_financeiras').select('id').is('id_empresa', null)).data).toEqual([]);
  expect((await A.cliente.rpc('resumo_gastos_fixos', { p_contexto: 'plataforma', p_id_empresa: null, p_mes: inicioMes })).error).not.toBeNull();
  expect((await salvarGasto(A.cliente, { p_contexto: 'plataforma', p_id_empresa: null, p_nome: 'Invasão', p_id_categoria: ids.catP, p_valor: '1.00' })).error).not.toBeNull();
  const occP = await ocorrencias(M.cliente, ids.gastoP);
  expect((await A.cliente.rpc('registrar_pagamento_gasto_plataforma', { p_id: occP[0].id, p_data_pagamento: hoje, p_valor: String(occP[0].valor) })).error).not.toBeNull();
  expect((await A.cliente.rpc('alterar_situacao_gasto_fixo', { p_id: ids.gastoP, p_acao: 'pausar' })).error).not.toBeNull();
  expect((await A.cliente.rpc('inicializar_categorias_plataforma')).error).not.toBeNull();
  // Categoria da plataforma não pode ser usada por empresa (lançamento, gasto ou contrato)
  const { error: eLanc } = await A.cliente.rpc('salvar_lancamento_financeiro', {
    p_id: null, p_id_empresa: A.idEmpresa, p_tipo: 'despesa', p_descricao: 'Teste', p_valor: '10.00', p_id_categoria: ids.catP,
    p_data_competencia: hoje, p_data_vencimento: hoje, p_data_pagamento: null, p_contraparte: null, p_observacoes: null, p_id_conta_financeira: null,
  });
  expect(eLanc).not.toBeNull();
  expect((await salvarGasto(A.cliente, { p_contexto: 'empresa', p_id_empresa: A.idEmpresa, p_nome: 'Cat plataforma', p_id_categoria: ids.catP, p_valor: '1.00' })).error).not.toBeNull();
  const { error: eContrato } = await A.cliente.rpc('criar_contrato_parcelado', {
    p_id_empresa: A.idEmpresa, p_nome: 'Contrato', p_tipo: 'compra_parcelada', p_contraparte: null, p_id_categoria: ids.catP, p_descricao: null,
    p_data_contratacao: hoje, p_valor_principal: '100.00', p_valor_total: '100.00', p_taxa_juros: null, p_modalidade: 'personalizadas',
    p_id_conta_financeira: null, p_entrada: null, p_parcelas: [{ numero: 1, vencimento: hoje, valor: '100.00' }],
  });
  expect(eContrato).not.toBeNull();

  // Admin Master não acessa automaticamente os gastos/lançamentos das empresas
  expect((await M.cliente.from('gastos_fixos').select('id').eq('id_empresa', A.idEmpresa)).data).toEqual([]);
  expect((await M.cliente.from('ocorrencias_gastos_fixos').select('id').eq('id_empresa', A.idEmpresa)).data).toEqual([]);
  expect((await M.cliente.from('lancamentos_financeiros').select('id').eq('id_empresa', A.idEmpresa)).data).toEqual([]);
  expect((await M.cliente.from('contas_financeiras').select('id').eq('id_empresa', A.idEmpresa)).data).toEqual([]);
  expect((await M.cliente.rpc('resumo_gastos_fixos', { p_contexto: 'empresa', p_id_empresa: A.idEmpresa, p_mes: inicioMes })).error).not.toBeNull();
  expect((await M.cliente.rpc('gerar_ocorrencias_gastos_fixos', { p_contexto: 'empresa', p_id_empresa: A.idEmpresa })).error).not.toBeNull();
  expect((await salvarGasto(M.cliente, { p_contexto: 'empresa', p_id_empresa: A.idEmpresa, p_nome: 'Em empresa', p_id_categoria: ids.catA, p_valor: '1.00' })).error).not.toBeNull();
  // Despesa da plataforma não pode ser associada a uma empresa (categoria da plataforma + empresa arbitrária)
  expect((await salvarGasto(M.cliente, { p_contexto: 'empresa', p_id_empresa: A.idEmpresa, p_nome: 'Assoc', p_id_categoria: ids.catP, p_valor: '1.00' })).error).not.toBeNull();
  expect((await salvarGasto(M.cliente, { p_contexto: 'plataforma', p_id_empresa: A.idEmpresa, p_nome: 'Assoc', p_id_categoria: ids.catP, p_valor: '1.00' })).error).not.toBeNull();

  // Admin comum (não master) não acessa o financeiro da plataforma
  expect((await AD.cliente.from('gastos_fixos').select('id').eq('contexto', 'plataforma')).data).toEqual([]);
  expect((await salvarGasto(AD.cliente, { p_contexto: 'plataforma', p_id_empresa: null, p_nome: 'Admin', p_id_categoria: ids.catP, p_valor: '1.00' })).error).not.toBeNull();

  // Empresa B não vê nem altera os gastos da A, nem usa categoria/conta da A
  expect((await B.cliente.from('gastos_fixos').select('id').eq('id_empresa', A.idEmpresa)).data).toEqual([]);
  expect((await B.cliente.from('historico_gastos_fixos').select('id').eq('id_gasto_fixo', ids.gastoA)).data).toEqual([]);
  expect((await B.cliente.rpc('alterar_situacao_gasto_fixo', { p_id: ids.gastoA, p_acao: 'pausar' })).error).not.toBeNull();
  expect((await salvarGasto(B.cliente, { p_contexto: 'empresa', p_id_empresa: B.idEmpresa, p_nome: 'Cat A', p_id_categoria: ids.catA, p_valor: '1.00' })).error).not.toBeNull();
  expect((await salvarGasto(B.cliente, { p_contexto: 'empresa', p_id_empresa: B.idEmpresa, p_nome: 'Conta A', p_id_categoria: ids.catB, p_valor: '1.00', p_id_conta_financeira: ids.contaA })).error).not.toBeNull();
  expect((await salvarGasto(B.cliente, { p_contexto: 'empresa', p_id_empresa: A.idEmpresa, p_nome: 'Na A', p_id_categoria: ids.catA, p_valor: '1.00' })).error).not.toBeNull();

  // Anônimo não lê nada
  expect((await anonimo().from('gastos_fixos').select('id')).data ?? []).toEqual([]);
});

test('documentos: pasta da plataforma só para Admin Master; empresa só na própria pasta', async () => {
  const pdf = new Blob(['%PDF-1.4 teste'], { type: 'application/pdf' });
  const caminhoP = `plataforma/gastos-fixos/${ids.gastoP}/${marca}.pdf`;
  const caminhoA = `${A.idEmpresa}/gastos-fixos/${ids.gastoA}/${marca}.pdf`;
  const up = (cli: SupabaseClient, caminho: string) => cli.storage.from('comprovantes-financeiros').upload(caminho, pdf, { contentType: 'application/pdf' });

  // Empresa não envia na pasta da plataforma nem na de outra empresa
  expect((await up(A.cliente, caminhoP)).error).not.toBeNull();
  expect((await up(B.cliente, caminhoA)).error).not.toBeNull();
  expect((await up(A.cliente, `${A.idEmpresa}/gastos-fixos/${ids.gastoP}/${marca}.pdf`)).error, 'gasto da plataforma na pasta da empresa').not.toBeNull();

  // Admin Master envia/registra na plataforma; empresa não lê; Admin Master não envia na pasta da empresa
  expect((await up(M.cliente, caminhoP)).error).toBeNull();
  const { data: idAnexoP, error: eReg } = await M.cliente.rpc('registrar_anexo_gasto_fixo', { p_id_gasto: ids.gastoP, p_caminho: caminhoP, p_nome_arquivo: 'contrato.pdf' });
  expect(eReg).toBeNull();
  expect((await A.cliente.storage.from('comprovantes-financeiros').createSignedUrl(caminhoP, 60)).error).not.toBeNull();
  expect((await A.cliente.from('anexos_gastos_fixos').select('id').eq('id', idAnexoP as string)).data).toEqual([]);
  expect((await M.cliente.storage.from('comprovantes-financeiros').createSignedUrl(caminhoP, 60)).error).toBeNull();
  expect((await up(M.cliente, caminhoA)).error).not.toBeNull();

  // Empresa envia na própria pasta; registro com caminho de outro gasto é recusado
  expect((await up(A.cliente, caminhoA)).error).toBeNull();
  expect((await A.cliente.rpc('registrar_anexo_gasto_fixo', { p_id_gasto: ids.gastoA, p_caminho: caminhoA, p_nome_arquivo: 'nota.pdf' })).error).toBeNull();
  expect((await A.cliente.rpc('registrar_anexo_gasto_fixo', { p_id_gasto: ids.gastoA, p_caminho: caminhoP, p_nome_arquivo: 'x.pdf' })).error).not.toBeNull();
  expect((await M.cliente.storage.from('comprovantes-financeiros').createSignedUrl(caminhoA, 60)).error, 'Admin Master não lê documento da empresa').not.toBeNull();

  // Remoção registrada no histórico
  expect((await A.cliente.rpc('remover_anexo_gasto_fixo', { p_id: idAnexoP as string })).error).not.toBeNull();
  expect((await M.cliente.rpc('remover_anexo_gasto_fixo', { p_id: idAnexoP as string })).error).toBeNull();
  const { data: hist } = await M.cliente.from('historico_gastos_fixos').select('acao').eq('id_gasto_fixo', ids.gastoP);
  expect(hist?.map((h) => h.acao)).toEqual(expect.arrayContaining(['anexo_adicionado', 'anexo_removido']));
  await admin().storage.from('comprovantes-financeiros').remove([caminhoP, caminhoA]);
});

test('contador: sem permissão nada; ver_financeiro lê; gerenciar_financeiro cadastra', async () => {
  const { data: idVinculo } = await A.cliente.rpc('solicitar_vinculo_contabil', { p_id_empresa: A.idEmpresa, p_id_contador: C.id, p_id_escritorio: null, p_funcao: 'principal', p_permissoes: null });
  await C.cliente.rpc('responder_vinculo_contabil', { p_id_vinculo: idVinculo, p_aceitar: true, p_id_contador: null });
  const ver = () => C.cliente.from('gastos_fixos_resumo').select('id').eq('id_empresa', A.idEmpresa);
  const criar = () => salvarGasto(C.cliente, { p_contexto: 'empresa', p_id_empresa: A.idEmpresa, p_nome: 'Pelo contador', p_id_categoria: ids.catA, p_valor: '50.00' });
  expect((await ver()).data ?? []).toHaveLength(0);
  expect((await criar()).error).not.toBeNull();
  await A.cliente.rpc('alterar_vinculo_contabil', { p_id_vinculo: idVinculo, p_funcao: 'principal', p_permissoes: ['ver_financeiro'] });
  expect((await ver()).data?.length).toBeGreaterThan(0);
  expect((await criar()).error, 'ver não cadastra').not.toBeNull();
  expect((await C.cliente.rpc('gerar_ocorrencias_gastos_fixos', { p_contexto: 'empresa', p_id_empresa: A.idEmpresa })).data, 'ver não gera').toBe(0);
  await A.cliente.rpc('alterar_vinculo_contabil', { p_id_vinculo: idVinculo, p_funcao: 'principal', p_permissoes: ['ver_financeiro', 'gerenciar_financeiro'] });
  expect((await criar()).error).toBeNull();
  await A.cliente.rpc('alterar_vinculo_contabil', { p_id_vinculo: idVinculo, p_funcao: 'principal', p_permissoes: [] });
  expect((await ver()).data ?? []).toHaveLength(0);
  // Contador não acessa a plataforma
  expect((await C.cliente.from('gastos_fixos').select('id').eq('contexto', 'plataforma')).data).toEqual([]);
});
