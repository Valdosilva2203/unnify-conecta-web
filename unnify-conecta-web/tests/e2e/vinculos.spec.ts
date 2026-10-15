import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bancoLocal, exigirBancoLocal } from './apoio/banco-local';

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
// Escreve no banco (usuários, empresas, vínculos): só com Supabase LOCAL; nunca no compartilhado
test.skip(!bancoLocal(), 'Escreve no banco: só roda com Supabase local.');
const admin = () => (exigirBancoLocal(),
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }));
const novoCliente = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

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

type Usuario = { id: string; cli: SupabaseClient; empresaId?: string };
const criados: string[] = [];

async function usuario(rotulo: string, tipo: 'empresa' | 'contador'): Promise<Usuario> {
  const email = `delivered+vinc${rotulo}${Date.now()}@resend.dev`;
  const senha = `Vinc@${Date.now()}x`;
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome_completo: `Teste ${rotulo}` },
  });
  if (error) throw error;
  criados.push(data.user.id);
  await admin().from('perfis').update({ tipo_usuario: tipo }).eq('id_usuario', data.user.id);
  const cli = novoCliente();
  await cli.auth.signInWithPassword({ email, password: senha });
  return { id: data.user.id, cli };
}

async function criarEmpresa(u: Usuario, rotulo: string, tipo: 'comum' | 'escritorio_contabil') {
  const { data, error } = await u.cli.rpc('criar_empresa', {
    p_cnpj: cnpjAleatorio(),
    p_razao_social: `VINCULO ${rotulo} LTDA`,
    p_telefone: '63999990000',
    p_email_comercial: 'teste@resend.dev',
    p_cidade: 'Palmas',
    p_estado: 'TO',
    p_tipo_empresa: tipo,
    p_nome_comercial: `Vínculo ${rotulo}`,
  });
  if (error || !data?.[0]?.sucesso) throw new Error(`criar_empresa: ${error?.message ?? data?.[0]?.mensagem}`);
  u.empresaId = data[0].id;
  return data[0].id as string;
}

const empresasVisiveis = async (u: Usuario) => ((await u.cli.from('empresas').select('id')).data ?? []).map((e) => e.id);

test.describe.configure({ mode: 'serial' });
test.setTimeout(5 * 60 * 1000);

test('vínculos contábeis: integridade, duplicidade, concorrência, autorização e isolamento', async () => {
  try {
    // Cenário
    const A = await usuario('donoA', 'empresa');
    const B = await usuario('donoB', 'empresa');
    const C1 = await usuario('cont1', 'contador');
    const C2 = await usuario('cont2', 'contador');
    const C3 = await usuario('cont3', 'contador');
    const G = await usuario('gestorEsc', 'contador');
    const M = await usuario('membroEsc', 'contador');
    const EA = await criarEmpresa(A, 'A', 'comum');
    const EB = await criarEmpresa(B, 'B', 'comum');
    const ESC = await criarEmpresa(G, 'ESC', 'escritorio_contabil');
    const { error: erroMembro } = await admin()
      .from('usuarios_empresas')
      .insert({ id_usuario: M.id, id_empresa: ESC, tipo_vinculacao: 'contador', ativo: true });
    expect(erroMembro).toBeNull();

    // Brecha antiga: ninguém pode se inserir como dono de empresa alheia
    const autoDono = await C3.cli.from('usuarios_empresas').insert({ id_usuario: C3.id, id_empresa: EA, tipo_vinculacao: 'dono' });
    expect(autoDono.error).not.toBeNull();

    // Escrita direta na tabela é bloqueada
    const direto = await A.cli.from('vinculos_contabeis').insert({ id_empresa: EA, id_contador: C1.id, origem: 'empresa' });
    expect(direto.error).not.toBeNull();

    // Fluxo principal: A solicita C1 como principal; C1 aceita
    const v1 = await A.cli.rpc('solicitar_vinculo_contabil', { p_id_empresa: EA, p_id_contador: C1.id });
    expect(v1.error).toBeNull();
    expect(await empresasVisiveis(C1)).not.toContain(EA); // pendente não dá acesso
    expect((await C1.cli.rpc('responder_vinculo_contabil', { p_id_vinculo: v1.data, p_aceitar: true })).error).toBeNull();
    expect(await empresasVisiveis(C1)).toContain(EA);
    expect((await C1.cli.rpc('contador_pode', { p_id_empresa: EA, p_permissao: 'ver_dados_cadastrais' })).data).toBe(true);
    // Acesso financeiro nunca vem automaticamente com o vínculo (só por permissão explícita da empresa)
    expect((await C1.cli.rpc('contador_pode', { p_id_empresa: EA, p_permissao: 'ver_financeiro' })).data).toBe(false);

    // Duplicidade
    const dup = await A.cli.rpc('solicitar_vinculo_contabil', { p_id_empresa: EA, p_id_contador: C1.id, p_funcao: 'fiscal' });
    expect(dup.error?.message).toContain('Já existe um vínculo');

    // Segundo principal ativo é barrado; como fiscal é aceito
    const v2 = await A.cli.rpc('solicitar_vinculo_contabil', { p_id_empresa: EA, p_id_contador: C2.id });
    expect(v2.error).toBeNull();
    const aceita2 = await C2.cli.rpc('responder_vinculo_contabil', { p_id_vinculo: v2.data, p_aceitar: true });
    expect(aceita2.error?.message).toContain('principal ativo');
    expect((await C2.cli.rpc('alterar_vinculo_contabil', { p_id_vinculo: v2.data, p_funcao: 'fiscal' })).error).not.toBeNull(); // contador não altera
    expect(
      (await A.cli.rpc('alterar_vinculo_contabil', { p_id_vinculo: v2.data, p_funcao: 'fiscal', p_permissoes: ['ver_documentos'] })).error
    ).toBeNull();
    expect((await C2.cli.rpc('responder_vinculo_contabil', { p_id_vinculo: v2.data, p_aceitar: true })).error).toBeNull();
    expect((await C2.cli.rpc('contador_pode', { p_id_empresa: EA, p_permissao: 'ver_documentos' })).data).toBe(true);
    expect((await C2.cli.rpc('contador_pode', { p_id_empresa: EA, p_permissao: 'ver_financeiro' })).data).toBe(false);

    // Concorrência: dois principais pendentes em EB aceitos ao mesmo tempo -> só um vence
    const p1 = await B.cli.rpc('solicitar_vinculo_contabil', { p_id_empresa: EB, p_id_contador: C1.id });
    const p2 = await B.cli.rpc('solicitar_vinculo_contabil', { p_id_empresa: EB, p_id_contador: C3.id });
    const [r1, r2] = await Promise.all([
      C1.cli.rpc('responder_vinculo_contabil', { p_id_vinculo: p1.data, p_aceitar: true }),
      C3.cli.rpc('responder_vinculo_contabil', { p_id_vinculo: p2.data, p_aceitar: true }),
    ]);
    expect([r1.error, r2.error].filter((e) => e === null)).toHaveLength(1);
    const { count: principaisEB } = await admin()
      .from('vinculos_contabeis')
      .select('id', { count: 'exact', head: true })
      .eq('id_empresa', EB)
      .eq('funcao', 'principal')
      .eq('status', 'ativo');
    expect(principaisEB).toBe(1);

    // Autorização: terceiros não respondem, não alteram, não encerram, não leem
    expect((await C3.cli.rpc('responder_vinculo_contabil', { p_id_vinculo: v1.data, p_aceitar: false })).error).not.toBeNull();
    expect((await B.cli.rpc('encerrar_vinculo_contabil', { p_id_vinculo: v1.data })).error).not.toBeNull();
    expect((await B.cli.rpc('vinculos_da_empresa', { p_id_empresa: EA })).error).not.toBeNull();
    expect(((await B.cli.from('vinculos_contabeis').select('id').eq('id_empresa', EA)).data ?? [])).toHaveLength(0);
    const updDireto = await C1.cli.from('vinculos_contabeis').update({ permissoes: ['ver_folha'] }).eq('id', v1.data).select();
    expect(updDireto.error !== null || (updDireto.data ?? []).length === 0).toBe(true);

    // Isolamento: contador sem vínculo não vê EA; dono de outra empresa não vê EA
    expect(await empresasVisiveis(M)).not.toContain(EA);
    expect(await empresasVisiveis(B)).not.toContain(EA);

    // Integridade: alvo inválido (empresa comum como escritório / usuário empresa como contador)
    expect((await A.cli.rpc('solicitar_vinculo_contabil', { p_id_empresa: EA, p_id_escritorio: EB })).error?.message).toContain('escritório');
    expect((await A.cli.rpc('solicitar_vinculo_contabil', { p_id_empresa: EA, p_id_contador: B.id, p_funcao: 'auxiliar' })).error?.message).toContain('contador');

    // Escritório: A solicita o escritório; gestor designa o membro M
    const ve = await A.cli.rpc('solicitar_vinculo_contabil', { p_id_empresa: EA, p_id_escritorio: ESC, p_funcao: 'consultoria' });
    expect(ve.error).toBeNull();
    expect((await G.cli.rpc('responder_vinculo_contabil', { p_id_vinculo: ve.data, p_aceitar: true })).error?.message).toContain('Informe qual contador');
    expect((await G.cli.rpc('responder_vinculo_contabil', { p_id_vinculo: ve.data, p_aceitar: true, p_id_contador: C3.id })).error?.message).toContain('não é membro');
    expect((await G.cli.rpc('responder_vinculo_contabil', { p_id_vinculo: ve.data, p_aceitar: true, p_id_contador: M.id })).error).toBeNull();
    expect(await empresasVisiveis(M)).toContain(EA);
    expect(await empresasVisiveis(G)).not.toContain(EA); // vínculo com escritório não libera os demais membros
    const doEscritorio = await G.cli.rpc('empresas_do_escritorio', { p_id_escritorio: ESC });
    expect(doEscritorio.error).toBeNull();
    expect(doEscritorio.data?.map((r: { id_empresa: string }) => r.id_empresa)).toContain(EA);

    // Consultas bidirecionais
    const daEmpresa = await A.cli.rpc('vinculos_da_empresa', { p_id_empresa: EA });
    expect(daEmpresa.error).toBeNull();
    expect(daEmpresa.data?.[0]).toMatchObject({ funcao: 'principal', status: 'ativo', id_contador: C1.id });
    expect(daEmpresa.data?.length).toBe(3);
    const doContador = await C1.cli.rpc('empresas_do_contador', { p_limite: 10 });
    expect(doContador.data?.map((r: { id_empresa: string }) => r.id_empresa)).toContain(EA);
    expect((await C1.cli.rpc('admin_vinculos_contabeis', {})).error).not.toBeNull(); // não-admin

    // Encerramento: sem exclusão física, acesso revogado, histórico preservado
    expect((await A.cli.rpc('encerrar_vinculo_contabil', { p_id_vinculo: v1.data, p_motivo: 'Troca de contador' })).error).toBeNull();
    expect(await empresasVisiveis(C1)).not.toContain(EA);
    const encerrado = await admin().from('vinculos_contabeis').select('status, encerrado_em, motivo_encerramento').eq('id', v1.data).single();
    expect(encerrado.data).toMatchObject({ status: 'encerrado', motivo_encerramento: 'Troca de contador' });
    expect((await C1.cli.rpc('responder_vinculo_contabil', { p_id_vinculo: v1.data, p_aceitar: true })).error).not.toBeNull();
    const historico = await A.cli.from('historico_vinculos_contabeis').select('acao').eq('id_vinculo', v1.data).order('alterado_em');
    expect(historico.data?.map((h) => h.acao)).toEqual(['solicitado', 'ativo', 'encerrado']);
    expect(((await B.cli.from('historico_vinculos_contabeis').select('id').eq('id_vinculo', v1.data)).data ?? [])).toHaveLength(0);

    // Após encerrar o principal, outro pode assumir
    const novoPrincipal = await A.cli.rpc('alterar_vinculo_contabil', { p_id_vinculo: v2.data, p_funcao: 'principal' });
    expect(novoPrincipal.error).toBeNull();
  } finally {
    for (const id of criados.reverse()) await admin().auth.admin.deleteUser(id);
  }
});
