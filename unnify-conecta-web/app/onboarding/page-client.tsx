'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Calculator } from 'lucide-react';
import { OnboardingHeader } from '@/components/OnboardingHeader';
import { OnboardingCard } from '@/components/OnboardingCard';
import { createClient } from '@/lib/supabase/client';

export function OnboardingPageClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleContinueAsEmpresa = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      router.push('/onboarding/empresa');
    } catch (error) {
      console.error('Error:', error);
      alert('Erro ao continuar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleContinueAsContador = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      router.push('/onboarding/contador');
    } catch (error) {
      console.error('Error:', error);
      alert('Erro ao continuar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white py-12 px-6 md:py-16">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <OnboardingHeader />

        {/* Cards Grid */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-12">
          {/* Empresa Card */}
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

          {/* Contador Card */}
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

        {/* Footer */}
        <div className="text-center max-w-2xl mx-auto text-sm text-gray-600 space-y-2">
          <p>
            🔒 Proteção de dados integrada à arquitetura do Unnify Conecta.
          </p>
          <p>
            Você poderá participar de outras empresas ou escritórios posteriormente conforme suas permissões.
          </p>
        </div>
      </div>
    </div>
  );
}
