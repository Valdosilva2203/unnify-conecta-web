'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuthorization = async () => {
      try {
        console.log('Starting admin authorization check...');
        const supabase = createClient();

        // Get session from getSession (more reliable than getUser)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        console.log('Session check:', {
          hasSession: !!session,
          userId: session?.user?.id,
          error: sessionError
        });

        if (sessionError || !session?.user?.id) {
          console.log('No session, redirecting to login');
          setLoading(false);
          router.push('/login');
          return;
        }

        const userId = session.user.id;

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('global_role')
          .eq('user_id', userId)
          .single();

        console.log('Profile query result:', {
          userId,
          profile,
          error: profileError
        });

        if (profileError || !profile) {
          console.log('No profile found, redirecting to login');
          setLoading(false);
          router.push('/login');
          return;
        }

        if (profile.global_role === 'admin_master' || profile.global_role === 'admin') {
          console.log('User is authorized as:', profile.global_role);
          setAuthorized(true);
          setLoading(false);
        } else {
          console.log('User is not admin, redirecting to onboarding. Role:', profile.global_role);
          setLoading(false);
          router.push('/onboarding');
        }
      } catch (error) {
        console.error('Authorization check error:', error);
        setLoading(false);
        router.push('/login');
      }
    };

    checkAuthorization();
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Verificando autorização...</p>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return null;
  }

  return <>{children}</>;
}
