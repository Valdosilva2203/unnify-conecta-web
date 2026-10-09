'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Calculator } from 'lucide-react';
import { OnboardingHeader } from '@/components/OnboardingHeader';
import { OnboardingCard } from '@/components/OnboardingCard';
import { createClient } from '@/lib/supabase/client';

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [canRender, setCanRender] = useState(false);

  useEffect(() => {
    const checkRole = async () => {
      try {
        const supabase = createClient();

        // Get user session
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user?.id) {
          router.replace('/login');
          return;
        }

        // Query profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('global_role')
          .eq('user_id', session.user.id)
          .single();

        console.log('Onboarding check:', { user_id: session.user.id, role: profile?.global_role });

        // Redirect admin_master and admin
        if (profile?.global_role === 'admin_master' || profile?.global_role === 'admin') {
          router.replace('/admin');
          return;
        }

        // Allow others to see onboarding
        setCanRender(true);
      } catch (error) {
        console.error('Check role error:', error);
        setCanRender(true); // Allow render on error
      } finally {
        setIsChecking(false);
      }
    };

    checkRole();
  }, [router]);

  if (isChecking) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Verificando autenticação...</p>
        </div>
      </div>
    );
  }

  if (!canRender) {
    return null;
  }

  const handleContinueAsEmpresa = async () => {
    setLoading(true);
    try {
      router.push('/onboarding/empresa');
    } finally {
      setLoading(false);
    }
  };

  const handleContinueAsContador = async () => {
    setLoading(true);
    try {
      router.push('/onboarding/contador');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white py-12 px-6 md:py-16">
      <div className="max-w-6xl mx-auto">
        <OnboardingHeader />

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-12">
          <OnboardingCard
            icon={<Building2 className="w-6 h-6 text-orange-600" />}
            title="Tenho uma empresa"
            description="Quero organizar minhas finanças e trabalhar conectado ao meu contador."
            buttonLabel="Continuar como empresa"
            buttonOnClick={handleContinueAsEmpresa}
            imageSrc="/images/empresario.png"
            imageAlt="Empresário com laptop"
            isLoading={loading}
          />

          <OnboardingCard
            icon={<Calculator className="w-6 h-6 text-orange-600" />}
            title="Sou contador"
            description="Quero gerenciar meus clientes e conectar minhas empresas ao Unnify Conecta."
            buttonLabel="Continuar como contador"
            buttonOnClick={handleContinueAsContador}
            imageSrc="/images/empresario.png"
            imageAlt="Profissional contábil"
            isLoading={loading}
          />
        </div>

        <div className="text-center max-w-2xl mx-auto text-sm text-gray-600 space-y-2">
          <p>🔒 Proteção de dados integrada à arquitetura do Unnify Conecta.</p>
          <p>Você poderá participar de outras empresas ou escritórios posteriormente conforme suas permissões.</p>
        </div>
      </div>
    </div>
  );
}
