import { type NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Rotas públicas que NÃO precisam de autenticação
  const publicRoutes = ['/login', '/signup', '/forgot-password', '/reset-password', '/'];

  // Verificar se é rota pública
  const isPublic = publicRoutes.includes(pathname);
  if (isPublic) return NextResponse.next();

  // Obter sessão do cookie (JWT)
  const cookies = request.cookies;

  // Verificar se tem token de autenticação
  const authToken = Array.from(cookies.getSetCookie?.() || [])
    .find(c => c.includes('sb-') && c.includes('-auth-token'))
    ?.split('=')[1];

  if (!authToken) {
    // Se não tem token e não é rota pública, redirecionar para login
    if (pathname !== '/login') {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  // Se tem token, permitir que a página/layout faça as verificações
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
