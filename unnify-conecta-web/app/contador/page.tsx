'use client';

import { useEffect, useState } from 'react';
import { Users, FileText, CheckSquare, DollarSign, Calendar, BarChart3 } from 'lucide-react';
import { WelcomeBanner } from '@/components/contador/WelcomeBanner';
import { MetricCard } from '@/components/contador/MetricCard';
import { QuickAccessCard } from '@/components/contador/QuickAccessCard';
import { useContadorAtual } from '@/components/contador/LayoutContador';

export default function ContadorPage() {
  const contador = useContadorAtual();
  const [hoje, setHoje] = useState('');

  useEffect(() => {
    setHoje(new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
  }, []);

  if (!contador) return null;

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <p className="text-sm text-gray-600 mb-2">Bem-vindo(a) de volta,</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-black">Painel do Contador</h1>
          <div className="flex items-center gap-2 text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm">
              {hoje}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-6">
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
    </>
  );
}
