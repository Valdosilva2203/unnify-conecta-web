'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Calendar, Box, UserCheck, Receipt, BarChart3, TrendingUp, AlertOctagon, Clock } from 'lucide-react';
import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';

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
  const { usuario } = useEmpresaAtual();
  const [hoje, setHoje] = useState('');

  useEffect(() => {
    setHoje(new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
  }, []);

  if (!usuario) return null;
  const firstName = usuario.nome.split(' ')[0] || 'Usuário';

  return (
    <>
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-black mb-2">
          Olá, {firstName}!
        </h1>
        <p className="text-gray-600">
          Aqui está um resumo da sua empresa hoje.
        </p>
        <p className="text-sm text-gray-500 mt-2">
          {hoje}
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
    </>
  );
}