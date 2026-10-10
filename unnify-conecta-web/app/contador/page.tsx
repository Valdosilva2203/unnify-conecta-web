'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Users, FileText, CheckSquare, DollarSign, Calendar, BarChart3, Briefcase, Mail } from 'lucide-react';
import { AccountantSidebar } from '@/components/contador/AccountantSidebar';
import { AccountantTopbar } from '@/components/contador/AccountantTopbar';
import { WelcomeBanner } from '@/components/contador/WelcomeBanner';
import { MetricCard } from '@/components/contador/MetricCard';
import { QuickAccessCard } from '@/components/contador/QuickAccessCard';

export default function ContadorPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [officeData, setOfficeData] = useState<{ name: string; initials: string } | null>(null);

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
        const { data: profile } = await supabase
          .from('perfis')
          .select('global_role')
          .eq('id_usuario', user.id)
          .single();

        if (profile?.global_role === 'admin_master' || profile?.global_role === 'admin') {
          router.push('/admin');
          return;
        }

        // 3. Verificar membership (contador) ou company (empresa)
        const { data: membership } = await supabase
          .from('membros_escritorio')
          .select('id_escritorio')
          .eq('id_usuario', user.id)
          .maybeSingle();

        let businessName: string | null = null;

        if (membership) {
          // 4. Obter dados do escritório (contador)
          const { data: office } = await supabase
            .from('escritorios_contabeis')
            .select('nome_comercial, razao_social')
            .eq('id', membership.id_escritorio)
            .single();

          if (office) {
            businessName = office.nome_comercial || office.razao_social;
          }
        } else {
          // 4. Obter dados da empresa (empresa)
          const { data: company } = await supabase
            .from('empresas')
            .select('nome_comercial, razao_social')
            .eq('criado_por', user.id)
            .maybeSingle();

          if (company) {
            businessName = company.nome_comercial || company.razao_social;
          } else {
            router.push('/onboarding');
            return;
          }
        }

        if (businessName) {
          const initials = businessName
            .split(' ')
            .slice(0, 2)
            .map((word: string) => word[0])
            .join('')
            .toUpperCase();

          setOfficeData({ name: businessName, initials });
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

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!authorized || !officeData) {
    return null;
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <AccountantSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <AccountantTopbar
          officeInitials={officeData.initials}
          officeName={officeData.name}
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
        />

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <p className="text-sm text-gray-600 mb-2">Bem-vindo(a) de volta,</p>
              <div className="flex items-center justify-between">
                <h1 className="text-3xl md:text-4xl font-black text-black">Painel do Contador</h1>
                <div className="flex items-center gap-2 text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm">
                    {new Date().toLocaleDateString('pt-BR', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              </div>
              <p className="text-gray-600 mt-2">Aqui você acompanha as principais informações do seu escritório.</p>
            </div>

            {/* Welcome Banner */}
            <div className="mb-8">
              <WelcomeBanner />
            </div>

            {/* Metrics */}
            <div className="mb-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard icon={Users} label="Clientes" value={0} iconColor="blue" />
                <MetricCard icon={FileText} label="Documentos" value={0} iconColor="green" />
                <MetricCard icon={CheckSquare} label="Obrigações" value={0} iconColor="orange" />
                <MetricCard icon={DollarSign} label="Receitas" value={0} iconColor="purple" />
              </div>
            </div>

            {/* Quick Access */}
            <div>
              <h2 className="text-xl font-bold text-black mb-2">Acesso rápido</h2>
              <p className="text-gray-600 mb-6">Principais funcionalidades do sistema.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <QuickAccessCard icon={Users} label="Clientes" status="Em breve" iconColor="blue" />
                <QuickAccessCard icon={FileText} label="Documentos" status="Em breve" iconColor="green" />
                <QuickAccessCard icon={Calendar} label="Agenda" status="Em breve" iconColor="pink" />
                <QuickAccessCard icon={CheckSquare} label="Obrigações" status="Em breve" iconColor="purple" />
                <QuickAccessCard icon={DollarSign} label="Financeiro" status="Em breve" iconColor="yellow" />
                <QuickAccessCard icon={BarChart3} label="Relatórios" status="Em breve" iconColor="pink" />
              </div>
            </div>
          </div>

          {/* Footer Spacing */}
          <div className="h-8" />
        </main>
      </div>
    </div>
  );
}
