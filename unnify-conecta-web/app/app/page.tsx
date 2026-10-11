'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import {
  Home, FileText, DollarSign, AlertCircle, Calendar, ShoppingCart, Box,
  Users, UserCheck, Receipt, BarChart3, Settings, Bell, Menu, X,
  TrendingUp, AlertOctagon, Clock
} from 'lucide-react';
import { MenuPerfilEmpresa } from '@/components/app/MenuPerfilEmpresa';

interface CompanyData {
  razao_social: string;
  nome_comercial: string | null;
  cnpj: string;
}

interface UserData {
  email: string;
  nome_completo?: string;
}

const menuItems = [
  { icon: Home, label: 'Início', href: '/app' },
  { icon: FileText, label: 'Meus documentos', href: '#' },
  { icon: DollarSign, label: 'Financeiro', href: '#' },
  { icon: AlertCircle, label: 'Obrigações', href: '#' },
  { icon: Calendar, label: 'Agenda', href: '#' },
  { icon: ShoppingCart, label: 'Compras', href: '#' },
  { icon: Box, label: 'Estoque', href: '#' },
  { icon: Users, label: 'Funcionários', href: '#' },
  { icon: UserCheck, label: 'Clientes', href: '#' },
  { icon: Receipt, label: 'Recibos', href: '#' },
  { icon: BarChart3, label: 'Relatórios', href: '#' },
  { icon: Settings, label: 'Minha conta', href: '#' },
];

const quickAccessItems = [
  { icon: FileText, label: 'Meus\nDocumentos', href: '#' },
  { icon: Receipt, label: 'Gerar\nRecibo', href: '#' },
  { icon: UserCheck, label: 'Clientes', href: '#' },
  { icon: Box, label: 'Estoque', href: '#' },
  { icon: Calendar, label: 'Agenda', href: '#' },
  { icon: BarChart3, label: 'Relatórios', href: '#' },
];

export default function AppPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          router.push('/login');
          return;
        }

        // Load real company data
        const { data: company } = await supabase
          .from('empresas')
          .select('razao_social, nome_comercial, cnpj')
          .eq('criado_por', user.id)
          .maybeSingle();

        // Load user profile
        const { data: profile } = await supabase
          .from('perfis')
          .select('nome_completo, tipo_usuario')
          .eq('id_usuario', user.id)
          .maybeSingle();

        // Se tipo_usuario é contador, redireciona para página dele
        if (profile?.tipo_usuario === 'contador') {
          router.push('/contador');
          return;
        }

        if (!company) {
          router.push('/onboarding');
          return;
        }

        setCompanyData(company);
        setUserData({
          email: user.email || '',
          nome_completo: profile?.nome_completo || user.email?.split('@')[0] || 'Usuário',
        });
        setAuthorized(true);
      } catch (error) {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setSidebarOpen(false);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [sidebarOpen]);


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

  if (!authorized || !companyData || !userData) {
    return null;
  }

  const firstName = userData.nome_completo?.split(' ')[0] || 'Usuário';
  const menuNavegacao = (
    <nav aria-label="Menu principal" className="flex-1 overflow-y-auto py-4">
      {menuItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.href === '/app';
        const emBreve = item.href === '#';
        return (
          <button
            type="button"
            key={item.label}
            disabled={emBreve}
            onClick={() => {
              setSidebarOpen(false);
              router.push(item.href);
            }}
            aria-current={isActive ? 'page' : undefined}
            className={`w-full min-h-11 flex items-center gap-3 px-6 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500 disabled:cursor-default ${
              isActive
                ? 'bg-orange-50 text-orange-600 border-l-4 border-orange-600'
                : emBreve
                  ? 'text-gray-400'
                  : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Icon className="w-5 h-5" aria-hidden="true" />
            <span className="flex-1 text-left">{item.label}</span>
            {emBreve && <span className="text-[10px] font-semibold uppercase tracking-wide">Em breve</span>}
          </button>
        );
      })}
    </nav>
  );
  const initials = (companyData.nome_comercial || companyData.razao_social)
    .split(' ')
    .slice(0, 2)
    .map((word: string) => word[0])
    .join('')
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex sticky top-0 h-screen w-56 shrink-0 bg-white border-r border-gray-200 flex-col">
        <div className="p-6 border-b border-gray-200">
          <Image src="/brand/unnify-logo.png" alt="Unnify Conecta" width={150} height={50} priority className="h-8 w-auto" />
        </div>
        {menuNavegacao}
      </aside>

      {/* Sidebar — celular e tablet (gaveta) */}
      <div className={`lg:hidden fixed inset-0 z-50 ${sidebarOpen ? '' : 'pointer-events-none'}`} aria-hidden={!sidebarOpen}>
        <div
          className={`absolute inset-0 bg-gray-900/40 transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setSidebarOpen(false)}
        />
        <aside
          id="menu-empresa"
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação"
          inert={!sidebarOpen}
          className={`absolute inset-y-0 left-0 w-[85%] max-w-xs bg-white shadow-xl flex flex-col transition-transform duration-200 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <Image src="/brand/unnify-logo.png" alt="Unnify Conecta" width={150} height={50} className="h-8 w-auto" />
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Fechar menu"
              className="w-11 h-11 inline-flex items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          {menuNavegacao}
        </aside>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-40 bg-white border-b border-gray-200 pt-[env(safe-area-inset-top)]">
          <div className="flex items-center justify-between gap-2 px-3 sm:px-6 py-2.5">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
              aria-controls="menu-empresa"
              aria-expanded={sidebarOpen}
              className="lg:hidden w-11 h-11 inline-flex items-center justify-center hover:bg-gray-100 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="hidden lg:block" />

            <div className="flex items-center gap-1 sm:gap-3 min-w-0">
              <button
                type="button"
                aria-label="Notificações"
                className="w-11 h-11 inline-flex items-center justify-center hover:bg-gray-100 rounded-lg relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                <Bell className="w-5 h-5 text-gray-600" />
                <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full" aria-hidden="true" />
              </button>

              <MenuPerfilEmpresa
                nomeUsuario={userData.nome_completo || 'Usuário'}
                email={userData.email}
                nomeEmpresa={companyData.nome_comercial || companyData.razao_social}
                iniciais={initials}
              />
            </div>
          </div>
        </header>
        {/* Scroll Content */}
        <main className="flex-1 min-w-0">
          <div className="px-4 py-5 sm:p-6 lg:p-8 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {/* Greeting */}
            <div className="mb-8">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-black mb-2">
                Olá, {firstName}!
              </h1>
              <p className="text-gray-600">
                Aqui está um resumo da sua empresa hoje.
              </p>
              <p className="text-sm text-gray-500 mt-2">
                {new Date().toLocaleDateString('pt-BR', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>

            {/* Financial Indicators */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-6 mb-8">
              {[
                { icon: TrendingUp, title: 'Receitas', amount: 'R$ 0,00', color: 'text-green-600', bgColor: 'bg-green-50' },
                { icon: AlertOctagon, title: 'Despesas', amount: 'R$ 0,00', color: 'text-red-600', bgColor: 'bg-red-50' },
                { icon: Clock, title: 'A receber', amount: 'R$ 0,00', color: 'text-orange-600', bgColor: 'bg-orange-50' },
                { icon: Receipt, title: 'A pagar', amount: 'R$ 0,00', color: 'text-blue-600', bgColor: 'bg-blue-50' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="bg-white rounded-lg p-6 border border-gray-200">
                    <div className={`w-12 h-12 ${item.bgColor} rounded-lg flex items-center justify-center mb-4`}>
                      <Icon className={`w-6 h-6 ${item.color}`} />
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{item.title}</p>
                    <p className="text-2xl font-bold text-black">{item.amount}</p>
                  </div>
                );
              })}
            </div>

            {/* Visão Financeira */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <div className="lg:col-span-2 bg-white rounded-lg p-6 border border-gray-200">
                <h2 className="text-lg font-bold text-black mb-4">Visão financeira</h2>
                <div className="h-48 flex items-center justify-center bg-gray-50 rounded-lg">
                  <p className="text-gray-500">Nenhum dado financeiro disponível</p>
                </div>
              </div>

              {/* Próximas Obrigações */}
              <div className="bg-white rounded-lg p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-black">Próximas obrigações</h2>
                  <button className="min-h-11 px-2 -mr-2 text-orange-600 text-sm font-semibold hover:underline rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
                    Ver todas →
                  </button>
                </div>
                <div className="space-y-3">
                  <p className="text-gray-500 text-sm text-center py-4">Nenhuma obrigação pendente</p>
                </div>
              </div>
            </div>

            {/* Quick Access & Documents */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* Acessos Rápidos */}
              <div className="lg:col-span-2 bg-white rounded-lg p-6 border border-gray-200">
                <h2 className="text-lg font-bold text-black mb-6">Acessos rápidos</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {quickAccessItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.label}
                        onClick={() => item.href !== '#' && router.push(item.href)}
                        className="flex flex-col items-center justify-center p-4 sm:p-6 min-h-24 hover:bg-gray-50 rounded-lg border border-gray-200 hover:border-orange-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                      >
                        <Icon className="w-8 h-8 text-orange-600 mb-3" />
                        <span className="text-xs text-center font-semibold text-gray-900">
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Documentos Recentes */}
              <div className="bg-white rounded-lg p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-black">Documentos recentes</h2>
                  <button className="min-h-11 px-2 -mr-2 text-orange-600 text-sm font-semibold hover:underline rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
                    Ver todos →
                  </button>
                </div>
                <p className="text-gray-500 text-sm text-center py-6">Nenhum documento disponível</p>
              </div>
            </div>

            {/* Mensagens e Avisos */}
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-black">Mensagens e avisos</h2>
                <button className="min-h-11 px-2 -mr-2 text-orange-600 text-sm font-semibold hover:underline rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
                  Ver todos →
                </button>
              </div>
              <p className="text-gray-500 text-sm text-center py-6">Nenhuma mensagem no momento</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
