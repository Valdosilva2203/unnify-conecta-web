'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function OnboardingEmpresaPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          router.push('/login');
          return;
        }

        setIsAuthenticated(true);
      } catch (error) {
        console.error('Auth check failed:', error);
        router.push('/login');
      } finally {
        setCheckingAuth(false);
      }
    };

    checkAuth();
  }, [router]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Verificando autenticação...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <h1 className="text-4xl font-black text-black mb-4">Etapa 2 de 3</h1>
        <p className="text-gray-600 mb-8">
          Cadastro de dados da empresa. Esta página será implementada em breve.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 bg-white border border-gray-300 text-gray-900 hover:bg-gray-50 rounded-lg font-semibold px-6 py-3 transition-all"
          >
            ← Voltar
          </Link>
          <button
            disabled
            className="inline-flex items-center gap-2 bg-orange-600 text-white rounded-lg font-semibold px-6 py-3 opacity-50 cursor-not-allowed"
          >
            Continuar →
          </button>
        </div>
      </div>
    </div>
  );
}
