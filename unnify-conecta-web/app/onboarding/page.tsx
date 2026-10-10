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
  const [userEmail, setUserEmail] = useState<string>('');

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

        // Store user email
        if (session.user.email) {
          setUserEmail(session.user.email);
        }

        const { data: { session: authSession } } = await supabase.auth.getSession();
        const token = authSession?.access_token;

        if (!token) {
          router.replace('/login');
          return;
        }

        const roleResponse = await fetch('/api/admin/check-role', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!roleResponse.ok) {
          if (roleResponse.status === 401) {
            router.replace('/login');
          }
          return;
        }

        const roleData = await roleResponse.json();

        // Redirect admin_master and admin
        if (roleData.funcao_global === 'admin_master' || roleData.funcao_global === 'admin') {
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
        {/* User info */}
        <div className="mb-8 p-4 bg-orange-50 rounded-lg border border-orange-200">
          <p className="text-sm text-gray-600">
            Logado como: <span className="font-semibold text-orange-600">{userEmail}</span>
          </p>
        </div>

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
