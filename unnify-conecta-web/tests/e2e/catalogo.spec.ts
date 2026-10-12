import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
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

type U = { id: string; cli: SupabaseClient };
const criados: string[] = [];
const marca = `cat${Date.now()}`;

async function usuario(rotulo: string, tipo: 'empresa' | 'contador'): Promise<U> {
  const email = `delivered+${marca}${rotulo}@resend.dev`;
  const senha = `Cat@${Date.now()}x`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw error;
  criados.push(data.user.id);
  await admin().from('perfis').update({ tipo_usuario: tipo }).eq('id_usuario', data.user.id);
  const cli = novoCliente();
  await cli.auth.signInWithPassword({ email, password: senha });
  return { id: data.user.id, cli };
}

async function empresa(u: U, tipo: 'comum' | 'escritorio_contabil') {
  const { data, error } = await u.cli.rpc('criar_empresa', {
    p_cnpj: cnpjAleatorio(), p_razao_social: `CATALOGO ${tipo} LTDA`, p_telefone: '63999990000',
    p_email_comercial: 'teste@resend.dev', p_cidade: 'Palmas', p_estado: 'TO', p_tipo_empresa: tipo,
  });
  if (error || !data?.[0]?.sucesso) throw new Error(`criar_empresa: ${error?.message ?? data?.[0]?.mensagem}`);
  return data[0].id as string;
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

test.describe.configure({ mode: 'serial' });
test.setTimeout(5 * 60 * 1000);

test('catálogo: publicação, visibilidade, contatos, autoria e fotos', async () => {
  try {
    const A = await usuario('empA', 'empresa');
    const semEmpresa = await usuario('semEmp', 'empresa');
    const C = await usuario('cont', 'contador');
    const D = await usuario('contOculto', 'contador');
    const G = await usuario('gestor', 'contador');
    const M = await usuario('membro', 'contador');
    const EA = await empresa(A, 'comum');
    const ESC = await empresa(G, 'escritorio_contabil');
    await admin().from('usuarios_empresas').insert({ id_usuario: M.id, id_empresa: ESC, tipo_vinculacao: 'contador', ativo: true });

    // Perfil do contador: nasce despublicado; publicar exige CRC/cidade/UF
    const ins = await C.cli
      .from('perfis_profissionais')
      .insert({ id_usuario: C.id, nome_profissional: `Contador ${marca}`, email_comercial: 'contato@resend.dev', telefone_comercial: '63988887777' })
      .select('id, publicado')
      .single();
    expect(ins.error).toBeNull();
    expect(ins.data?.publicado).toBe(false);
    const perfilC = ins.data!.id as string;
    expect((await C.cli.from('perfis_profissionais').update({ publicado: true }).eq('id', perfilC)).error).not.toBeNull();
    expect(
      (await C.cli.from('perfis_profissionais')
        .update({ crc: 'TO-012345/O', cidade: 'Palmas', estado: 'TO', especialidades: ['MEI', 'Simples Nacional'], publicado: true })
        .eq('id', perfilC)).error
    ).toBeNull();

    // Ninguém cria/edita perfil de outra pessoa nem cria perfil de "empresa"
    expect((await A.cli.from('perfis_profissionais').insert({ id_usuario: C.id, nome_profissional: 'Falso' })).error).not.toBeNull();
    expect((await A.cli.from('perfis_profissionais').insert({ id_usuario: A.id, nome_profissional: 'Empresa não é contador' })).error).not.toBeNull();
    const editarAlheio = await D.cli.from('perfis_profissionais').update({ nome_profissional: 'Invadido' }).eq('id', perfilC).select();
    expect(editarAlheio.data ?? []).toHaveLength(0);
    expect((await C.cli.from('perfis_profissionais').delete().eq('id', perfilC)).error).not.toBeNull();

    // Perfil oculto (despublicado) de D
    const insD = await D.cli.from('perfis_profissionais')
      .insert({ id_usuario: D.id, nome_profissional: `Oculto ${marca}`, crc: 'TO-999/O', cidade: 'Palmas', estado: 'TO' })
      .select('id').single();
    const perfilD = insD.data!.id as string;

    // Perfil do escritório: só o gestor; membro não edita; separado do perfil dos contadores
    const insE = await G.cli.from('perfis_profissionais')
      .insert({ id_escritorio: ESC, nome_profissional: `Escritório ${marca}`, crc: 'TO-555/O', cidade: 'Palmas', estado: 'TO', publicado: true })
      .select('id').single();
    expect(insE.error).toBeNull();
    const perfilE = insE.data!.id as string;
    expect(((await M.cli.from('perfis_profissionais').update({ nome_profissional: 'x' }).eq('id', perfilE).select()).data ?? [])).toHaveLength(0);
    expect((await M.cli.from('perfis_profissionais').insert({ id_escritorio: ESC, nome_profissional: 'Dup' })).error).not.toBeNull();

    // Quem pode buscar: empresa ativa sim; sem empresa / contador / anônimo não
    const busca = await A.cli.rpc('buscar_catalogo_contadores', { p_busca: marca });
    expect(busca.error).toBeNull();
    const ids = (busca.data ?? []).map((r: { id: string }) => r.id);
    expect(ids).toContain(perfilC);
    expect(ids).toContain(perfilE);
    expect(ids).not.toContain(perfilD);
    expect(busca.data?.find((r: { id: string }) => r.id === perfilE)?.tipo).toBe('escritorio');
    for (const linha of busca.data ?? []) {
      expect(Object.keys(linha)).not.toContain('email_comercial');
      expect(Object.keys(linha)).not.toContain('telefone_comercial');
    }
    expect((await semEmpresa.cli.rpc('buscar_catalogo_contadores', {})).error).not.toBeNull();
    expect((await C.cli.rpc('buscar_catalogo_contadores', {})).error).not.toBeNull();
    expect((await novoCliente().rpc('buscar_catalogo_contadores', {})).error).not.toBeNull();
    expect((await A.cli.rpc('perfil_do_catalogo', { p_id_perfil: perfilD })).data ?? []).toHaveLength(0);
    expect(((await A.cli.from('perfis_profissionais').select('email_comercial')).data ?? [])).toHaveLength(0);

    // Filtros
    const porEspecialidade = await A.cli.rpc('buscar_catalogo_contadores', { p_busca: marca, p_especialidade: 'MEI' });
    expect((porEspecialidade.data ?? []).map((r: { id: string }) => r.id)).toEqual([perfilC]);

    // Solicitar pelo catálogo: só perfis publicados; contatos só após aprovação
    expect((await A.cli.rpc('solicitar_vinculo_pelo_catalogo', { p_id_empresa: EA, p_id_perfil: perfilD })).error).not.toBeNull();
    expect((await semEmpresa.cli.rpc('solicitar_vinculo_pelo_catalogo', { p_id_empresa: EA, p_id_perfil: perfilC })).error).not.toBeNull();
    const sol = await A.cli.rpc('solicitar_vinculo_pelo_catalogo', { p_id_empresa: EA, p_id_perfil: perfilC });
    expect(sol.error).toBeNull();
    let lista = await A.cli.rpc('vinculos_da_empresa', { p_id_empresa: EA });
    expect(lista.data?.[0]).toMatchObject({ status: 'pendente', email_comercial: null, telefone_comercial: null, contador_email: null });
    expect((await C.cli.rpc('responder_vinculo_contabil', { p_id_vinculo: sol.data, p_aceitar: true })).error).toBeNull();
    lista = await A.cli.rpc('vinculos_da_empresa', { p_id_empresa: EA });
    expect(lista.data?.[0]).toMatchObject({ status: 'ativo', email_comercial: 'contato@resend.dev', telefone_comercial: '63988887777' });
    await C.cli.from('perfis_profissionais').update({ compartilhar_contatos: false }).eq('id', perfilC);
    lista = await A.cli.rpc('vinculos_da_empresa', { p_id_empresa: EA });
    expect(lista.data?.[0]).toMatchObject({ email_comercial: null, telefone_comercial: null });

    // Fotos: dono envia; empresa autorizada vê publicada; terceiros não enviam nem veem
    const caminho = `${perfilC}/foto.png`;
    expect((await C.cli.storage.from('fotos-perfis').upload(caminho, PNG, { contentType: 'image/png', upsert: true })).error).toBeNull();
    expect((await D.cli.storage.from('fotos-perfis').upload(`${perfilC}/invasao.png`, PNG, { contentType: 'image/png' })).error).not.toBeNull();
    expect((await A.cli.storage.from('fotos-perfis').createSignedUrl(caminho, 60)).error).toBeNull();
    expect((await semEmpresa.cli.storage.from('fotos-perfis').createSignedUrl(caminho, 60)).error).not.toBeNull();
    expect((await novoCliente().storage.from('fotos-perfis').createSignedUrl(caminho, 60)).error).not.toBeNull();

    // Despublicar: some do catálogo (e a foto deixa de ser visível por ele — mas o vínculo ativo mantém)
    await C.cli.from('perfis_profissionais').update({ publicado: false }).eq('id', perfilC);
    expect(((await A.cli.rpc('buscar_catalogo_contadores', { p_busca: marca })).data ?? []).map((r: { id: string }) => r.id)).not.toContain(perfilC);

    // Conta suspensa sai do catálogo mesmo publicada
    await C.cli.from('perfis_profissionais').update({ publicado: true }).eq('id', perfilC);
    await admin().from('perfis').update({ status: 'suspended' }).eq('id_usuario', C.id);
    expect(((await A.cli.rpc('buscar_catalogo_contadores', { p_busca: marca })).data ?? []).map((r: { id: string }) => r.id)).not.toContain(perfilC);
  } finally {
    const sb = admin();
    const { data: arquivos } = await sb.storage.from('fotos-perfis').list();
    for (const pasta of arquivos ?? []) {
      const { data: dentro } = await sb.storage.from('fotos-perfis').list(pasta.name);
      const caminhos = (dentro ?? []).map((f) => `${pasta.name}/${f.name}`);
      if (caminhos.length) {
        const { data: dono } = await sb.from('perfis_profissionais').select('nome_profissional').eq('id', pasta.name).maybeSingle();
        if (!dono || dono.nome_profissional.includes(marca)) await sb.storage.from('fotos-perfis').remove(caminhos);
      }
    }
    for (const id of criados.reverse()) await sb.auth.admin.deleteUser(id);
  }
});
