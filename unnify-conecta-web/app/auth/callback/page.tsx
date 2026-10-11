'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    // Tokens are single-use; a second run (React Strict Mode) would fail and redirect to an error
    if (started.current) return;
    started.current = true;

    const handleCallback = async () => {
      try {
        const supabase = createClient();
        const params = new URL(window.location.href).searchParams;
        const code = params.get('code');
        const tokenHash = params.get('token_hash');

        let error;
        if (tokenHash) {
          ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' }));
        } else if (code) {
          ({ error } = await supabase.auth.exchangeCodeForSession(code));
        } else {
          router.push('/login');
          return;
        }

        if (error) {
          console.error('Auth callback error:', error);
          router.push('/login?error=link_invalido');
          return;
        }

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
