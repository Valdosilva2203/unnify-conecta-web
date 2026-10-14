import type { BrowserContext, Request } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Sessão e API do Supabase SIMULADAS no navegador de teste (route): nenhuma requisição chega ao banco real.
// Escritas (não-GET) que o teste não tratar explicitamente são abortadas e registradas em `escritasBloqueadas`.

function carregarEnv(): Record<string, string> {
  const texto = readFileSync(join(__dirname, '..', '..', '..', '.env.local'), 'utf8');
  return Object.fromEntries(texto.split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
}

export const SUPABASE = carregarEnv().NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(SUPABASE).hostname.split('.')[0];
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

export const USUARIO_SIMULADO = {
  id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'simulado@exemplo.test',
  app_metadata: {}, user_metadata: {}, factors: [],
};

export type Resposta = { status?: number; corpo?: unknown; total?: number } | undefined;
// Devolve a resposta para a rota (url + requisição) ou undefined para seguir o padrão ([] em leituras; escrita bloqueada)
export type Rotas = (caminho: string, url: URL, req: Request) => Resposta;

export async function sessaoSimulada(ctx: BrowserContext, rotas: Rotas) {
  const registro = { escritasBloqueadas: [] as string[], chamadas: [] as { caminho: string; corpo: unknown }[] };
  const agora = Math.floor(Date.now() / 1000);
  // A biblioteca decodifica o token (inclusive a assinatura em base64url): todos os trechos precisam ser válidos
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USUARIO_SIMULADO.id, role: 'authenticated', aal: 'aal1', amr: [{ method: 'password', timestamp: agora }], exp: agora + 3600, iat: agora })}.${b64('assinatura-falsa')}`;
  const sessao = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: agora + 3600, refresh_token: 'x', user: USUARIO_SIMULADO };
  await ctx.addCookies([{ name: `sb-${REF}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(sessao)).toString('base64url')}`, domain: 'localhost', path: '/' }]);
  await ctx.route(`${SUPABASE}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const caminho = url.pathname.replace('/rest/v1/', '').replace('/auth/v1/', 'auth/');
    if (caminho === 'auth/user') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USUARIO_SIMULADO) });
    let corpo: unknown = null;
    try { corpo = JSON.parse(req.postData() ?? 'null'); } catch { corpo = req.postData(); }
    registro.chamadas.push({ caminho, corpo });
    const r = rotas(caminho, url, req);
    if (r) {
      const headers: Record<string, string> = {};
      if (r.total !== undefined) headers['content-range'] = `0-${Math.max(0, r.total - 1)}/${r.total}`;
      return route.fulfill({ status: r.status ?? 200, contentType: 'application/json', headers, body: r.corpo === undefined ? '' : JSON.stringify(r.corpo) });
    }
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      registro.escritasBloqueadas.push(`${req.method()} ${caminho}`);
      return route.abort();
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' });
  });
  return registro;
}
