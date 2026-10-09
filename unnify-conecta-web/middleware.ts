import { type NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Rotas públicas que NÃO precisam de autenticação
  const publicRoutes = ['/login', '/signup', '/forgot-password', '/reset-password', '/'];

  // Verificar se é rota pública
  const isPublic = publicRoutes.includes(pathname);
  if (isPublic) return NextResponse.next();

  // Verificar se tem cookie de autenticação
  const hasCookie = request.cookies.has('sb-bvwfoafkqjquxcbijffj-auth-token');

  if (!hasCookie && pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Se tem token, permitir que o AuthGuard faça as verificações de role
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
