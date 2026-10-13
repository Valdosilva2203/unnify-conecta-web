import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Financeiro — integridade, cálculo dos indicadores, concorrência e segurança multiempresa (API + banco).
// Usuários/empresas temporários; tudo é removido ao final.

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
const marca = `fs${Date.now()}`;
const usuarios: string[] = [];
const empresas: string[] = [];
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

// Datas civis de Brasília (mesma regra do banco: hoje_brasil())
const hojeBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
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
  const senha = `Fs@${Date.now()}x`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome_completo: `Teste ${rotulo}` } });
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
    if (!idEmpresa) throw new Error('criar_empresa falhou');
    empresas.push(idEmpresa);
  }
  return { id: data.user.id, cliente, idEmpresa };
}

async function categoria(cli: SupabaseClient, idEmpresa: string, tipo: string, nome: string) {
  const { data } = await cli.from('categorias_financeiras').select('id').eq('id_empresa', idEmpresa).eq('tipo', tipo).eq('nome', nome).single();
  return data!.id as string;
}

const lancar = (cli: SupabaseClient, p: Record<string, unknown>) =>
  cli.rpc('salvar_lancamento_financeiro', {
    p_id: null, p_contraparte: null, p_observacoes: null, p_data_vencimento: null, p_data_pagamento: null, ...p,
  });

test.describe.configure({ mode: 'serial' });
test.setTimeout(4 * 60 * 1000);

let A: Awaited<ReturnType<typeof criarUsuario>>;
let B: Awaited<ReturnType<typeof criarUsuario>>;
let C: Awaited<ReturnType<typeof criarUsuario>>;
let D: Awaited<ReturnType<typeof criarUsuario>>;
const ids: Record<string, string> = {};

test.beforeAll(async () => {
  A = await criarUsuario('a', 'empresa', true);
  B = await criarUsuario('b', 'empresa', true);
  C = await criarUsuario('contc', 'contador', false);
  D = await criarUsuario('contd', 'contador', false);
});

test.afterAll(async () => {
  const sb = admin();
  if (empresas.length) {
    for (const e of empresas) {
      const { data: arquivos } = await sb.storage.from('comprovantes-financeiros').list(e, { limit: 100 });
      for (const pasta of arquivos ?? []) {
        const { data: dentro } = await sb.storage.from('comprovantes-financeiros').list(`${e}/${pasta.name}`);
        if (dentro?.length) await sb.storage.from('comprovantes-financeiros').remove(dentro.map((f) => `${e}/${pasta.name}/${f.name}`));
      }
    }
    await sb.from('historico_lancamentos_financeiros').delete().in('id_empresa', empresas);
    await sb.from('anexos_financeiros').delete().in('id_empresa', empresas);
    await sb.from('movimentacoes_financeiras').delete().in('id_empresa', empresas);
    await sb.from('historico_contas_financeiras').delete().in('id_empresa', empresas);
    await sb.from('transferencias_financeiras').delete().in('id_empresa', empresas);
    await sb.from('lancamentos_financeiros').delete().in('id_empresa', empresas);
    await sb.from('contas_financeiras').delete().in('id_empresa', empresas);
    await sb.from('categorias_financeiras').delete().in('id_empresa', empresas);
  }
  for (const id of usuarios.reverse()) await sb.auth.admin.deleteUser(id);
});

test('empresa sem movimentações e categorias iniciais idempotentes', async () => {
  const mes = inicioDoMes(hojeBR());
  const { data: vazio, error } = await A.cliente.rpc('resumo_financeiro', { p_id_empresa: A.idEmpresa, p_mes: mes });
  expect(error).toBeNull();
  expect(vazio).toMatchObject({ receitas_mes: 0, despesas_mes: 0, saldo_acumulado: 0, a_pagar_30_qtd: 0, tem_lancamentos: false });
  expect(vazio.serie).toHaveLength(6);

  expect((await A.cliente.rpc('inicializar_categorias_financeiras', { p_id_empresa: A.idEmpresa })).data).toBe(11);
  expect((await A.cliente.rpc('inicializar_categorias_financeiras', { p_id_empresa: A.idEmpresa })).data).toBe(0);
  const { count } = await A.cliente.from('categorias_financeiras').select('*', { count: 'exact', head: true }).eq('id_empresa', A.idEmpresa);
  expect(count).toBe(11);
  await B.cliente.rpc('inicializar_categorias_financeiras', { p_id_empresa: B.idEmpresa });
  // B não inicializa categorias na empresa de A
  expect((await B.cliente.rpc('inicializar_categorias_financeiras', { p_id_empresa: A.idEmpresa })).error).not.toBeNull();
  // Categoria duplicada e desativação
  const dup = await A.cliente.rpc('salvar_categoria_financeira', { p_id: null, p_id_empresa: A.idEmpresa, p_tipo: 'despesa', p_nome: 'aluguel', p_cor: '#ff0000' });
  expect(dup.error?.message).toContain('Já existe uma categoria');

  // Ícone: modelos iniciais com ícone; criar/editar com ícone e cor; padrão 'tag'; inválidos recusados; outra empresa não edita
  const icone = async (id: string) => (await admin().from('categorias_financeiras').select('icone, cor').eq('id', id).single()).data;
  const { data: aluguel } = await A.cliente.from('categorias_financeiras').select('icone').eq('id_empresa', A.idEmpresa).eq('nome', 'Aluguel').single();
  expect(aluguel?.icone).toBe('house');
  const nova = await A.cliente.rpc('salvar_categoria_financeira', { p_id: null, p_id_empresa: A.idEmpresa, p_tipo: 'despesa', p_nome: 'Contabilidade', p_cor: '#8b5cf6', p_icone: 'calculator' });
  expect(nova.error).toBeNull();
  expect(await icone(nova.data)).toEqual({ icone: 'calculator', cor: '#8b5cf6' });
  const semIcone = await A.cliente.rpc('salvar_categoria_financeira', { p_id: null, p_id_empresa: A.idEmpresa, p_tipo: 'despesa', p_nome: 'Diversos', p_cor: '#9ca3af' });
  expect((await icone(semIcone.data))?.icone, 'sem ícone → padrão').toBe('tag');
  for (const invalido of ['nao-existe', '<svg onload=alert(1)>', 'house"><script>alert(1)</script>', 'HOUSE', '']) {
    const r = await A.cliente.rpc('salvar_categoria_financeira', { p_id: nova.data, p_id_empresa: A.idEmpresa, p_tipo: 'despesa', p_nome: 'Contabilidade', p_cor: '#8b5cf6', p_icone: invalido });
    expect(r.error?.message, `ícone ${invalido}`).toContain('Ícone inválido');
  }
  expect((await A.cliente.rpc('salvar_categoria_financeira', { p_id: nova.data, p_id_empresa: A.idEmpresa, p_tipo: 'despesa', p_nome: 'Contabilidade', p_cor: 'red', p_icone: 'scale' })).error?.message).toContain('Cor inválida');
  expect((await A.cliente.rpc('salvar_categoria_financeira', { p_id: nova.data, p_id_empresa: A.idEmpresa, p_tipo: 'despesa', p_nome: 'Contabilidade', p_cor: '#0d9488', p_icone: 'scale' })).error).toBeNull();
  expect(await icone(nova.data)).toEqual({ icone: 'scale', cor: '#0d9488' });
  // Outra empresa: nem pela função nem por escrita direta
  expect((await B.cliente.rpc('salvar_categoria_financeira', { p_id: nova.data, p_id_empresa: B.idEmpresa, p_tipo: 'despesa', p_nome: 'Invadida', p_cor: '#000000', p_icone: 'tag' })).error).not.toBeNull();
  expect((await B.cliente.from('categorias_financeiras').update({ icone: 'tag' }).eq('id', nova.data)).error).not.toBeNull();
  expect((await A.cliente.from('categorias_financeiras').update({ icone: 'gift' }).eq('id', nova.data)).error, 'escrita direta bloqueada').not.toBeNull();
  expect(await icone(nova.data)).toEqual({ icone: 'scale', cor: '#0d9488' });
});

test('validações: valores, datas e categorias inválidas são recusados', async () => {
  const hoje = hojeBR();
  const cat = await categoria(A.cliente, A.idEmpresa, 'despesa', 'Aluguel');
  const catReceita = await categoria(A.cliente, A.idEmpresa, 'receita', 'Venda de produtos');
  const catDeB = await categoria(B.cliente, B.idEmpresa, 'despesa', 'Aluguel');
  const base = { p_id_empresa: A.idEmpresa, p_tipo: 'despesa', p_descricao: 'Teste', p_id_categoria: cat, p_data_competencia: hoje, p_data_vencimento: hoje };
  for (const valor of [0, -10, 10.123, 1e13]) {
    expect((await lancar(A.cliente, { ...base, p_valor: valor })).error, `valor ${valor}`).not.toBeNull();
  }
  expect((await lancar(A.cliente, { ...base, p_valor: 10, p_data_vencimento: '2200-01-01' })).error, 'data fora do intervalo').not.toBeNull();
  expect((await lancar(A.cliente, { ...base, p_valor: 10, p_data_vencimento: '2026-02-30' })).error, 'data inexistente').not.toBeNull();
  expect((await lancar(A.cliente, { ...base, p_valor: 10, p_data_vencimento: null })).error?.message).toContain('vencimento');
  expect((await lancar(A.cliente, { ...base, p_valor: 10, p_descricao: ' ' })).error, 'descrição vazia').not.toBeNull();
  expect((await lancar(A.cliente, { ...base, p_valor: 10, p_id_categoria: catReceita })).error?.message).toContain('Categoria inválida');
  expect((await lancar(A.cliente, { ...base, p_valor: 10, p_id_categoria: catDeB })).error?.message).toContain('Categoria inválida');
  // Escrita direta nas tabelas é proibida (só pelas funções)
  const direto = await A.cliente.from('lancamentos_financeiros').insert({ id_empresa: A.idEmpresa, tipo: 'despesa', descricao: 'x', valor: 1, id_categoria: cat, data_competencia: hoje, data_vencimento: hoje });
  expect(direto.error).not.toBeNull();
  const diretoCat = await A.cliente.from('categorias_financeiras').update({ nome: 'Invadido' }).eq('id', cat);
  expect(diretoCat.error).not.toBeNull();
});

test('lançamentos, baixa concorrente única e indicadores calculados no banco', async () => {
  const hoje = hojeBR();
  const mes = inicioDoMes(hoje);
  const catRec = await categoria(A.cliente, A.idEmpresa, 'receita', 'Prestação de serviços');
  const catAlu = await categoria(A.cliente, A.idEmpresa, 'despesa', 'Aluguel');
  const catEne = await categoria(A.cliente, A.idEmpresa, 'despesa', 'Energia');

  const { data: contaA, error: erroConta } = await A.cliente.rpc('salvar_conta_financeira', { p_id: null, p_id_empresa: A.idEmpresa, p_nome: 'Banco A', p_instituicao: 'Banco Teste', p_tipo: 'conta_corrente', p_saldo_inicial: 0, p_data_saldo_inicial: mes, p_permite_saldo_negativo: false });
  expect(erroConta).toBeNull();
  ids.contaA = contaA;
  // Já pago sem conta: recusado
  expect((await lancar(A.cliente, { p_id_empresa: A.idEmpresa, p_tipo: 'receita', p_descricao: 'Sem conta', p_valor: 10, p_id_categoria: catRec, p_data_competencia: hoje, p_data_pagamento: hoje })).error?.message).toContain('conta')
  const r1 = await lancar(A.cliente, { p_id_empresa: A.idEmpresa, p_tipo: 'receita', p_descricao: 'Serviço pago', p_valor: 1000.1, p_id_categoria: catRec, p_data_competencia: hoje, p_data_pagamento: hoje, p_id_conta_financeira: contaA });
  expect(r1.error).toBeNull();
  const d1 = await lancar(A.cliente, { p_id_empresa: A.idEmpresa, p_tipo: 'despesa', p_descricao: 'Aluguel pago', p_valor: 300.05, p_id_categoria: catAlu, p_data_competencia: hoje, p_data_pagamento: hoje, p_id_conta_financeira: contaA });
  expect(d1.error).toBeNull();
  const pendente = await lancar(A.cliente, { p_id_empresa: A.idEmpresa, p_tipo: 'despesa', p_descricao: 'Energia a vencer', p_valor: 200, p_id_categoria: catEne, p_data_competencia: hoje, p_data_vencimento: somarDias(hoje, 10), p_contraparte: 'Energisa' });
  const vencida = await lancar(A.cliente, { p_id_empresa: A.idEmpresa, p_tipo: 'despesa', p_descricao: 'Energia vencida', p_valor: 50, p_id_categoria: catEne, p_data_competencia: hoje, p_data_vencimento: somarDias(hoje, -1) });
  const aReceber = await lancar(A.cliente, { p_id_empresa: A.idEmpresa, p_tipo: 'receita', p_descricao: 'Receber depois', p_valor: 500, p_id_categoria: catRec, p_data_competencia: hoje, p_data_vencimento: somarDias(hoje, 5) });
  const cancelar = await lancar(A.cliente, { p_id_empresa: A.idEmpresa, p_tipo: 'despesa', p_descricao: 'Será cancelada', p_valor: 999, p_id_categoria: catAlu, p_data_competencia: hoje, p_data_vencimento: somarDias(hoje, 3) });
  const excluir = await lancar(A.cliente, { p_id_empresa: A.idEmpresa, p_tipo: 'receita', p_descricao: 'Será excluída', p_valor: 777, p_id_categoria: catRec, p_data_competencia: hoje, p_data_pagamento: hoje, p_id_conta_financeira: contaA });
  for (const r of [pendente, vencida, aReceber, cancelar, excluir]) expect(r.error).toBeNull();
  Object.assign(ids, { pendente: pendente.data, vencida: vencida.data, aReceber: aReceber.data, r1: r1.data });

  // Situação "vencido" calculada; pendente não conta como pago
  const { data: sit } = await A.cliente.from('lancamentos_financeiros_situacao').select('descricao, situacao, categoria_icone').eq('id', vencida.data).single();
  expect(sit?.situacao).toBe('vencido');
  expect(sit?.categoria_icone, 'lista traz o ícone da categoria').toBe('zap');

  // Cancelar só pendente; excluir é lógico
  expect((await A.cliente.rpc('cancelar_lancamento_financeiro', { p_id: cancelar.data })).error).toBeNull();
  expect((await A.cliente.rpc('cancelar_lancamento_financeiro', { p_id: r1.data })).error?.message).toContain('Só lançamentos pendentes');
  // Pago não pode ser excluído direto (está numa conta): estorna e depois exclui
  expect((await A.cliente.rpc('excluir_lancamento_financeiro', { p_id: excluir.data })).error?.message).toContain('Estorne o pagamento')
  expect((await A.cliente.rpc('estornar_baixa_lancamento', { p_id: excluir.data })).error).toBeNull();
  expect((await A.cliente.rpc('excluir_lancamento_financeiro', { p_id: excluir.data })).error).toBeNull();
  expect((await A.cliente.from('lancamentos_financeiros').select('id').eq('id', excluir.data)).data).toHaveLength(0);
  const { data: aindaNoBanco } = await admin().from('lancamentos_financeiros').select('excluido_em').eq('id', excluir.data).single();
  expect(aindaNoBanco?.excluido_em).not.toBeNull();

  // Edição: pendente não pode virar pago por edição
  const editar = await A.cliente.rpc('salvar_lancamento_financeiro', {
    p_id: pendente.data, p_id_empresa: A.idEmpresa, p_tipo: 'despesa', p_descricao: 'Energia (editada)', p_valor: 200, p_id_categoria: catEne,
    p_data_competencia: hoje, p_data_vencimento: somarDias(hoje, 10), p_data_pagamento: hoje, p_contraparte: 'Energisa', p_observacoes: null,
  });
  expect(editar.error?.message).toContain('Registrar pagamento');

  let { data: resumo } = await A.cliente.rpc('resumo_financeiro', { p_id_empresa: A.idEmpresa, p_mes: mes });
  expect(resumo).toMatchObject({
    receitas_mes: 1000.1, despesas_mes: 300.05, saldo_acumulado: 700.05,
    a_pagar_30_valor: 200, a_pagar_30_qtd: 1, a_pagar_vencidas_qtd: 1, a_receber_vencidas_qtd: 0, tem_lancamentos: true,
  });
  expect(resumo.despesas_por_categoria).toEqual([{ categoria: 'Aluguel', cor: '#ef4444', icone: 'house', valor: 300.05 }]);
  expect(resumo.serie.at(-1)).toMatchObject({ mes, receitas: 1000.1, despesas: 300.05 });

  // Baixa concorrente: 5 pedidos simultâneos → exatamente 1 aceito
  const tentativas = await Promise.all(Array.from({ length: 5 }, () => A.cliente.rpc('registrar_baixa_lancamento', { p_id: vencida.data, p_data_pagamento: hoje, p_id_conta: contaA, p_valor: 50 })));
  expect(tentativas.filter((t) => !t.error)).toHaveLength(1);
  const { data: hist } = await A.cliente.from('historico_lancamentos_financeiros').select('acao, id_usuario').eq('id_lancamento', vencida.data).eq('acao', 'baixado');
  expect(hist).toHaveLength(1);
  expect(hist?.[0].id_usuario).toBe(A.id);
  const { data: baixado } = await admin().from('lancamentos_financeiros').select('status, data_pagamento, baixado_por, baixado_em').eq('id', vencida.data).single();
  expect(baixado).toMatchObject({ status: 'pago', data_pagamento: hoje, baixado_por: A.id });
  expect(baixado?.baixado_em).not.toBeNull();

  ({ data: resumo } = await A.cliente.rpc('resumo_financeiro', { p_id_empresa: A.idEmpresa, p_mes: mes }));
  expect(resumo).toMatchObject({ despesas_mes: 350.05, saldo_acumulado: 650.05, a_pagar_vencidas_qtd: 0 });

  // Estorno volta a pendente; receita prevista não entra como recebida
  expect((await A.cliente.rpc('estornar_baixa_lancamento', { p_id: vencida.data })).error).toBeNull();
  ({ data: resumo } = await A.cliente.rpc('resumo_financeiro', { p_id_empresa: A.idEmpresa, p_mes: mes }));
  expect(resumo).toMatchObject({ receitas_mes: 1000.1, despesas_mes: 300.05, a_pagar_vencidas_qtd: 1 });
  expect((await A.cliente.rpc('registrar_baixa_lancamento', { p_id: aReceber.data, p_data_pagamento: '2026-13-01', p_id_conta: contaA, p_valor: 500 })).error, 'data inválida').not.toBeNull();
});

test('isolamento entre empresas e manipulação de IDs', async () => {
  const hoje = hojeBR();
  // B não lê nada de A
  expect((await B.cliente.from('lancamentos_financeiros').select('id').eq('id_empresa', A.idEmpresa)).data).toHaveLength(0);
  expect((await B.cliente.from('lancamentos_financeiros_situacao').select('id').eq('id_empresa', A.idEmpresa)).data).toHaveLength(0);
  expect((await B.cliente.from('categorias_financeiras').select('id').eq('id_empresa', A.idEmpresa)).data).toHaveLength(0);
  expect((await B.cliente.from('historico_lancamentos_financeiros').select('id').eq('id_empresa', A.idEmpresa)).data).toHaveLength(0);
  expect((await B.cliente.rpc('resumo_financeiro', { p_id_empresa: A.idEmpresa, p_mes: inicioDoMes(hoje) })).error).not.toBeNull();
  // B não escreve em A, mesmo informando o id da empresa de A
  const catA = await categoria(A.cliente, A.idEmpresa, 'despesa', 'Internet');
  expect((await lancar(B.cliente, { p_id_empresa: A.idEmpresa, p_tipo: 'despesa', p_descricao: 'Invasão', p_valor: 1, p_id_categoria: catA, p_data_competencia: hoje, p_data_vencimento: hoje })).error).not.toBeNull();
  expect((await B.cliente.rpc('registrar_baixa_lancamento', { p_id: ids.pendente, p_data_pagamento: hoje, p_id_conta: ids.contaA, p_valor: 200 })).error).not.toBeNull();
  expect((await B.cliente.rpc('excluir_lancamento_financeiro', { p_id: ids.pendente })).error).not.toBeNull();
  expect((await B.cliente.rpc('cancelar_lancamento_financeiro', { p_id: ids.pendente })).error).not.toBeNull();
  expect((await B.cliente.rpc('definir_categoria_financeira_ativa', { p_id: catA, p_ativa: false })).error).not.toBeNull();
  // Editar um lançamento de A informando a empresa de B não move o lançamento
  const catB = await categoria(B.cliente, B.idEmpresa, 'despesa', 'Internet');
  const mover = await B.cliente.rpc('salvar_lancamento_financeiro', {
    p_id: ids.pendente, p_id_empresa: B.idEmpresa, p_tipo: 'despesa', p_descricao: 'Movido', p_valor: 1, p_id_categoria: catB,
    p_data_competencia: hoje, p_data_vencimento: hoje, p_data_pagamento: null, p_contraparte: null, p_observacoes: null,
  });
  expect(mover.error).not.toBeNull();
  const { data: intacto } = await admin().from('lancamentos_financeiros').select('id_empresa, descricao, status').eq('id', ids.pendente).single();
  expect(intacto).toEqual({ id_empresa: A.idEmpresa, descricao: 'Energia a vencer', status: 'pendente' });
  // Anônimo não vê nada
  expect((await anonimo().from('lancamentos_financeiros').select('id')).data ?? []).toHaveLength(0);
  expect((await anonimo().rpc('resumo_financeiro', { p_id_empresa: A.idEmpresa, p_mes: inicioDoMes(hoje) })).error).not.toBeNull();
});

test('comprovantes: upload autorizado, acesso negado a outra empresa e por URL', async () => {
  const caminho = `${A.idEmpresa}/${ids.pendente}/comprovante-${Date.now()}.pdf`;
  expect((await A.cliente.storage.from('comprovantes-financeiros').upload(caminho, PDF, { contentType: 'application/pdf' })).error).toBeNull();
  const reg = await A.cliente.rpc('registrar_anexo_financeiro', { p_id_lancamento: ids.pendente, p_caminho: caminho, p_nome_arquivo: 'conta.pdf' });
  expect(reg.error).toBeNull();
  expect((await A.cliente.storage.from('comprovantes-financeiros').createSignedUrl(caminho, 60)).error).toBeNull();
  // B: não baixa, não lista, não envia na pasta de A, não registra o arquivo de A
  expect((await B.cliente.storage.from('comprovantes-financeiros').createSignedUrl(caminho, 60)).error).not.toBeNull();
  expect((await B.cliente.storage.from('comprovantes-financeiros').list(`${A.idEmpresa}/${ids.pendente}`)).data ?? []).toHaveLength(0);
  expect((await B.cliente.storage.from('comprovantes-financeiros').upload(`${A.idEmpresa}/${ids.pendente}/x.pdf`, PDF, { contentType: 'application/pdf' })).error).not.toBeNull();
  expect((await B.cliente.rpc('registrar_anexo_financeiro', { p_id_lancamento: ids.pendente, p_caminho: caminho, p_nome_arquivo: 'x' })).error).not.toBeNull();
  expect((await B.cliente.from('anexos_financeiros').select('id').eq('id_empresa', A.idEmpresa)).data).toHaveLength(0);
  // Bucket privado: URL pública não funciona
  const publica = admin().storage.from('comprovantes-financeiros').getPublicUrl(caminho).data.publicUrl;
  expect((await fetch(publica)).ok).toBe(false);
  // A não envia para a pasta de outro lançamento que não é da empresa
  const { data: lancB } = await lancar(B.cliente, { p_id_empresa: B.idEmpresa, p_tipo: 'despesa', p_descricao: 'Conta B', p_valor: 10, p_id_categoria: await categoria(B.cliente, B.idEmpresa, 'despesa', 'Aluguel'), p_data_competencia: hojeBR(), p_data_vencimento: hojeBR() });
  expect((await A.cliente.storage.from('comprovantes-financeiros').upload(`${A.idEmpresa}/${lancB}/x.pdf`, PDF, { contentType: 'application/pdf' })).error).not.toBeNull();
  // Tipo de arquivo não permitido pelo bucket
  expect((await A.cliente.storage.from('comprovantes-financeiros').upload(`${A.idEmpresa}/${ids.pendente}/x.html`, Buffer.from('<b>x</b>'), { contentType: 'text/html' })).error).not.toBeNull();
  ids.caminho = caminho;
});

test('contador: sem acesso por padrão; só com permissão explícita; revogação e encerramento cortam o acesso', async () => {
  const hoje = hojeBR();
  const mes = inicioDoMes(hoje);
  const { data: idVinculo, error } = await A.cliente.rpc('solicitar_vinculo_contabil', { p_id_empresa: A.idEmpresa, p_id_contador: C.id, p_id_escritorio: null, p_funcao: 'principal', p_permissoes: null });
  expect(error).toBeNull();
  expect((await C.cliente.rpc('responder_vinculo_contabil', { p_id_vinculo: idVinculo, p_aceitar: true, p_id_contador: null })).error).toBeNull();
  const { data: v } = await admin().from('vinculos_contabeis').select('status, permissoes').eq('id', idVinculo).single();
  expect(v?.status).toBe('ativo');
  expect(v?.permissoes, 'principal não recebe permissão financeira automaticamente').not.toContain('ver_financeiro');

  const semAcesso = async (cli: SupabaseClient) => {
    expect((await cli.from('lancamentos_financeiros').select('id').eq('id_empresa', A.idEmpresa)).data ?? []).toHaveLength(0);
    expect((await cli.rpc('resumo_financeiro', { p_id_empresa: A.idEmpresa, p_mes: mes })).error).not.toBeNull();
  };
  await semAcesso(C.cliente);
  await semAcesso(D.cliente); // contador sem vínculo

  // Só visualizar
  expect((await A.cliente.rpc('alterar_vinculo_contabil', { p_id_vinculo: idVinculo, p_funcao: 'principal', p_permissoes: ['ver_dados_cadastrais', 'ver_financeiro'] })).error).toBeNull();
  expect((await C.cliente.from('lancamentos_financeiros').select('id').eq('id_empresa', A.idEmpresa)).data?.length).toBeGreaterThan(0);
  expect((await C.cliente.rpc('resumo_financeiro', { p_id_empresa: A.idEmpresa, p_mes: mes })).error).toBeNull();
  const catA = await categoria(C.cliente, A.idEmpresa, 'despesa', 'Internet');
  expect((await lancar(C.cliente, { p_id_empresa: A.idEmpresa, p_tipo: 'despesa', p_descricao: 'Contador', p_valor: 1, p_id_categoria: catA, p_data_competencia: hoje, p_data_vencimento: hoje })).error, 'ver ≠ gerenciar').not.toBeNull();
  expect((await C.cliente.storage.from('comprovantes-financeiros').createSignedUrl(ids.caminho, 60)).error, 'ver financeiro ≠ ver comprovantes').not.toBeNull();
  expect((await C.cliente.from('anexos_financeiros').select('id').eq('id_empresa', A.idEmpresa)).data ?? []).toHaveLength(0);

  // Comprovantes e gestão, com permissão explícita
  expect((await A.cliente.rpc('alterar_vinculo_contabil', { p_id_vinculo: idVinculo, p_funcao: 'principal', p_permissoes: ['ver_financeiro', 'ver_comprovantes_financeiros', 'gerenciar_financeiro'] })).error).toBeNull();
  expect((await C.cliente.storage.from('comprovantes-financeiros').createSignedUrl(ids.caminho, 60)).error).toBeNull();
  const lancC = await lancar(C.cliente, { p_id_empresa: A.idEmpresa, p_tipo: 'despesa', p_descricao: 'Lançado pelo contador', p_valor: 12.34, p_id_categoria: catA, p_data_competencia: hoje, p_data_vencimento: hoje });
  expect(lancC.error).toBeNull();
  // O contador não ganha acesso a outra empresa
  expect((await C.cliente.from('lancamentos_financeiros').select('id').eq('id_empresa', B.idEmpresa)).data ?? []).toHaveLength(0);

  // Revogação
  expect((await A.cliente.rpc('alterar_vinculo_contabil', { p_id_vinculo: idVinculo, p_funcao: 'principal', p_permissoes: ['ver_dados_cadastrais'] })).error).toBeNull();
  await semAcesso(C.cliente);
  expect((await C.cliente.storage.from('comprovantes-financeiros').createSignedUrl(ids.caminho, 60)).error).not.toBeNull();

  // Encerramento do vínculo (mesmo que as permissões estivessem concedidas)
  await A.cliente.rpc('alterar_vinculo_contabil', { p_id_vinculo: idVinculo, p_funcao: 'principal', p_permissoes: ['ver_financeiro', 'gerenciar_financeiro'] });
  expect((await A.cliente.rpc('encerrar_vinculo_contabil', { p_id_vinculo: idVinculo, p_motivo: 'teste' })).error).toBeNull();
  await semAcesso(C.cliente);
  expect((await lancar(C.cliente, { p_id_empresa: A.idEmpresa, p_tipo: 'despesa', p_descricao: 'Após encerrar', p_valor: 1, p_id_categoria: catA, p_data_competencia: hoje, p_data_vencimento: hoje })).error).not.toBeNull();
});
