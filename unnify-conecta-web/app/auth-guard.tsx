'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);
  const [canRender, setCanRender] = useState(false);

  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        // Rotas públicas
        const publicRoutes = ['/login', '/signup', '/forgot-password', '/reset-password', '/'];
        const isPublicRoute = publicRoutes.includes(pathname);

        // Se não tem sessão
        if (!session?.user?.id) {
          if (!isPublicRoute && pathname !== '/login') {
            router.replace('/login');
          }
          setCanRender(true);
          setIsChecking(false);
          return;
        }

        // Tem sessão - verificar role
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('global_role')
          .eq('user_id', session.user.id)
          .single();

        console.log('AuthGuard check:', {
          userId: session.user.id,
          role: profile?.global_role,
          pathname,
          error
        });

        // Se é admin_master, redirecionar para /admin (exceto se já está lá)
        if (profile?.global_role === 'admin_master') {
          if (!pathname.startsWith('/admin')) {
            router.replace('/admin');
          }
          setCanRender(true);
          setIsChecking(false);
          return;
        }

        // Se é user comum, não pode acessar /admin
        if (pathname.startsWith('/admin')) {
          if (profile?.global_role !== 'admin' && profile?.global_role !== 'admin_master') {
            router.replace('/app');
          }
          setCanRender(true);
          setIsChecking(false);
          return;
        }

        // Caso padrão - permitir acesso
        setCanRender(true);
        setIsChecking(false);
      } catch (error) {
        console.error('AuthGuard error:', error);
        setCanRender(true);
        setIsChecking(false);
      }
    };

    checkAuthAndRedirect();
  }, [pathname, router]);

  if (isChecking) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Verificando autenticação...</p>
        </div>
      </div>
    );
  }

  return canRender ? <>{children}</> : null;
}
