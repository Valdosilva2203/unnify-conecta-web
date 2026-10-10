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

        const token = session.access_token;

        if (!token) {
          setLoading(false);
          router.push('/login');
          return;
        }

        // Use API endpoint to check role with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
          const roleResponse = await fetch('/api/auth/check-role', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!roleResponse.ok) {
            setLoading(false);
            router.push('/login');
            return;
          }

          const roleData = await roleResponse.json();

          if (!roleData.role) {
            setLoading(false);
            router.push('/login');
            return;
          }

          if (roleData.role === 'admin_master' || roleData.role === 'admin') {
            setAuthorized(true);
            setLoading(false);
          } else {
            setLoading(false);
            router.push('/onboarding');
          }
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            // Timeout - retry logic
            setLoading(false);
            router.push('/login');
          } else {
            setLoading(false);
            router.push('/login');
          }
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
