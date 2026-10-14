import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// E0 (migration 20261013000029): S1 tipo de usuário, S2 empresas e S4 papel admin.
// Contas temporárias delivered+…@resend.dev, removidas no afterAll. Requer a migration aplicada.

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
const BASE = 'http://localhost:3000';
const admin = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anonimo = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const marca = `e0${Date.now()}`;
const usuarios: string[] = [];
const empresas: string[] = [];

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

// Usuário SEM tipo definido (como no cadastro real); a função global é ajustada só para os papéis de admin
async function criarUsuario(rotulo: string, funcao?: 'admin' | 'admin_master') {
  const email = `delivered+${marca}${rotulo}@resend.dev`;
  const senha = `E0@${Date.now()}x`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw error;
  usuarios.push(data.user.id);
  if (funcao) await admin().from('perfis').update({ funcao_global: funcao }).eq('id_usuario', data.user.id);
  const cliente = anonimo();
  await cliente.auth.signInWithPassword({ email, password: senha });
  return { id: data.user.id, cliente };
}

async function criarEmpresa(cli: SupabaseClient, tipo: 'comum' | 'escritorio_contabil', rotulo: string) {
  const { data, error } = await cli.rpc('criar_empresa', {
    p_cnpj: cnpjAleatorio(), p_razao_social: `EMPRESA ${rotulo} ${marca} LTDA`, p_telefone: '63999990000', p_email_comercial: 'teste@resend.dev',
    p_cidade: 'Palmas', p_estado: 'TO', p_tipo_empresa: tipo, p_nome_comercial: `${rotulo} ${marca}`,
  });
  expect(error).toBeNull();
  expect(data?.[0]?.sucesso, data?.[0]?.mensagem).toBe(true);
  empresas.push(data[0].id);
  return data[0].id as string;
}

const tipoDe = async (id: string) => (await admin().from('perfis').select('tipo_usuario').eq('id_usuario', id).single()).data?.tipo_usuario;
const editar = (cli: SupabaseClient, idEmpresa: string, p: Record<string, unknown> = {}) =>
  cli.rpc('atualizar_dados_empresa', {
    p_id_empresa: idEmpresa, p_nome_comercial: 'Nome Novo', p_telefone: '(63) 98888-7777', p_email_comercial: 'contato@resend.dev',
    p_cidade: 'Araguaína', p_estado: 'to', p_cnae_principal: '6201-5/01', ...p,
  });

test.describe.configure({ mode: 'serial' });
test.setTimeout(4 * 60 * 1000);

let A: Awaited<ReturnType<typeof criarUsuario>>;
let B: Awaited<ReturnType<typeof criarUsuario>>;
let C: Awaited<ReturnType<typeof criarUsuario>>;
let AD: Awaited<ReturnType<typeof criarUsuario>>;
let M: Awaited<ReturnType<typeof criarUsuario>>;
const ids: Record<string, string> = {};

test.beforeAll(async () => {
  A = await criarUsuario('a');
  B = await criarUsuario('b');
  C = await criarUsuario('c');
  AD = await criarUsuario('ad', 'admin');
  M = await criarUsuario('m', 'admin_master');
});

test.afterAll(async () => {
  const sb = admin();
  if (empresas.length) {
    await sb.from('auditoria').delete().in('id_registro', empresas);
    // historico_vinculos_contabeis sai em cascata com o vínculo
    for (const t of ['vinculos_contabeis', 'categorias_financeiras']) await sb.from(t).delete().in('id_empresa', empresas);
    await sb.from('usuarios_empresas').delete().in('id_empresa', empresas);
    await sb.from('empresas').delete().in('id', empresas);
  }
  for (const id of usuarios) await sb.auth.admin.deleteUser(id);
});

test('S1: tipo definido uma única vez pelo banco; ninguém troca o próprio tipo nem o de outro', async () => {
  // Sem tipo: o próprio usuário não escolhe o tipo por UPDATE direto
  expect(await tipoDe(A.id)).toBeNull();
  const direto = await A.cliente.from('perfis').update({ tipo_usuario: 'contador' }).eq('id_usuario', A.id).select();
  expect(direto.error, 'NULL -> contador direto').not.toBeNull();
  expect(await tipoDe(A.id)).toBeNull();

  // criar_empresa define o tipo conforme a empresa
  ids.empresaA = await criarEmpresa(A.cliente, 'comum', 'a');
  expect(await tipoDe(A.id)).toBe('empresa');
  ids.escritorioC = await criarEmpresa(C.cliente, 'escritorio_contabil', 'c');
  expect(await tipoDe(C.id)).toBe('contador');

  // Depois de definido: não muda (nem por UPDATE direto, nem criando um escritório)
  expect((await A.cliente.from('perfis').update({ tipo_usuario: 'contador' }).eq('id_usuario', A.id).select()).error).not.toBeNull();
  ids.escritorioA = await criarEmpresa(A.cliente, 'escritorio_contabil', 'a2');
  expect(await tipoDe(A.id)).toBe('empresa');

  // A não altera o perfil de B (RLS: nenhuma linha afetada)
  const cruzado = await A.cliente.from('perfis').update({ nome_completo: 'Invasor' }).eq('id_usuario', B.id).select();
  expect(cruzado.data ?? []).toHaveLength(0);
  expect(await tipoDe(B.id)).toBeNull();

  // Sem login, criar_empresa é recusada
  const { data: semLogin } = await anonimo().rpc('criar_empresa', {
    p_cnpj: cnpjAleatorio(), p_razao_social: 'X LTDA', p_telefone: '63999990000', p_email_comercial: 'x@resend.dev', p_cidade: 'Palmas', p_estado: 'TO',
    p_tipo_empresa: 'comum', p_nome_comercial: null,
  });
  expect(semLogin?.[0]?.sucesso ?? false).toBe(false);

  // A rota antiga que gravava com service_role não existe mais
  const resp = await fetch(`${BASE}/api/auth/update-tipo-usuario`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo_usuario: 'contador' }) });
  expect(resp.status).toBe(404);
});

test('S2: empresa sem escrita direta; gestor edita só campos permitidos; vínculos preservados', async () => {
  const antes = (await admin().from('empresas').select('*').eq('id', ids.empresaA).single()).data!;

  // Escrita direta pela API: recusada para todos os campos (inclusive os estruturais) e DELETE físico bloqueado
  for (const campo of [{ tipo_empresa: 'escritorio_contabil' }, { status_registro: 'INATIVA' }, { cnpj: '00.000.000/0001-00' }, { criado_por: B.id }, { razao_social: 'OUTRA' }, { nome_comercial: 'Direto' }]) {
    const r = await A.cliente.from('empresas').update(campo).eq('id', ids.empresaA).select();
    expect(r.error, JSON.stringify(campo)).not.toBeNull();
  }
  expect((await A.cliente.from('empresas').delete().eq('id', ids.empresaA).select()).error).not.toBeNull();
  expect((await A.cliente.from('empresas').insert({ cnpj: cnpjAleatorio(), razao_social: 'X', email_comercial: 'x@resend.dev', cidade: 'Palmas', estado: 'TO', tipo_empresa: 'comum', criado_por: A.id })).error).not.toBeNull();

  // Vínculo com contador para provar que ele não ganha edição e que nada é apagado
  const { data: idVinculo } = await A.cliente.rpc('solicitar_vinculo_contabil', { p_id_empresa: ids.empresaA, p_id_contador: C.id, p_id_escritorio: null, p_funcao: 'principal', p_permissoes: null });
  await C.cliente.rpc('responder_vinculo_contabil', { p_id_vinculo: idVinculo, p_aceitar: true, p_id_contador: null });
  await A.cliente.rpc('alterar_vinculo_contabil', { p_id_vinculo: idVinculo, p_funcao: 'principal', p_permissoes: ['ver_financeiro', 'gerenciar_financeiro'] });

  // Gestor edita os campos permitidos pela função controlada; validações recusam dados ruins
  expect((await editar(A.cliente, ids.empresaA)).error).toBeNull();
  const depois = (await admin().from('empresas').select('*').eq('id', ids.empresaA).single()).data!;
  expect({ nome: depois.nome_comercial, tel: depois.telefone, email: depois.email_comercial, cidade: depois.cidade, uf: depois.estado, cnae: depois.cnae_principal })
    .toEqual({ nome: 'Nome Novo', tel: '63988887777', email: 'contato@resend.dev', cidade: 'Araguaína', uf: 'TO', cnae: '6201-5/01' });
  expect({ cnpj: depois.cnpj, razao: depois.razao_social, tipo: depois.tipo_empresa, status: depois.status_registro, criador: depois.criado_por })
    .toEqual({ cnpj: antes.cnpj, razao: antes.razao_social, tipo: antes.tipo_empresa, status: antes.status_registro, criador: antes.criado_por });
  for (const ruim of [{ p_email_comercial: 'invalido' }, { p_estado: 'XX' }, { p_telefone: '123' }, { p_cidade: '' }]) {
    expect((await editar(A.cliente, ids.empresaA, ruim)).error, JSON.stringify(ruim)).not.toBeNull();
  }
  const { data: auditoria } = await admin().from('auditoria').select('acao, id_usuario').eq('id_registro', ids.empresaA);
  expect(auditoria).toEqual([{ acao: 'empresa_atualizada', id_usuario: A.id }]);

  // Outra empresa, contador (mesmo com gerenciar_financeiro), admin e Admin Master: não editam
  for (const [rotulo, cli] of [['B', B.cliente], ['contador', C.cliente], ['admin', AD.cliente], ['admin_master', M.cliente]] as const) {
    expect((await editar(cli, ids.empresaA, { p_nome_comercial: rotulo })).error, rotulo).not.toBeNull();
  }

  // Vínculo, permissões e dono continuam intactos
  const { data: vinc } = await admin().from('vinculos_contabeis').select('status, permissoes').eq('id', idVinculo as string).single();
  expect(vinc?.status).toBe('ativo');
  expect(vinc?.permissoes).toEqual(expect.arrayContaining(['ver_financeiro', 'gerenciar_financeiro']));
  expect((await admin().from('usuarios_empresas').select('tipo_vinculacao').eq('id_empresa', ids.empresaA).eq('id_usuario', A.id).single()).data?.tipo_vinculacao).toBe('dono');
});

test('S4: admin comum sem acesso amplo; Admin Master mantém o acesso administrativo', async () => {
  // admin comum: não lista empresas, vínculos nem relações de outros; não roda a consulta administrativa
  expect((await AD.cliente.from('empresas').select('id').in('id', [ids.empresaA, ids.escritorioC])).data ?? []).toEqual([]);
  expect((await AD.cliente.from('vinculos_contabeis').select('id').eq('id_empresa', ids.empresaA)).data ?? []).toEqual([]);
  expect((await AD.cliente.from('usuarios_empresas').select('id_usuario').eq('id_empresa', ids.empresaA)).data ?? []).toEqual([]);
  expect((await AD.cliente.rpc('admin_vinculos_contabeis', { p_id_empresa: ids.empresaA })).error).not.toBeNull();
  expect((await AD.cliente.rpc('vinculos_da_empresa', { p_id_empresa: ids.empresaA })).error).not.toBeNull();
  expect((await AD.cliente.rpc('empresas_do_escritorio', { p_id_escritorio: ids.escritorioC })).error).not.toBeNull();

  // Admin Master: mantém a visão administrativa (cadastro e vínculos)
  expect((await M.cliente.from('empresas').select('id').in('id', [ids.empresaA, ids.escritorioC])).data).toHaveLength(2);
  expect((await M.cliente.rpc('admin_vinculos_contabeis', { p_id_empresa: ids.empresaA })).error).toBeNull();

  // Nenhum dos dois lê dados financeiros privados da empresa
  for (const cli of [AD.cliente, M.cliente]) {
    expect((await cli.from('lancamentos_financeiros').select('id').eq('id_empresa', ids.empresaA)).data ?? []).toEqual([]);
    expect((await cli.from('categorias_financeiras').select('id').eq('id_empresa', ids.empresaA)).data ?? []).toEqual([]);
    expect((await cli.rpc('resumo_financeiro', { p_id_empresa: ids.empresaA, p_mes: null })).error).not.toBeNull();
  }

  // Empresário e contador não executam a consulta administrativa
  for (const cli of [A.cliente, C.cliente]) expect((await cli.rpc('admin_vinculos_contabeis', {})).error).not.toBeNull();

  // Tarefas da plataforma: admin comum continua com acesso (decisão aprovada)
  expect((await AD.cliente.rpc('pode_acessar_contexto_tarefas', { p_contexto: 'plataforma', p_id_empresa: null })).data).toBe(true);
});
