'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AppLayout({ children }: { children: React.ReactNode }) {
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

        // Query role from database with small delay to ensure session is available
        await new Promise(r => setTimeout(r, 100));

        const { data: profile, error } = await supabase
          .from('perfis')
          .select('global_role')
          .eq('id_usuario', user.id)
          .single();

        if (error || !profile) {
          // Profile not found - user not properly set up, redirect to onboarding
          router.push('/onboarding');
          return;
        }

        const role = profile.global_role;

        // Redirect based on role
        if (role === 'admin_master' || role === 'admin') {
          router.push('/admin');
          return;
        }

        if (role === 'user') {
          // Check if user has company access
          const { data: company } = await supabase
            .from('empresas')
            .select('id')
            .eq('criado_por', user.id)
            .maybeSingle();

          if (!company) {
            router.push('/onboarding');
            return;
          }
          // Allow access to /app for empresario
        } else {
          // Unknown role - send to onboarding
          router.push('/onboarding');
          return;
        }
      } catch (error) {
        // On error, redirect to login to force re-authentication
        router.push('/login');
      }
    };

    checkRoleAndRedirect();
  }, [router]);

  return <>{children}</>;
}
