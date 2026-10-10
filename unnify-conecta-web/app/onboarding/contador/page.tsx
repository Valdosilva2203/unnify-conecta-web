'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { StepsIndicator } from '@/components/onboarding/StepsIndicator';
import { CountadorOnboardingForm } from '@/components/onboarding/CountadorOnboardingForm';

export default function OnboardingContadorPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient();

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          router.push('/login');
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('perfis')
          .select('global_role')
          .eq('id_usuario', user.id)
          .single();

        if (profileError || !profile) {
          router.push('/login');
          return;
        }

        const role = profile.global_role;

        if (role === 'admin_master' || role === 'admin') {
          router.push('/admin');
          return;
        }

        if (role === 'user') {
          const { data: membership } = await supabase
            .from('membros_escritorio')
            .select('id')
            .eq('id_usuario', user.id)
            .maybeSingle();

          if (membership) {
            router.push('/contador');
            return;
          }

          setAuthorized(true);
          setLoading(false);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        router.push('/login');
      }
    };

    checkAuth();
  }, [router]);

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
    { number: 2, title: 'Etapa 2', subtitle: 'Dados do escritório', status: 'active' as const },
    { number: 3, title: 'Etapa 3', subtitle: 'Conclusão', status: 'pending' as const },
  ];

  return (
    <div className="min-h-screen bg-white px-6 py-8 md:py-12">
      <div className="max-w-4xl mx-auto">
        {/* Steps Indicator */}
        <StepsIndicator steps={steps} />

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-black text-black mb-3">
            Conte-nos sobre seu escritório
          </h1>
          <p className="text-base md:text-lg text-gray-600">
            Essas informações serão usadas para configurar seu ambiente no Unnify Conecta.
          </p>
        </div>

        {/* Form */}
        <div className="flex justify-center">
          <CountadorOnboardingForm />
        </div>
      </div>
    </div>
  );
}
