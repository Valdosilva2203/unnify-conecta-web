'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { StepsIndicator } from '@/components/onboarding/StepsIndicator';
import { SuccessCard } from '@/components/onboarding/SuccessCard';
import { Button } from '@/components/ui/button';

export default function OnboardingConclusivelPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

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

        // 2. Verificar global_role
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('global_role')
          .eq('id', user.id)
          .single();

        if (profileError || !profile) {
          router.push('/login');
          return;
        }

        // 3. Admin vai para /admin
        if (profile.global_role === 'admin_master' || profile.global_role === 'admin') {
          router.push('/admin');
          return;
        }

        // 4. Verificar se tem empresa ou escritório contábil
        const { data: membership, error: membershipError } = await supabase
          .from('user_accounting_office_memberships')
          .select('id, role')
          .eq('user_id', user.id)
          .maybeSingle();

        const { data: company, error: companyError } = await supabase
          .from('companies')
          .select('id')
          .eq('created_by', user.id)
          .maybeSingle();

        if ((membershipError || !membership) && (companyError || !company)) {
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
  }, [router]);

  const handleAccessPanel = () => {
    router.push('/contador');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Verificando autorização...</p>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return null;
  }

  const steps = [
    { number: 1, title: 'Etapa 1', subtitle: 'Tipo de perfil', status: 'completed' as const },
    { number: 2, title: 'Etapa 2', subtitle: 'Dados do escritório', status: 'completed' as const },
    { number: 3, title: 'Etapa 3', subtitle: 'Conclusão', status: 'completed' as const },
  ];

  return (
    <div className="min-h-screen bg-white px-6 py-8 md:py-12">
      <div className="max-w-4xl mx-auto">
        {/* Steps Indicator - All Completed */}
        <StepsIndicator steps={steps} />

        {/* Success Content */}
        <div className="mb-12">
          <SuccessCard />
        </div>

        {/* CTA Button */}
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
