'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const checkRoleAndRedirect = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          router.push('/login');
          return;
        }

        const { data: profile } = await supabase
          .from('perfis')
          .select('funcao_global')
          .eq('id_usuario', user.id)
          .single();

        if (!profile) {
          return;
        }

        const role = profile.funcao_global;

        // Admin master deve estar em /admin, não em /onboarding
        if (role === 'admin_master' || role === 'admin') {
          router.push('/admin');
          return;
        }
      } catch (error) {
        // Silenciosamente falha - deixa onboarding renderizar
      }
    };

    checkRoleAndRedirect();
  }, [router]);

  return <>{children}</>;
}
