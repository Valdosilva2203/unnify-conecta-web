'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { StepsIndicator } from '@/components/onboarding/StepsIndicator';
import { SuccessCard } from '@/components/onboarding/SuccessCard';
import { Button } from '@/components/ui/button';

function OnboardingConclusaoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const tipoUsuario = searchParams.get('tipo_usuario') as 'empresa' | 'contador' | null;

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient();

        // 1. Verificar autenticação
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          router.push('/login');
          return;
        }

        // 2. Se tem tipo_usuario, atualizar no banco
        if (tipoUsuario && ['empresa', 'contador'].includes(tipoUsuario)) {
          try {
            const response = await fetch('/api/auth/update-tipo-usuario', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tipo_usuario: tipoUsuario }),
            });

            if (!response.ok) {
              console.error('Erro ao atualizar tipo_usuario');
            }
          } catch (error) {
            console.error('Erro ao chamar endpoint update-tipo-usuario:', error);
          }
        }

        // 3. Verificar se tem empresas vinculadas
        const { count } = await supabase
          .from('usuarios_empresas')
          .select('*', { count: 'exact', head: true })
          .eq('id_usuario', user.id);

        if (!count || count === 0) {
          router.push('/onboarding');
          return;
        }

        setAuthorized(true);
      } catch (error) {
        console.error('Auth check failed:', error);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [router, tipoUsuario]);

  const handleAccessPanel = () => {
    router.push('/app');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Finalizando cadastro...</p>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return null;
  }

  const steps = [
    { number: 1, title: 'Etapa 1', subtitle: 'Tipo de perfil', status: 'completed' as const },
    { number: 2, title: 'Etapa 2', subtitle: 'Dados da empresa', status: 'completed' as const },
    { number: 3, title: 'Etapa 3', subtitle: 'Conclusão', status: 'completed' as const },
  ];

  return (
    <div className="min-h-screen bg-white px-6 py-8 md:py-12">
      <div className="max-w-4xl mx-auto">
        <StepsIndicator steps={steps} />

        <div className="mb-12">
          <SuccessCard />
        </div>

        <div className="flex justify-center">
          <Button
            onClick={handleAccessPanel}
            className="bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold px-12 py-4 transition-all flex items-center justify-center gap-2 text-lg w-full md:w-auto"
          >
            Acessar meu painel →
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingConclusaoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center"><p>Carregando...</p></div>}>
      <OnboardingConclusaoContent />
    </Suspense>
  );
}
