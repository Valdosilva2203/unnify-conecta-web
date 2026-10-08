'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { LogOut, Settings, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AppPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [companyData, setCompanyData] = useState<{
    legal_name: string;
    trade_name: string | null;
    cnpj: string;
    city: string;
    state: string;
  } | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient();

        // 1. Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          router.push('/login');
          return;
        }

        // 2. Check global_role
        const { data: profile } = await supabase
          .from('profiles')
          .select('global_role')
          .eq('id', user.id)
          .single();

        if (profile?.global_role === 'admin_master' || profile?.global_role === 'admin') {
          router.push('/admin');
          return;
        }

        // 3. Check for company
        const { data: company, error: companyError } = await supabase
          .from('companies')
          .select('legal_name, trade_name, cnpj, city, state')
          .eq('created_by', user.id)
          .maybeSingle();

        if (companyError || !company) {
          router.push('/onboarding');
          return;
        }

        setCompanyData(company);
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

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

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

  if (!authorized || !companyData) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center text-white font-bold">
              {(companyData.trade_name || companyData.legal_name)
                .split(' ')
                .slice(0, 2)
                .map((word: string) => word[0])
                .join('')
                .toUpperCase()}
            </div>
            <div>
              <h1 className="text-lg font-bold text-black">
                {companyData.trade_name || companyData.legal_name}
              </h1>
              <p className="text-sm text-gray-500">CNPJ {companyData.cnpj}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => router.push('/app/configuracoes')}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <Settings className="w-4 h-4" />
              Configurações
            </Button>
            <Button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl p-8 md:p-12 border border-gray-200 text-center">
          <Home className="w-16 h-16 text-orange-600 mx-auto mb-6" />

          <h2 className="text-3xl md:text-4xl font-black text-black mb-4">
            Bem-vindo ao Unnify Conecta!
          </h2>

          <p className="text-gray-600 text-lg mb-8 max-w-2xl mx-auto">
            Sua empresa foi cadastrada com sucesso. Este é seu painel principal onde você poderá gerenciar todos os dados e serviços da sua empresa.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
              <h3 className="font-bold text-black mb-2">📊 Dashboards</h3>
              <p className="text-sm text-gray-600">
                Visualize métricas e indicadores da sua empresa.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
              <h3 className="font-bold text-black mb-2">⚙️ Configurações</h3>
              <p className="text-sm text-gray-600">
                Gerencie informações e preferências da sua conta.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
              <h3 className="font-bold text-black mb-2">📞 Suporte</h3>
              <p className="text-sm text-gray-600">
                Entre em contato com nossa equipe de suporte.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
