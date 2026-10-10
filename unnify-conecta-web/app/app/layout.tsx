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

        // Query role from database
        const { data: profile, error } = await supabase
          .from('perfis')
          .select('funcao_global')
          .eq('id_usuario', user.id)
          .single();

        // Handle query errors separately from no-profile
        if (error) {
          // If error is "not found", profile doesn't exist yet - send to onboarding
          if (error.code === 'PGRST116') {
            router.push('/onboarding');
          } else {
            // Other errors (network, timeout, etc) - redirect to login to retry
            router.push('/login');
          }
          return;
        }

        if (!profile) {
          router.push('/onboarding');
          return;
        }

        const role = profile.funcao_global;

        // DIAGNOSTIC: Log role value for debugging
        if (typeof window !== 'undefined') {
          console.log(`[AUTH DEBUG] user_id: ${user.id}, global_role: "${role}"`);
        }

        // Redirect based on role - admin goes to admin panel
        if (role === 'admin_master' || role === 'admin') {
          router.push('/admin');
          return;
        }

        // Regular users with company access stay on /app
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
          // Allow access to /app for users with company
        } else {
          // Unknown role - send to onboarding
          router.push('/onboarding');
          return;
        }
      } catch (error) {
        // Unexpected errors - redirect to login
        router.push('/login');
      }
    };

    checkRoleAndRedirect();
  }, [router]);

  return <>{children}</>;
}
