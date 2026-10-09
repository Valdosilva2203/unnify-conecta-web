'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    const checkAndRedirect = async () => {
      try {
        const supabase = createClient();

        // Get current session
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user?.id) {
          router.push('/login');
          return;
        }

        // Query profile directly with RLS (user can see own profile)
        const { data: profile } = await supabase
          .from('profiles')
          .select('global_role')
          .eq('user_id', session.user.id)
          .single();

        // If admin_master, redirect immediately
        if (profile?.global_role === 'admin_master') {
          router.replace('/admin');
          return;
        }
      } catch (error) {
        console.error('Layout check error:', error);
      }
    };

    checkAndRedirect();
  }, [router]);

  return <>{children}</>;
}
