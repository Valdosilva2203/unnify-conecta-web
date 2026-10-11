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
const BASE = 'http://localhost:3000';
const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anonimo = () =>
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

type Conta = { id: string; email: string; cliente: SupabaseClient; empresaId: string };

async function criarEmpresario(rotulo: string): Promise<Conta> {
  const email = `delivered+seg${rotulo}${Date.now()}@resend.dev`;
  const senha = `Seg@${Date.now()}x`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw error;
  const cliente = anonimo();
  await cliente.auth.signInWithPassword({ email, password: senha });
  const { data: r, error: e } = await cliente.rpc('criar_empresa', {
    p_cnpj: cnpjAleatorio(),
    p_razao_social: `SEGURANCA ${rotulo} LTDA`,
    p_telefone: '63999990000',
    p_email_comercial: email,
    p_cidade: 'Palmas',
    p_estado: 'TO',
  });
  if (e || !r?.[0]?.sucesso) throw new Error(`criar_empresa: ${e?.message ?? r?.[0]?.mensagem}`);
  return { id: data.user.id, email, cliente, empresaId: r[0].id };
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(5 * 60 * 1000);

test('controles de segurança', async ({ browser, request }) => {
  const contas: Conta[] = [];
  try {
    const A = await criarEmpresario('a');
    const B = await criarEmpresario('b');
    contas.push(A, B);

    // --- Isolamento entre empresas (RLS) ---
    const empresasVistasPorA = await A.cliente.from('empresas').select('id');
    expect(empresasVistasPorA.data?.map((e) => e.id)).toEqual([A.empresaId]);

    const vinculosVistosPorA = await A.cliente.from('usuarios_empresas').select('id_empresa');
    expect(vinculosVistosPorA.data?.every((v) => v.id_empresa === A.empresaId)).toBe(true);

    const perfisVistosPorA = await A.cliente.from('perfis').select('id_usuario');
    expect(perfisVistosPorA.data?.map((p) => p.id_usuario)).toEqual([A.id]);

    const editarEmpresaDeB = await A.cliente.from('empresas').update({ razao_social: 'INVADIDA' }).eq('id', B.empresaId).select();
    expect(editarEmpresaDeB.data ?? []).toHaveLength(0);

    const editarPerfilDeB = await A.cliente.from('perfis').update({ nome_completo: 'INVADIDO' }).eq('id_usuario', B.id).select();
    expect(editarPerfilDeB.data ?? []).toHaveLength(0);

    const apagarEmpresaDeB = await A.cliente.from('empresas').delete().eq('id', B.empresaId).select();
    expect(apagarEmpresaDeB.data ?? []).toHaveLength(0);
    const empresaDeBAindaExiste = await admin().from('empresas').select('razao_social').eq('id', B.empresaId).single();
    expect(empresaDeBAindaExiste.data?.razao_social).toBe('SEGURANCA b LTDA');

    // --- Escalada de privilégio ---
    const virarAdmin = await A.cliente.from('perfis').update({ funcao_global: 'admin_master' }).eq('id_usuario', A.id);
    expect(virarAdmin.error).not.toBeNull();
    const papelDeA = await admin().from('perfis').select('funcao_global').eq('id_usuario', A.id).single();
    expect(papelDeA.data?.funcao_global).toBe('user');

    const inserirAdminFalso = await anonimo()
      .from('perfis')
      .insert({ id_usuario: crypto.randomUUID(), email: 'x@x.com', funcao_global: 'admin_master', status: 'active' });
    expect(inserirAdminFalso.error).not.toBeNull();

    // --- Anônimo não lê dados ---
    const anonEmpresas = await anonimo().from('empresas').select('id');
    expect(anonEmpresas.data ?? []).toHaveLength(0);
    const anonPerfis = await anonimo().from('perfis').select('id_usuario');
    expect(anonPerfis.data ?? []).toHaveLength(0);

    // --- Rotas do admin ---
    const visitante = await browser.newPage();
    await visitante.goto(`${BASE}/admin/empresas`);
    await visitante.waitForURL('**/login', { timeout: 30000 });
    await expect(visitante.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
    // O HTML oculto do shell pode existir antes do redirecionamento; dado real nunca (RLS, testado acima).
    await expect(visitante.getByText('Gerencie todas as empresas')).not.toBeVisible();
    await visitante.close();

    const paginaA = await browser.newPage();
    const { data: link, error: erroLink } = await admin().auth.admin.generateLink({ type: 'magiclink', email: A.email });
    if (erroLink) throw erroLink;
    await paginaA.goto(`${BASE}/auth/callback?token_hash=${link.properties.hashed_token}&type=email`);
    await paginaA.waitForURL((u) => !u.pathname.startsWith('/auth/callback'), { timeout: 30000 });
    await paginaA.goto(`${BASE}/admin/usuarios`);
    await paginaA.waitForURL('**/app', { timeout: 30000 });

    // CNPJ autenticado funciona para o próprio usuário (cookies da sessão)
    const cnpjLogado = await paginaA.request.post(`${BASE}/api/companies/lookup-cnpj`, { data: { cnpj: '00000000000000' } });
    expect(cnpjLogado.status()).not.toBe(401);
    await paginaA.close();

    // --- Endpoints ---
    const cnpjSemLogin = await request.post(`${BASE}/api/companies/lookup-cnpj`, { data: { cnpj: '24214920000170' } });
    expect(cnpjSemLogin.status()).toBe(401);

    const senhaFraca = await request.post(`${BASE}/api/auth/signup`, {
      data: { email: `delivered+fraca${Date.now()}@resend.dev`, password: '123', fullName: 'Teste' },
      headers: { 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 200)}` },
    });
    expect(senhaFraca.status()).toBe(400);
    expect((await senhaFraca.json()).error).toContain('senha');

    const ipLimite = `10.1.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
    const status: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await request.post(`${BASE}/api/auth/signup`, { data: {}, headers: { 'x-forwarded-for': ipLimite } });
      status.push(r.status());
    }
    expect(status.slice(0, 5).every((s) => s === 400)).toBe(true);
    expect(status[5]).toBe(429);
  } finally {
    for (const c of contas) await admin().auth.admin.deleteUser(c.id);
  }
});
