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
        const supabase = createClient();

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        console.log('Admin check - User:', { user: user?.id, email: user?.email, error: authError });

        if (authError || !user) {
          console.log('No user, redirecting to login');
          router.push('/login');
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('global_role')
          .eq('user_id', user.id)
          .single();

        console.log('Admin check - Profile:', { profile, error: profileError });

        if (profileError || !profile) {
          console.log('Profile error or not found, redirecting to login');
          router.push('/login');
          return;
        }

        const role = profile.global_role;

        console.log('Admin check - Role:', role);

        if (role === 'admin_master' || role === 'admin') {
          setAuthorized(true);
          setLoading(false);
        } else {
          console.log('Not authorized, redirecting to onboarding');
          router.push('/onboarding');
        }
      } catch (error) {
        console.error('Admin authorization check failed:', error);
        setLoading(false);
        router.push('/login');
      }
    };

    // Add timeout to prevent infinite loading
    const timer = setTimeout(() => {
      console.error('Admin auth check timeout');
      setLoading(false);
      router.push('/login');
    }, 5000);

    checkAuthorization();

    return () => clearTimeout(timer);
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
