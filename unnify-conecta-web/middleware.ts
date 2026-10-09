import { NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Páginas que Admin Master NÃO pode acessar
  const adminMasterBlockedPages = ['/onboarding', '/signup'];

  // Verificar se está tentando acessar páginas bloqueadas
  const isBlockedPage = adminMasterBlockedPages.some(page =>
    pathname === page || pathname.startsWith(`${page}/`)
  );

  if (!isBlockedPage) {
    return NextResponse.next();
  }

  // Pegar token da cookie
  const token = request.cookies.get('sb-bvwfoafkqjquxcbijffj-auth-token')?.value;

  if (!token) {
    return NextResponse.next();
  }

  try {
    // Parse o token JWT para pegar os dados do usuário
    const parts = token.split('.');
    if (parts.length !== 3) return NextResponse.next();

    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64').toString('utf-8')
    );

    const userId = payload.sub;

    if (!userId) {
      return NextResponse.next();
    }

    // Fazer request para check-role API
    const response = await fetch(
      `${request.nextUrl.origin}/api/auth/check-role`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const { role } = await response.json();

    // Se é admin_master, redirecionar para /admin
    if (role === 'admin_master') {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
  } catch (error) {
    console.error('Middleware error:', error);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/onboarding/:path*', '/signup/:path*'],
};
