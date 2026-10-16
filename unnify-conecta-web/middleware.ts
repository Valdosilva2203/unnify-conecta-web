import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// /admin: o papel é conferido NO SERVIDOR antes de a página carregar. Sem sessão → /login; usuário autenticado sem papel
// admin/admin_master (empresário, contador, colaborador) → /app (que leva cada perfil à sua área). Os dados continuam
// protegidos no banco (RLS + funções is_admin) e a GuardaAdmin só monta as páginas após confirmar o papel.
// Token rejeitado pelo Auth ou falha de rede: segue para a guarda da página, que manda ao login (nenhum dado é liberado).
export async function middleware(request: NextRequest) {
  const temSessao = request.cookies.getAll().some((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name));
  if (!temSessao) return NextResponse.redirect(new URL('/login', request.url));

  let resposta = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        lista.forEach(({ name, value }) => request.cookies.set(name, value));
        resposta = NextResponse.next({ request });
        lista.forEach(({ name, value, options }) => resposta.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  if (!data.user) return resposta;
  const { data: perfil, error } = await supabase.from('perfis').select('funcao_global').eq('id_usuario', data.user.id).maybeSingle();
  if (error) return resposta;
  if (perfil?.funcao_global === 'admin_master' || perfil?.funcao_global === 'admin') return resposta;
  return NextResponse.redirect(new URL('/app', request.url));
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
};
