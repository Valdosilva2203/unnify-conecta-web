import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';

// teste-sem-banco: chama os HANDLERS das rotas de servidor diretamente, com Supabase e Resend SIMULADOS (fetch interceptado).
// Nenhuma requisição sai da máquina: qualquer host não previsto faz o teste falhar.
const SUPA = 'https://teste-local.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-falsa';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'servico-falsa';
process.env.RESEND_API_KEY = 're_falsa';
process.env.CRON_SECRET = 'segredo-cron';
delete process.env.NEXT_PUBLIC_SITE_URL;

type Chamada = { url: string; metodo: string; corpo: unknown; auth: string | null };
type Resp = { status?: number; corpo?: unknown };
let chamadas: Chamada[] = [];
let responder: (c: Chamada) => Resp | undefined = () => undefined;
const original = globalThis.fetch;
test.beforeEach(() => {
  chamadas = [];
  globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    if (!url.startsWith(SUPA) && !url.startsWith('https://api.resend.com/')) throw new Error(`Rede bloqueada no teste: ${url}`);
    let corpo: unknown = init?.body ?? null;
    try { corpo = typeof init?.body === 'string' ? JSON.parse(init.body) : corpo; } catch { /* texto */ }
    const h = new Headers(init?.headers);
    const c = { url: url.replace(SUPA, ''), metodo: init?.method ?? 'GET', corpo, auth: h.get('authorization') };
    chamadas.push(c);
    const r = responder(c) ?? { status: 404, corpo: { message: 'não simulado' } };
    return new Response(r.corpo === undefined || r.status === 204 ? null : JSON.stringify(r.corpo), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
});
test.afterAll(() => { globalThis.fetch = original; });

const agora = Math.floor(Date.now() / 1000);
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const USUARIO = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'rh@exemplo.test', app_metadata: {}, user_metadata: {} };
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USUARIO.id, role: 'authenticated', exp: agora + 3600, iat: agora })}.${b64('x')}`;
const cookieSessao = `sb-teste-local-auth-token=base64-${Buffer.from(JSON.stringify({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: agora + 3600, refresh_token: 'r', user: USUARIO })).toString('base64url')}`;
const req = (url: string, corpo?: unknown, headers: Record<string, string> = {}, metodo = 'POST') =>
  new NextRequest(url, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo), headers: { 'content-type': 'application/json', ...headers } });
const emails = () => chamadas.filter((c) => c.url.startsWith('https://api.resend.com/'));

test('convite: só com sessão; token só no e-mail (banco recebe o hash); link no domínio confiável; falha de envio registrada', async () => {
  const { POST } = await import('../../app/api/colaborador/convites/route');
  let resend = 200;
  responder = (c) => {
    if (c.url === '/auth/v1/user') return { corpo: USUARIO };
    if (c.url === '/rest/v1/rpc/criar_convite_colaborador') return { corpo: [{ id: 'cv1', nome: 'Denilson Amorim', empresa: 'Empresa Exemplo', email: 'denilson@exemplo.test', expira_em: '2026-10-23T10:00:00Z' }] };
    if (c.url === '/rest/v1/rpc/registrar_envio_convite_colaborador') return { status: 204 };
    if (c.url === 'https://api.resend.com/emails') return { status: resend, corpo: { id: 'e1' } };
    return undefined;
  };
  const semSessao = await POST(req('https://unnifyconecta.com.br/api/colaborador/convites', { id_funcionario: '22222222-2222-4222-8222-222222222222', email: 'x@y.z' }));
  expect(semSessao.status).toBe(401);
  expect(chamadas.some((c) => c.url.includes('/rpc/'))).toBe(false);

  chamadas = [];
  // Host forjado: o link do e-mail nunca usa um domínio arbitrário
  const r = await POST(req('https://atacante.example/api/colaborador/convites', { id_funcionario: '22222222-2222-4222-8222-222222222222', email: ' Denilson@Exemplo.test ' }, { cookie: cookieSessao }));
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ enviado: true });
  const rpc = chamadas.find((c) => c.url === '/rest/v1/rpc/criar_convite_colaborador')!;
  expect(rpc.auth).toBe(`Bearer ${jwt}`); // grava com a sessão do RH, nunca com a chave de serviço
  const { p_hash: hashEnviado, p_email } = rpc.corpo as { p_hash: string; p_email: string };
  expect(p_email).toBe('denilson@exemplo.test');
  const html = (emails()[0].corpo as { html: string; to: string }).html;
  expect((emails()[0].corpo as { to: string }).to).toBe('denilson@exemplo.test');
  const link = html.match(/href="([^"]+)"/)![1];
  expect(link.startsWith('https://unnifyconecta.com.br/colaborador/ativar#')).toBe(true);
  const token = link.split('#')[1];
  expect(token.length).toBeGreaterThanOrEqual(43);
  expect(createHash('sha256').update(token, 'utf8').digest('hex')).toBe(hashEnviado); // banco só conhece o hash
  expect(JSON.stringify(rpc.corpo)).not.toContain(token);
  expect((chamadas.find((c) => c.url.endsWith('registrar_envio_convite_colaborador'))!.corpo as { p_ok: boolean }).p_ok).toBe(true);

  chamadas = []; resend = 500;
  const falhou = await POST(req('https://unnifyconecta.com.br/api/colaborador/convites', { id_funcionario: '22222222-2222-4222-8222-222222222222', email: 'denilson@exemplo.test' }, { cookie: cookieSessao }));
  expect(await falhou.json()).toMatchObject({ enviado: false });
  expect((chamadas.find((c) => c.url.endsWith('registrar_envio_convite_colaborador'))!.corpo as { p_ok: boolean }).p_ok).toBe(false);

  // Erro do banco (ex.: acesso já ativo) chega como mensagem amigável
  chamadas = [];
  responder = (c) => (c.url === '/auth/v1/user' ? { corpo: USUARIO } : c.url.endsWith('criar_convite_colaborador')
    ? { status: 400, corpo: { code: '23514', message: 'Este colaborador já tem acesso ativo ao portal.' } } : undefined);
  const jaAtivo = await POST(req('https://unnifyconecta.com.br/api/colaborador/convites', { id_funcionario: '22222222-2222-4222-8222-222222222222', email: 'denilson@exemplo.test' }, { cookie: cookieSessao }));
  expect(await jaAtivo.json()).toEqual({ erro: 'Este colaborador já tem acesso ativo ao portal.' });
  expect(emails()).toHaveLength(0);
});

test('ativação: e-mail vem do convite (não do pedido), senha forte, convite inválido/expirado barrado e conta existente → 409', async () => {
  const { POST } = await import('../../app/api/colaborador/ativar/route');
  let situacao = 'valido';
  let jaExiste = false;
  responder = (c) => {
    if (c.url === '/rest/v1/rpc/dados_convite_colaborador') return { corpo: [{ situacao, nome: 'Denilson', empresa: 'Empresa Exemplo', email: situacao === 'valido' ? 'denilson@exemplo.test' : null, expira_em: null }] };
    if (c.url === '/auth/v1/admin/users') return jaExiste ? { status: 422, corpo: { code: 'email_exists', msg: 'A user with this email address has already been registered' } } : { corpo: { id: 'u1', email: 'denilson@exemplo.test' } };
    return undefined;
  };
  const T = 'B'.repeat(43);
  const url = 'https://unnifyconecta.com.br/api/colaborador/ativar';
  expect((await POST(req(url, { token: 'curto', senha: 'Senha@Forte1', nome: 'Denilson' }))).status).toBe(400);
  expect((await POST(req(url, { token: T, senha: 'fraca', nome: 'Denilson' }))).status).toBe(400);
  expect(chamadas).toHaveLength(0);
  situacao = 'expirado';
  const exp = await POST(req(url, { token: T, senha: 'Senha@Forte1', nome: 'Denilson' }));
  expect(exp.status).toBe(400);
  expect(chamadas.some((c) => c.url === '/auth/v1/admin/users')).toBe(false);
  situacao = 'valido'; chamadas = [];
  const ok = await POST(req(url, { token: T, senha: 'Senha@Forte1', nome: 'Denilson Amorim', email: 'atacante@exemplo.test' }, { 'x-forwarded-for': '10.0.0.1' }));
  expect(ok.status).toBe(200);
  const criacao = chamadas.find((c) => c.url === '/auth/v1/admin/users')!;
  expect(criacao.corpo).toMatchObject({ email: 'denilson@exemplo.test', email_confirm: true, user_metadata: { nome_completo: 'Denilson Amorim' } });
  expect(chamadas.find((c) => c.url.endsWith('dados_convite_colaborador'))!.auth).toBe('Bearer anon-falsa'); // leitura do convite sem privilégio
  expect(chamadas.some((c) => c.url.includes('/rest/v1/') && c.auth === 'Bearer servico-falsa')).toBe(false); // chave de serviço só no Auth
  jaExiste = true;
  const existente = await POST(req(url, { token: T, senha: 'Senha@Forte1', nome: 'Denilson' }, { 'x-forwarded-for': '10.0.0.2' }));
  expect(existente.status).toBe(409);
  expect(await existente.json()).toEqual({ conta_existente: true });
});

test('recuperação de senha: resposta igual para e-mail existente ou não; link de redefinição só por e-mail', async () => {
  const { POST } = await import('../../app/api/auth/recuperar-senha/route');
  responder = (c) => {
    if (c.url === '/auth/v1/admin/generate_link') {
      return (c.corpo as { email: string }).email === 'existe@exemplo.test'
        ? { corpo: { id: 'u9', email: 'existe@exemplo.test', action_link: 'x', email_otp: '1', hashed_token: 'hash123', redirect_to: '', verification_type: 'recovery' } }
        : { status: 404, corpo: { code: 'user_not_found', msg: 'User not found' } };
    }
    if (c.url.startsWith('/rest/v1/perfis')) return { corpo: { nome_completo: 'Pessoa Existente' } };
    if (c.url === 'https://api.resend.com/emails') return { corpo: { id: 'e' } };
    return undefined;
  };
  const url = 'https://unnifyconecta.com.br/api/auth/recuperar-senha';
  const naoExiste = await POST(req(url, { email: 'nao-existe@exemplo.test' }, { 'x-forwarded-for': '10.0.1.1' }));
  const existe = await POST(req(url, { email: 'existe@exemplo.test' }, { 'x-forwarded-for': '10.0.1.2' }));
  expect(naoExiste.status).toBe(200);
  expect(await naoExiste.json()).toEqual(await existe.json());
  expect(emails()).toHaveLength(1);
  const html = (emails()[0].corpo as { html: string }).html;
  expect(html).toContain('/reset-password?token_hash=hash123&amp;type=recovery'.replace('&amp;', '&'));
});

test('expurgo de fotos: exige segredo do agendador, desligado por padrão, remove do Storage e registra sucesso/falha', async () => {
  const { GET } = await import('../../app/api/ponto/expurgo-fotos/route');
  const url = 'https://unnifyconecta.com.br/api/ponto/expurgo-fotos';
  expect((await GET(req(url, undefined, {}, 'GET'))).status).toBe(401);
  expect((await GET(req(url, undefined, { authorization: 'Bearer errado' }, 'GET'))).status).toBe(401);
  delete process.env.PONTO_EXPURGO_FOTOS;
  const desligado = await GET(req(url, undefined, { authorization: 'Bearer segredo-cron' }, 'GET'));
  expect(await desligado.json()).toEqual({ ativo: false, excluidas: 0 });
  expect(chamadas).toHaveLength(0);
  process.env.PONTO_EXPURGO_FOTOS = 'ativo';
  responder = (c) => {
    if (c.url === '/rest/v1/rpc/iniciar_expurgo_fotos_ponto') return { corpo: { id_execucao: 'ex1', itens: [{ id_marcacao: 'm1', caminho: 'e/f/m1.jpg' }, { id_marcacao: 'm2', caminho: 'e/f/m2.jpg' }] } };
    if (c.url === '/storage/v1/object/ponto') return (c.corpo as { prefixes: string[] }).prefixes[0] === 'e/f/m2.jpg' ? { status: 500, corpo: { message: 'falhou' } } : { corpo: [{ name: 'e/f/m1.jpg' }] };
    if (c.url.endsWith('concluir_expurgo_foto_ponto') || c.url.endsWith('finalizar_expurgo_fotos_ponto')) return { status: 204 };
    return undefined;
  };
  const r = await GET(req(url, undefined, { authorization: 'Bearer segredo-cron' }, 'GET'));
  expect(await r.json()).toEqual({ ativo: true, selecionadas: 2, excluidas: 1, falhas: 1 });
  const concl = chamadas.filter((c) => c.url.endsWith('concluir_expurgo_foto_ponto')).map((c) => c.corpo);
  expect(concl).toEqual([{ p_id_execucao: 'ex1', p_id_marcacao: 'm1', p_ok: true, p_erro: null }, { p_id_execucao: 'ex1', p_id_marcacao: 'm2', p_ok: false, p_erro: 'falha ao remover do Storage' }]);
  expect(chamadas.some((c) => c.url.endsWith('finalizar_expurgo_fotos_ponto'))).toBe(true);
  delete process.env.PONTO_EXPURGO_FOTOS;
});

test('middleware /admin: sem sessão → login; colaborador/empresário → /app no servidor; admin segue; token rejeitado não libera nada', async () => {
  const { middleware } = await import('../../middleware');
  let funcao = 'user';
  let tokenValido = true;
  responder = (c) => {
    if (c.url === '/auth/v1/user') return tokenValido ? { corpo: USUARIO } : { status: 401, corpo: { code: 'bad_jwt', msg: 'invalid JWT' } };
    if (c.url.startsWith('/rest/v1/perfis')) return { corpo: { funcao_global: funcao } };
    return undefined;
  };
  const pedir = (cookie?: string) => middleware(new NextRequest('https://unnifyconecta.com.br/admin/empresas', { headers: cookie ? { cookie } : {} }));
  const semCookie = await pedir();
  expect(semCookie.status).toBe(307);
  expect(semCookie.headers.get('location')).toBe('https://unnifyconecta.com.br/login');
  expect(chamadas).toHaveLength(0);
  for (const f of ['user', 'empresa']) {
    funcao = f; chamadas = [];
    const r = await pedir(cookieSessao);
    expect(r.status).toBe(307);
    expect(r.headers.get('location')).toBe('https://unnifyconecta.com.br/app');
    expect(chamadas.map((c) => c.url.split('?')[0])).toEqual(['/auth/v1/user', '/rest/v1/perfis']); // só identidade e o próprio perfil
    expect(chamadas[1].auth).toBe(`Bearer ${jwt}`); // com o token do usuário (RLS), nunca a chave de serviço
  }
  for (const f of ['admin_master', 'admin']) {
    funcao = f;
    const r = await pedir(cookieSessao);
    expect(r.headers.get('location')).toBeNull();
    expect(r.headers.get('x-middleware-next')).toBe('1');
  }
  tokenValido = false; chamadas = [];
  const rejeitado = await pedir(cookieSessao);
  expect(rejeitado.headers.get('location')).toBeNull(); // a guarda da página manda ao login; nada é consultado aqui
  expect(chamadas.map((c) => c.url)).toEqual(['/auth/v1/user']);
});
