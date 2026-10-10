'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import {
  Home, FileText, DollarSign, AlertCircle, Calendar, ShoppingCart, Box,
  Users, UserCheck, Receipt, BarChart3, Settings, LogOut, Bell, Menu, X,
  TrendingUp, AlertOctagon, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';

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

        // 1. Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          router.push('/login');
          return;
        }

        // 2. Get profile data
        const { data: profile } = await supabase
          .from('perfis')
          .select('funcao_global, nome_completo')
          .eq('id_usuario', user.id)
          .single();

        if (profile?.funcao_global === 'admin_master' || profile?.funcao_global === 'admin') {
          router.push('/admin');
          return;
        }

        // 3. Check for company
        const { data: company, error: companyError } = await supabase
          .from('empresas')
          .select('razao_social, nome_comercial, cnpj')
          .eq('criado_por', user.id)
          .maybeSingle();

        if (companyError || !company) {
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

  if (!authorized || !companyData || !userData) {
    return null;
  }

  const firstName = userData.nome_completo?.split(' ')[0] || 'Usuário';
  const initials = (companyData.nome_comercial || companyData.razao_social)
    .split(' ')
    .slice(0, 2)
    .map((word: string) => word[0])
    .join('')
    .toUpperCase();

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } md:translate-x-0 fixed md:relative z-40 w-56 h-screen bg-white border-r border-gray-200 transition-transform duration-200 flex flex-col`}>
        {/* Logo */}
        <div className="p-6 border-b border-gray-200">
          <Image
            src="/brand/unnify-logo.png"
            alt="Unnify Conecta"
            width={150}
            height={50}
            priority
            className="h-8 w-auto"
          />
        </div>

        {/* Menu Items */}
        <nav className="flex-1 overflow-y-auto py-4">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === '/app';
            return (
              <button
                key={item.label}
                onClick={() => item.href !== '#' && router.push(item.href)}
                className={`w-full flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-orange-50 text-orange-600 border-l-4 border-orange-600'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="bg-white border-b border-gray-200">
          <div className="flex items-center justify-between px-6 py-4">
            {/* Left */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="md:hidden p-2 hover:bg-gray-100 rounded-lg"
              >
                {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>

            {/* Right */}
            <div className="flex items-center gap-4">
              <button className="p-2 hover:bg-gray-100 rounded-lg relative">
                <Bell className="w-5 h-5 text-gray-600" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              </button>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">{userData.nome_completo}</p>
                  <p className="text-xs text-gray-500">{companyData.nome_comercial || companyData.razao_social}</p>
                </div>
                <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                  {initials}
                </div>

                {/* Profile Menu */}
                <button
                  onClick={handleLogout}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                  title="Sair"
                >
                  <LogOut className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Scroll Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 md:p-8">
            {/* Greeting */}
            <div className="mb-8">
              <h1 className="text-3xl md:text-4xl font-black text-black mb-2">
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
                  <button className="text-orange-600 text-sm font-semibold hover:underline">
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
                        className="flex flex-col items-center justify-center p-6 hover:bg-gray-50 rounded-lg border border-gray-200 hover:border-orange-200 transition-colors"
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
                  <button className="text-orange-600 text-sm font-semibold hover:underline">
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
                <button className="text-orange-600 text-sm font-semibold hover:underline">
                  Ver todos →
                </button>
              </div>
              <p className="text-gray-500 text-sm text-center py-6">Nenhuma mensagem no momento</p>
            </div>
          </div>
        </main>
      </div>

      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 md:hidden z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
