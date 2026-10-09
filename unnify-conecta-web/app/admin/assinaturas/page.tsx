'use client';

import { useState } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';

interface Assinatura {
  id: string;
  nomeFantasia: string;
  razaoSocial: string;
  cnpj: string;
  plano: 'Básico' | 'Pro' | 'Premium';
  valor: number;
  dataInicio: string;
  proximaCobranca: string;
  status: 'ativa' | 'pendente' | 'cancelada';
  dataAcao: string;
}

const assinaturasFicticias: Assinatura[] = [
  {
    id: '1',
    nomeFantasia: 'Comercial Ferreira',
    razaoSocial: 'Comercial Ferreira LTDA',
    cnpj: '12.345.678/0001-90',
    plano: 'Básico',
    valor: 49.90,
    dataInicio: '10/01/2026',
    proximaCobranca: '10/11/2026',
    status: 'ativa',
    dataAcao: '10/01/2026 às 23:41',
  },
  {
    id: '2',
    nomeFantasia: 'Top Serviços',
    razaoSocial: 'Top Serviços e Soluções LTDA',
    cnpj: '33.444.555/0001-66',
    plano: 'Pro',
    valor: 99.90,
    dataInicio: '05/02/2026',
    proximaCobranca: '05/11/2026',
    status: 'ativa',
    dataAcao: '05/02/2026 às 14:20',
  },
  {
    id: '3',
    nomeFantasia: 'Mercado Almeida',
    razaoSocial: 'Mercado Almeida LTDA',
    cnpj: '22.333.444/0001-55',
    plano: 'Pro',
    valor: 99.90,
    dataInicio: '12/02/2026',
    proximaCobranca: '12/11/2026',
    status: 'pendente',
    dataAcao: '12/02/2026 às 10:15',
  },
  {
    id: '4',
    nomeFantasia: 'Farmácia Central',
    razaoSocial: 'Farmácia Central LTDA',
    cnpj: '55.666.777/0001-88',
    plano: 'Premium',
    valor: 149.90,
    dataInicio: '20/01/2026',
    proximaCobranca: '20/11/2026',
    status: 'ativa',
    dataAcao: '20/01/2026 às 09:30',
  },
  {
    id: '5',
    nomeFantasia: 'Barbearia Reis',
    razaoSocial: 'Barbearia Reis LTDA',
    cnpj: '77.888.999/0001-00',
    plano: 'Básico',
    valor: 49.90,
    dataInicio: '18/03/2026',
    proximaCobranca: '18/11/2026',
    status: 'cancelada',
    dataAcao: '18/03/2026 às 16:45',
  },
  {
    id: '6',
    nomeFantasia: 'Loja Silva',
    razaoSocial: 'Loja Silva LTDA',
    cnpj: '11.222.333/0001-44',
    plano: 'Pro',
    valor: 99.90,
    dataInicio: '01/04/2026',
    proximaCobranca: '01/11/2026',
    status: 'ativa',
    dataAcao: '01/04/2026 às 11:20',
  },
  {
    id: '7',
    nomeFantasia: 'Transportadora Rápido',
    razaoSocial: 'Transportadora Rápido LTDA',
    cnpj: '66.777.888/0001-22',
    plano: 'Premium',
    valor: 149.90,
    dataInicio: '15/03/2026',
    proximaCobranca: '15/11/2026',
    status: 'ativa',
    dataAcao: '15/03/2026 às 14:50',
  },
  {
    id: '8',
    nomeFantasia: 'Padaria Alvorada',
    razaoSocial: 'Padaria Alvorada LTDA',
    cnpj: '44.555.666/0001-77',
    plano: 'Básico',
    valor: 49.90,
    dataInicio: '28/02/2026',
    proximaCobranca: '28/11/2026',
    status: 'ativa',
    dataAcao: '28/02/2026 às 08:15',
  },
  {
    id: '9',
    nomeFantasia: 'Auto Peças Rodrigues',
    razaoSocial: 'Auto Peças Rodrigues LTDA',
    cnpj: '99.000.111/0001-33',
    plano: 'Pro',
    valor: 99.90,
    dataInicio: '10/03/2026',
    proximaCobranca: '10/11/2026',
    status: 'ativa',
    dataAcao: '10/03/2026 às 13:40',
  },
  {
    id: '10',
    nomeFantasia: 'Restaurante Vitória',
    razaoSocial: 'Restaurante Vitória LTDA',
    cnpj: '88.999.000/0001-11',
    plano: 'Premium',
    valor: 149.90,
    dataInicio: '05/01/2026',
    proximaCobranca: '05/11/2026',
    status: 'cancelada',
    dataAcao: '05/01/2026 às 19:25',
  },
];

export default function AssinaturasPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [planoFilter, setPlanoFilter] = useState('todos');
  const [periodoFilter, setPeriodoFilter] = useState('todos');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Calcular stats
  const totalAssinaturas = assinaturasFicticias.length;
  const ativasCount = assinaturasFicticias.filter((a) => a.status === 'ativa').length;
  const pendentesCount = assinaturasFicticias.filter((a) => a.status === 'pendente').length;
  const canceladasCount = assinaturasFicticias.filter((a) => a.status === 'cancelada').length;

  // Filtrar assinaturas
  const filteredAssinaturas = assinaturasFicticias.filter((assinatura) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      assinatura.nomeFantasia.toLowerCase().includes(searchLower) ||
      assinatura.razaoSocial.toLowerCase().includes(searchLower) ||
      assinatura.cnpj.includes(searchTerm) ||
      assinatura.plano.toLowerCase().includes(searchLower);

    const matchesStatus =
      statusFilter === 'todos' ||
      (statusFilter === 'ativa' && assinatura.status === 'ativa') ||
      (statusFilter === 'pendente' && assinatura.status === 'pendente') ||
      (statusFilter === 'cancelada' && assinatura.status === 'cancelada');

    const matchesPlano =
      planoFilter === 'todos' ||
      (planoFilter === 'basico' && assinatura.plano === 'Básico') ||
      (planoFilter === 'pro' && assinatura.plano === 'Pro') ||
      (planoFilter === 'premium' && assinatura.plano === 'Premium');

    const matchesPeriodo = periodoFilter === 'todos'; // Simplificado para demo

    return matchesSearch && matchesStatus && matchesPlano && matchesPeriodo;
  });

  // Paginar
  const paginatedAssinaturas = filteredAssinaturas.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const totalPages = Math.ceil(filteredAssinaturas.length / itemsPerPage);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ativa':
        return 'bg-green-100 text-green-800';
      case 'pendente':
        return 'bg-orange-100 text-orange-800';
      case 'cancelada':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'ativa':
        return '🟢';
      case 'pendente':
        return '🟠';
      case 'cancelada':
        return '🔴';
      default:
        return '⚪';
    }
  };

  const getPlanoColor = (plano: string) => {
    switch (plano) {
      case 'Básico':
        return 'bg-blue-100 text-blue-800';
      case 'Pro':
        return 'bg-purple-100 text-purple-800';
      case 'Premium':
        return 'bg-violet-100 text-violet-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Assinaturas</h1>
            <p className="text-gray-600 mt-2">Gerencie todas as assinaturas das empresas cadastradas no Unnify Conecta.</p>
          </div>
          <button className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center gap-2 transition">
            <span>+</span> Nova assinatura
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-orange-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Total de assinaturas</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{totalAssinaturas}</p>
                <p className="text-xs text-green-600 font-semibold mt-2">↑ +15% em relação ao mês anterior</p>
              </div>
              <span className="text-2xl">📋</span>
            </div>
          </div>

          <div className="bg-green-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Assinaturas ativas</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{ativasCount}</p>
                <p className="text-xs text-green-700 font-semibold mt-2">
                  {totalAssinaturas > 0 ? ((ativasCount / totalAssinaturas) * 100).toFixed(1) : '0'}% do total
                </p>
              </div>
              <span className="text-2xl">✓</span>
            </div>
          </div>

          <div className="bg-orange-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Assinaturas pendentes</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{pendentesCount}</p>
                <p className="text-xs text-orange-700 font-semibold mt-2">
                  {totalAssinaturas > 0 ? ((pendentesCount / totalAssinaturas) * 100).toFixed(1) : '0'}% do total
                </p>
              </div>
              <span className="text-2xl">⏱</span>
            </div>
          </div>

          <div className="bg-red-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Assinaturas canceladas</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{canceladasCount}</p>
                <p className="text-xs text-red-700 font-semibold mt-2">
                  {totalAssinaturas > 0 ? ((canceladasCount / totalAssinaturas) * 100).toFixed(1) : '0'}% do total
                </p>
              </div>
              <span className="text-2xl">✕</span>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-lg p-4 space-y-4">
          <div className="flex flex-col lg:flex-row gap-4 items-end">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por empresa, CNPJ ou plano..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
            >
              <option value="todos">Status: Todos</option>
              <option value="ativa">Ativa</option>
              <option value="pendente">Pendente</option>
              <option value="cancelada">Cancelada</option>
            </select>

            <select
              value={planoFilter}
              onChange={(e) => {
                setPlanoFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
            >
              <option value="todos">Plano: Todos</option>
              <option value="basico">Básico</option>
              <option value="pro">Pro</option>
              <option value="premium">Premium</option>
            </select>

            <select
              value={periodoFilter}
              onChange={(e) => {
                setPeriodoFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
            >
              <option value="todos">Período: Todos</option>
              <option value="este-mes">Este mês</option>
              <option value="ultimos-3-meses">Últimos 3 meses</option>
              <option value="este-ano">Este ano</option>
            </select>

            {(searchTerm || statusFilter !== 'todos' || planoFilter !== 'todos' || periodoFilter !== 'todos') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('todos');
                  setPlanoFilter('todos');
                  setPeriodoFilter('todos');
                  setCurrentPage(1);
                }}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition whitespace-nowrap"
              >
                🗑️ Limpar filtros
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg overflow-hidden border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    <input type="checkbox" className="rounded" />
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Empresa</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">CNPJ</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Plano</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Valor</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Início</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Próxima cobrança</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedAssinaturas.map((assinatura) => (
                  <tr key={assinatura.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <input type="checkbox" className="rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold text-gray-900">{assinatura.nomeFantasia}</p>
                        <p className="text-xs text-gray-500">{assinatura.razaoSocial}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-mono text-xs">{assinatura.cnpj}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getPlanoColor(assinatura.plano)}`}>
                        {assinatura.plano}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-semibold">R$ {assinatura.valor.toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-700 text-sm">{assinatura.dataInicio}</td>
                    <td className="px-4 py-3 text-gray-700 text-sm">{assinatura.proximaCobranca}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                          assinatura.status
                        )}`}
                      >
                        {getStatusDot(assinatura.status)} {assinatura.status.charAt(0).toUpperCase() + assinatura.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className="text-gray-600 hover:text-gray-900 p-1 text-lg">👁</button>
                      <button className="text-gray-600 hover:text-gray-900 p-1 text-lg">✏️</button>
                      <button className="text-gray-600 hover:text-gray-900 p-1 text-lg">⋯</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="border-t border-gray-200 px-4 py-4 flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filteredAssinaturas.length)} de {filteredAssinaturas.length}
            </div>

            <div className="flex items-center gap-4">
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-3 py-1 border border-gray-300 rounded text-sm"
              >
                <option value="10">10 por página</option>
                <option value="20">20 por página</option>
                <option value="50">50 por página</option>
              </select>

              <div className="flex gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                  className="p-1 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                  const page = i + 1;
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1 rounded ${
                        currentPage === page
                          ? 'bg-orange-500 text-white'
                          : 'border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}

                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(currentPage + 1)}
                  className="p-1 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
