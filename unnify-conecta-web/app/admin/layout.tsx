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

        // Get session from getSession (more reliable than getUser)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session?.user?.id) {
          setLoading(false);
          router.push('/login');
          return;
        }

        const userId = session.user.id;

        // Use API endpoint to check role (uses service role to bypass RLS)
        const roleResponse = await fetch('/api/admin/check-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });

        const roleData = await roleResponse.json();

        if (roleData.status !== 'ok' || !roleData.global_role) {
          setLoading(false);
          router.push('/login');
          return;
        }

        if (roleData.global_role === 'admin_master' || roleData.global_role === 'admin') {
          setAuthorized(true);
          setLoading(false);
        } else {
          setLoading(false);
          router.push('/onboarding');
        }
      } catch (error) {
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
