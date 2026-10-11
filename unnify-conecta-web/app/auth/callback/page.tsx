'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const supabase = createClient();
        const code = new URL(window.location.href).searchParams.get('code');

        if (!code) {
          router.push('/login');
          return;
        }

        // Exchange code for session
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          console.error('Auth callback error:', error);
          router.push('/login?error=callback_failed');
          return;
        }

        // Email confirmed, redirect to onboarding
        router.push('/onboarding');
      } catch (error) {
        console.error('Callback error:', error);
        router.push('/login');
      }
    };

    handleCallback();
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Confirmando seu email...</p>
      </div>
    </div>
  );
}
