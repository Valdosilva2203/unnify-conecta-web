import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Tarefas — base única com 3 contextos isolados (empresa, escritório, plataforma). API + banco.
// Inclui: Admin Master SEM acesso às tarefas das empresas; responsáveis só do próprio contexto.

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
const marca = `ts${Date.now()}`;
const usuarios: string[] = [];
const empresas: string[] = [];
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const hojeBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
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

type Papel = 'empresa' | 'escritorio' | 'admin_master' | 'admin';
async function criarUsuario(rotulo: string, papel: Papel) {
  const email = `delivered+${marca}${rotulo}@resend.dev`;
  const senha = `Ts@${Date.now()}x`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome_completo: `Teste ${rotulo}` } });
  if (error) throw error;
  usuarios.push(data.user.id);
  const dados: Record<string, string> = {};
  if (papel === 'empresa') dados.tipo_usuario = 'empresa';
  if (papel === 'escritorio') dados.tipo_usuario = 'contador';
  if (papel === 'admin_master' || papel === 'admin') dados.funcao_global = papel;
  await admin().from('perfis').update(dados).eq('id_usuario', data.user.id);
  const cliente = anonimo();
  await cliente.auth.signInWithPassword({ email, password: senha });
  let idEmpresa: string | null = null;
  if (papel === 'empresa' || papel === 'escritorio') {
    const { data: r } = await cliente.rpc('criar_empresa', {
      p_cnpj: cnpjAleatorio(), p_razao_social: `EMPRESA ${rotulo} ${marca} LTDA`, p_telefone: '63999990000', p_email_comercial: 'teste@resend.dev',
      p_cidade: 'Palmas', p_estado: 'TO', p_tipo_empresa: papel === 'escritorio' ? 'escritorio_contabil' : 'comum', p_nome_comercial: `${rotulo} ${marca}`,
    });
    idEmpresa = r?.[0]?.id;
    empresas.push(idEmpresa!);
  }
  return { id: data.user.id, cliente, idEmpresa };
}

const tarefa = (cli: SupabaseClient, p: Record<string, unknown>) =>
  cli.rpc('salvar_tarefa', { p_id: null, p_descricao: null, p_id_categoria: null, p_prioridade: 'media', p_prazo: null, p_hora: null, p_id_responsavel: null, ...p });
const listar = (cli: SupabaseClient, contexto: string, idEmpresa: string | null, visao = 'todas') =>
  cli.rpc('listar_tarefas', { p_contexto: contexto, p_id_empresa: idEmpresa, p_visao: visao });

test.describe.configure({ mode: 'serial' });
test.setTimeout(4 * 60 * 1000);

let A: Awaited<ReturnType<typeof criarUsuario>>; // empresário
let B: Awaited<ReturnType<typeof criarUsuario>>; // outro empresário
let K: Awaited<ReturnType<typeof criarUsuario>>; // dono de escritório
let M: Awaited<ReturnType<typeof criarUsuario>>; // admin master
let N: Awaited<ReturnType<typeof criarUsuario>>; // admin
const ids: Record<string, string> = {};

test.beforeAll(async () => {
  A = await criarUsuario('a', 'empresa');
  B = await criarUsuario('b', 'empresa');
  K = await criarUsuario('k', 'escritorio');
  M = await criarUsuario('m', 'admin_master');
  N = await criarUsuario('n', 'admin');
});

test.afterAll(async () => {
  const sb = admin();
  const { data: pastas } = await sb.storage.from('anexos-tarefas').list('', { limit: 1000 });
  for (const raiz of [...empresas, 'plataforma']) {
    const { data: subs } = await sb.storage.from('anexos-tarefas').list(raiz, { limit: 1000 });
    for (const s of subs ?? []) {
      const { data: arquivos } = await sb.storage.from('anexos-tarefas').list(`${raiz}/${s.name}`);
      if (arquivos?.length) await sb.storage.from('anexos-tarefas').remove(arquivos.map((f) => `${raiz}/${s.name}/${f.name}`));
    }
  }
  void pastas;
  const { data: tPlat } = await sb.from('tarefas').select('id').eq('contexto', 'plataforma').in('criado_por', usuarios);
  if (tPlat?.length) await sb.from('tarefas').delete().in('id', tPlat.map((t) => t.id));
  await sb.from('categorias_tarefas').delete().eq('contexto', 'plataforma').in('criado_por', usuarios);
  if (empresas.length) {
    await sb.from('tarefas').delete().in('id_empresa', empresas);
    await sb.from('categorias_tarefas').delete().in('id_empresa', empresas);
  }
  for (const id of usuarios.reverse()) await sb.auth.admin.deleteUser(id);
});

test('plataforma: administradores criam e atribuem só a administradores; usuário comum não acessa', async () => {
  const cat = await M.cliente.rpc('salvar_categoria_tarefa', { p_id: null, p_contexto: 'plataforma', p_id_empresa: null, p_nome: `Operação ${marca}`, p_cor: '#2563eb', p_icone: 'laptop' });
  expect(cat.error).toBeNull();
  ids.catPlat = cat.data;
  const t = await tarefa(M.cliente, { p_contexto: 'plataforma', p_id_empresa: null, p_titulo: 'Revisar planos de assinatura', p_id_categoria: cat.data, p_prioridade: 'alta', p_prazo: hojeBR(), p_hora: '10:00', p_id_responsavel: N.id });
  expect(t.error).toBeNull();
  ids.tPlat = t.data;
  // Responsável precisa ser administrador
  expect((await tarefa(M.cliente, { p_contexto: 'plataforma', p_id_empresa: null, p_titulo: 'Atribuir a cliente', p_id_responsavel: A.id })).error?.message).toContain('Responsável inválido');
  // Admin (não master) também trabalha no contexto da plataforma
  expect((await listar(N.cliente, 'plataforma', null)).data?.map((x: { id: string }) => x.id)).toContain(ids.tPlat);
  const membros = (await M.cliente.rpc('membros_contexto_tarefas', { p_contexto: 'plataforma', p_id_empresa: null })).data as { id_usuario: string }[];
  expect(membros.map((m) => m.id_usuario)).toEqual(expect.arrayContaining([M.id, N.id]));
  expect(membros.map((m) => m.id_usuario)).not.toContain(A.id);

  // Usuário comum: nada da plataforma
  expect((await listar(A.cliente, 'plataforma', null)).error).not.toBeNull();
  expect((await A.cliente.from('tarefas').select('id').eq('contexto', 'plataforma')).data ?? []).toHaveLength(0);
  expect((await A.cliente.from('categorias_tarefas').select('id').eq('contexto', 'plataforma')).data ?? []).toHaveLength(0);
  expect((await tarefa(A.cliente, { p_contexto: 'plataforma', p_id_empresa: null, p_titulo: 'Invasão' })).error).not.toBeNull();
  expect((await A.cliente.rpc('comentar_tarefa', { p_id_tarefa: ids.tPlat, p_texto: 'oi' })).error).not.toBeNull();
  expect((await A.cliente.rpc('detalhe_tarefa', { p_id: ids.tPlat })).error).not.toBeNull();
  expect((await A.cliente.rpc('alterar_status_tarefa', { p_id: ids.tPlat, p_status: 'cancelada' })).error).not.toBeNull();
  expect((await A.cliente.rpc('membros_contexto_tarefas', { p_contexto: 'plataforma', p_id_empresa: null })).error).not.toBeNull();
  expect((await anonimo().rpc('listar_tarefas', { p_contexto: 'plataforma', p_id_empresa: null })).error).not.toBeNull();
});

test('empresa: isolada de outras empresas e do Admin Master; responsáveis só da empresa', async () => {
  const t = await tarefa(A.cliente, { p_contexto: 'empresa', p_id_empresa: A.idEmpresa, p_titulo: 'Enviar notas ao contador', p_prioridade: 'alta', p_prazo: somarDias(hojeBR(), -1), p_id_responsavel: A.id });
  expect(t.error).toBeNull();
  ids.tA = t.data;
  expect((await tarefa(A.cliente, { p_contexto: 'empresa', p_id_empresa: A.idEmpresa, p_titulo: 'Atribuir a estranho', p_id_responsavel: B.id })).error?.message).toContain('Responsável inválido');
  expect((await tarefa(A.cliente, { p_contexto: 'empresa', p_id_empresa: A.idEmpresa, p_titulo: 'Atribuir a admin', p_id_responsavel: M.id })).error?.message).toContain('Responsável inválido');
  // Categoria de outro contexto é recusada
  expect((await tarefa(A.cliente, { p_contexto: 'empresa', p_id_empresa: A.idEmpresa, p_titulo: 'Categoria alheia', p_id_categoria: ids.catPlat })).error?.message).toContain('Categoria inválida');

  for (const [nome, cli] of [['Admin Master', M.cliente], ['Admin', N.cliente], ['outra empresa', B.cliente], ['escritório', K.cliente]] as const) {
    expect((await listar(cli, 'empresa', A.idEmpresa)).error, `${nome}: listar`).not.toBeNull();
    expect((await cli.from('tarefas').select('id').eq('id', ids.tA)).data ?? [], `${nome}: select`).toHaveLength(0);
    expect((await cli.rpc('detalhe_tarefa', { p_id: ids.tA })).error, `${nome}: detalhe`).not.toBeNull();
    expect((await cli.rpc('alterar_status_tarefa', { p_id: ids.tA, p_status: 'concluida' })).error, `${nome}: status`).not.toBeNull();
    expect((await cli.rpc('comentar_tarefa', { p_id_tarefa: ids.tA, p_texto: 'x' })).error, `${nome}: comentar`).not.toBeNull();
    expect((await cli.rpc('adicionar_item_checklist', { p_id_tarefa: ids.tA, p_texto: 'x' })).error, `${nome}: checklist`).not.toBeNull();
    expect((await cli.rpc('resumo_tarefas', { p_contexto: 'empresa', p_id_empresa: A.idEmpresa })).error, `${nome}: resumo`).not.toBeNull();
  }
  // Manipular IDs: editar tarefa de A dizendo que é da plataforma não move nem altera
  const mover = await M.cliente.rpc('salvar_tarefa', { p_id: ids.tA, p_contexto: 'plataforma', p_id_empresa: null, p_titulo: 'Movida', p_descricao: null, p_id_categoria: null, p_prioridade: 'baixa', p_prazo: null, p_hora: null, p_id_responsavel: null });
  expect(mover.error).not.toBeNull();
  const { data: intacta } = await admin().from('tarefas').select('contexto, id_empresa, titulo').eq('id', ids.tA).single();
  expect(intacta).toEqual({ contexto: 'empresa', id_empresa: A.idEmpresa, titulo: 'Enviar notas ao contador' });
  // Contexto errado para o tipo da empresa (empresa comum como "escritório")
  expect((await tarefa(A.cliente, { p_contexto: 'escritorio', p_id_empresa: A.idEmpresa, p_titulo: 'Contexto trocado' })).error).not.toBeNull();
  // Escrita direta bloqueada
  expect((await A.cliente.from('tarefas').update({ titulo: 'Direto' }).eq('id', ids.tA)).error).not.toBeNull();
});

test('escritório: contexto próprio, separado das empresas', async () => {
  const t = await tarefa(K.cliente, { p_contexto: 'escritorio', p_id_empresa: K.idEmpresa, p_titulo: 'Fechamento mensal dos clientes', p_id_responsavel: K.id });
  expect(t.error).toBeNull();
  ids.tK = t.data;
  expect((await listar(A.cliente, 'escritorio', K.idEmpresa)).error).not.toBeNull();
  expect((await listar(M.cliente, 'escritorio', K.idEmpresa)).error, 'Admin Master não vê tarefas do escritório').not.toBeNull();
  expect((await listar(K.cliente, 'empresa', A.idEmpresa)).error).not.toBeNull();
  expect((await listar(K.cliente, 'escritorio', K.idEmpresa)).data?.map((x: { id: string }) => x.id)).toEqual([ids.tK]);
});

test('checklist, comentários, anexos, status idempotente, arquivamento, indicadores e histórico', async () => {
  const item = await A.cliente.rpc('adicionar_item_checklist', { p_id_tarefa: ids.tA, p_texto: 'Separar notas de setembro' });
  expect(item.error).toBeNull();
  expect((await A.cliente.rpc('alternar_item_checklist', { p_id_item: item.data, p_concluido: true })).error).toBeNull();
  expect((await M.cliente.rpc('alternar_item_checklist', { p_id_item: item.data, p_concluido: false })).error).not.toBeNull();
  const com = await A.cliente.rpc('comentar_tarefa', { p_id_tarefa: ids.tA, p_texto: 'Já separei metade.' });
  expect(com.error).toBeNull();
  expect((await M.cliente.rpc('excluir_comentario_tarefa', { p_id: com.data })).error).not.toBeNull();

  // Anexos: pasta <id_empresa>/<id_tarefa>/
  const caminho = `${A.idEmpresa}/${ids.tA}/notas-${Date.now()}.pdf`;
  expect((await A.cliente.storage.from('anexos-tarefas').upload(caminho, PDF, { contentType: 'application/pdf' })).error).toBeNull();
  expect((await A.cliente.rpc('registrar_anexo_tarefa', { p_id_tarefa: ids.tA, p_caminho: caminho, p_nome_arquivo: 'notas.pdf' })).error).toBeNull();
  expect((await A.cliente.storage.from('anexos-tarefas').createSignedUrl(caminho, 60)).error).toBeNull();
  expect((await M.cliente.storage.from('anexos-tarefas').createSignedUrl(caminho, 60)).error, 'Admin Master não baixa anexo de empresa').not.toBeNull();
  expect((await B.cliente.storage.from('anexos-tarefas').upload(`${A.idEmpresa}/${ids.tA}/x.pdf`, PDF, { contentType: 'application/pdf' })).error).not.toBeNull();
  expect((await A.cliente.storage.from('anexos-tarefas').upload(`plataforma/${ids.tA}/x.pdf`, PDF, { contentType: 'application/pdf' })).error, 'pasta errada').not.toBeNull();
  expect((await A.cliente.storage.from('anexos-tarefas').upload(`${A.idEmpresa}/${ids.tPlat}/x.pdf`, PDF, { contentType: 'application/pdf' })).error, 'tarefa de outro contexto').not.toBeNull();
  ids.caminho = caminho;

  const { data: det } = await A.cliente.rpc('detalhe_tarefa', { p_id: ids.tA });
  expect(det.checklist).toEqual([{ id: item.data, texto: 'Separar notas de setembro', concluido: true }]);
  expect(det.comentarios[0]).toMatchObject({ texto: 'Já separei metade.', meu: true, autor: 'Teste a' });
  expect(det.anexos[0]).toMatchObject({ nome_arquivo: 'notas.pdf' });

  // Indicadores e atraso calculado
  let { data: resumo } = await A.cliente.rpc('resumo_tarefas', { p_contexto: 'empresa', p_id_empresa: A.idEmpresa });
  expect(resumo).toMatchObject({ pendentes: 1, em_andamento: 0, concluidas: 0, atrasadas: 1 });
  const { data: lista } = await listar(A.cliente, 'empresa', A.idEmpresa);
  expect(lista[0]).toMatchObject({ atrasada: true, checklist_total: 1, checklist_feitos: 1, qtd_comentarios: 1, qtd_anexos: 1, responsavel_nome: 'Teste a' });

  // Concluir 5x ao mesmo tempo → um único registro de mudança de status
  await Promise.all(Array.from({ length: 5 }, () => A.cliente.rpc('alterar_status_tarefa', { p_id: ids.tA, p_status: 'concluida' })));
  const { data: hist } = await admin().from('historico_tarefas').select('acao, dados, id_usuario').eq('id_tarefa', ids.tA).eq('acao', 'status');
  expect(hist).toHaveLength(1);
  expect(hist?.[0]).toMatchObject({ dados: { de: 'pendente', para: 'concluida' }, id_usuario: A.id });
  ({ data: resumo } = await A.cliente.rpc('resumo_tarefas', { p_contexto: 'empresa', p_id_empresa: A.idEmpresa }));
  expect(resumo).toMatchObject({ pendentes: 0, concluidas: 1, atrasadas: 0 });
  expect((await listar(A.cliente, 'empresa', A.idEmpresa, 'concluidas')).data).toHaveLength(1);
  // Reabrir, cancelar, arquivar
  expect((await A.cliente.rpc('alterar_status_tarefa', { p_id: ids.tA, p_status: 'pendente' })).error).toBeNull();
  expect((await A.cliente.rpc('alterar_status_tarefa', { p_id: ids.tA, p_status: 'cancelada' })).error).toBeNull();
  expect((await A.cliente.rpc('arquivar_tarefa', { p_id: ids.tA, p_arquivar: true })).error).toBeNull();
  expect((await listar(A.cliente, 'empresa', A.idEmpresa, 'canceladas')).data).toHaveLength(0);
  expect((await listar(A.cliente, 'empresa', A.idEmpresa, 'arquivadas')).data).toHaveLength(1);
  expect((await A.cliente.rpc('alterar_status_tarefa', { p_id: ids.tA, p_status: 'inventado' })).error).not.toBeNull();
  const { data: acoes } = await A.cliente.from('historico_tarefas').select('acao').eq('id_tarefa', ids.tA);
  expect(acoes?.map((h) => h.acao)).toEqual(expect.arrayContaining(['criada', 'status', 'arquivada', 'checklist', 'comentario', 'anexo']));
  // Validações
  expect((await tarefa(A.cliente, { p_contexto: 'empresa', p_id_empresa: A.idEmpresa, p_titulo: 'ab' })).error).not.toBeNull();
  expect((await tarefa(A.cliente, { p_contexto: 'empresa', p_id_empresa: A.idEmpresa, p_titulo: 'Prioridade errada', p_prioridade: 'urgente' })).error).not.toBeNull();
  expect((await tarefa(A.cliente, { p_contexto: 'empresa', p_id_empresa: A.idEmpresa, p_titulo: 'Hora sem prazo', p_hora: '10:00' })).error).not.toBeNull();
  expect((await A.cliente.rpc('salvar_categoria_tarefa', { p_id: null, p_contexto: 'empresa', p_id_empresa: A.idEmpresa, p_nome: 'Fiscal', p_cor: '#2563eb', p_icone: '<svg>' })).error?.message).toContain('Ícone inválido');
});
