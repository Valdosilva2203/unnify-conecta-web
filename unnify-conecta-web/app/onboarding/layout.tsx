'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const checkRole = async () => {
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

        const role = profile?.funcao_global;

        // Se admin_master → vai para /admin
        if (role === 'admin_master' || role === 'admin') {
          router.push('/admin');
          return;
        }

        // Se user → fica em /onboarding
      } catch (error) {
        // Silenciosamente falha - deixa renderizar
      }
    };

    checkRole();
  }, [router]);

  return <>{children}</>;
}
