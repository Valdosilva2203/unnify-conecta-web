'use client';

import { useState } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';

interface Comissao {
  id: string;
  beneficiarioNome: string;
  beneficiarioId: string;
  tipo: 'Contador' | 'Parceiro';
  empresaIndicada: string;
  plano: 'Básico' | 'Pro' | 'Premium';
  mensalidade: number;
  comissao: number;
  competencia: string;
  status: 'paga' | 'pendente' | 'cancelada';
  dataPagamento: string | null;
}

const comissoesFicticias: Comissao[] = [
  {
    id: '1',
    beneficiarioNome: 'Ana Clara Souza',
    beneficiarioId: 'AC',
    tipo: 'Contador',
    empresaIndicada: 'Comercial Ferreira LTDA',
    plano: 'Básico',
    mensalidade: 49.90,
    comissao: 9.98,
    competencia: '10/2026',
    status: 'paga',
    dataPagamento: '05/11/2026',
  },
  {
    id: '2',
    beneficiarioNome: 'Ricardo Sousa',
    beneficiarioId: 'RS',
    tipo: 'Parceiro',
    empresaIndicada: 'Top Serviços LTDA',
    plano: 'Pro',
    mensalidade: 99.90,
    comissao: 19.98,
    competencia: '10/2026',
    status: 'pendente',
    dataPagamento: null,
  },
  {
    id: '3',
    beneficiarioNome: 'João Martins',
    beneficiarioId: 'JM',
    tipo: 'Contador',
    empresaIndicada: 'Mercado Almeida LTDA',
    plano: 'Premium',
    mensalidade: 149.90,
    comissao: 29.98,
    competencia: '10/2026',
    status: 'paga',
    dataPagamento: '03/11/2026',
  },
  {
    id: '4',
    beneficiarioNome: 'Fernanda Silva',
    beneficiarioId: 'FS',
    tipo: 'Parceiro',
    empresaIndicada: 'Farmácia Central LTDA',
    plano: 'Pro',
    mensalidade: 99.90,
    comissao: 19.98,
    competencia: '10/2026',
    status: 'pendente',
    dataPagamento: null,
  },
  {
    id: '5',
    beneficiarioNome: 'Paulo Ribeiro',
    beneficiarioId: 'PR',
    tipo: 'Contador',
    empresaIndicada: 'Barbearia Reis LTDA',
    plano: 'Básico',
    mensalidade: 49.90,
    comissao: 9.98,
    competencia: '09/2026',
    status: 'paga',
    dataPagamento: '05/10/2026',
  },
  {
    id: '6',
    beneficiarioNome: 'Lucas Mendes',
    beneficiarioId: 'LM',
    tipo: 'Parceiro',
    empresaIndicada: 'Loja Silva LTDA',
    plano: 'Pro',
    mensalidade: 99.90,
    comissao: 19.98,
    competencia: '09/2026',
    status: 'paga',
    dataPagamento: '05/10/2026',
  },
  {
    id: '7',
    beneficiarioNome: 'Carlos Santos',
    beneficiarioId: 'CS',
    tipo: 'Parceiro',
    empresaIndicada: 'Transportadora Rápido LTDA',
    plano: 'Premium',
    mensalidade: 149.90,
    comissao: 29.98,
    competencia: '09/2026',
    status: 'cancelada',
    dataPagamento: null,
  },
  {
    id: '8',
    beneficiarioNome: 'Maria Vitória',
    beneficiarioId: 'MV',
    tipo: 'Contador',
    empresaIndicada: 'Padaria Alvorada LTDA',
    plano: 'Básico',
    mensalidade: 49.90,
    comissao: 9.98,
    competencia: '08/2026',
    status: 'paga',
    dataPagamento: '05/09/2026',
  },
  {
    id: '9',
    beneficiarioNome: 'Diego Lima',
    beneficiarioId: 'DL',
    tipo: 'Parceiro',
    empresaIndicada: 'Auto Peças Rodrigues LTDA',
    plano: 'Pro',
    mensalidade: 99.90,
    comissao: 19.98,
    competencia: '08/2026',
    status: 'pendente',
    dataPagamento: null,
  },
  {
    id: '10',
    beneficiarioNome: 'Natália Torres',
    beneficiarioId: 'NT',
    tipo: 'Parceiro',
    empresaIndicada: 'Restaurante Vitória LTDA',
    plano: 'Premium',
    mensalidade: 149.90,
    comissao: 29.98,
    competencia: '08/2026',
    status: 'paga',
    dataPagamento: '02/09/2026',
  },
];

export default function ComissoesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [tipoFilter, setTipoFilter] = useState('todos');
  const [periodoFilter, setPeriodoFilter] = useState('todos');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Calcular stats
  const totalComissoes = comissoesFicticias.reduce((sum, c) => sum + c.comissao, 0);
  const pagasComissoes = comissoesFicticias
    .filter((c) => c.status === 'paga')
    .reduce((sum, c) => sum + c.comissao, 0);
  const pendentesComissoes = comissoesFicticias
    .filter((c) => c.status === 'pendente')
    .reduce((sum, c) => sum + c.comissao, 0);
  const canceladasComissoes = comissoesFicticias
    .filter((c) => c.status === 'cancelada')
    .reduce((sum, c) => sum + c.comissao, 0);

  // Filtrar comissões
  const filteredComissoes = comissoesFicticias.filter((comissao) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      comissao.beneficiarioNome.toLowerCase().includes(searchLower) ||
      comissao.empresaIndicada.toLowerCase().includes(searchLower);

    const matchesStatus =
      statusFilter === 'todos' ||
      (statusFilter === 'paga' && comissao.status === 'paga') ||
      (statusFilter === 'pendente' && comissao.status === 'pendente') ||
      (statusFilter === 'cancelada' && comissao.status === 'cancelada');

    const matchesTipo =
      tipoFilter === 'todos' ||
      (tipoFilter === 'contador' && comissao.tipo === 'Contador') ||
      (tipoFilter === 'parceiro' && comissao.tipo === 'Parceiro');

    const matchesPeriodo = periodoFilter === 'todos';

    return matchesSearch && matchesStatus && matchesTipo && matchesPeriodo;
  });

  // Paginar
  const paginatedComissoes = filteredComissoes.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const totalPages = Math.ceil(filteredComissoes.length / itemsPerPage);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paga':
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
      case 'paga':
        return '🟢';
      case 'pendente':
        return '🟠';
      case 'cancelada':
        return '🔴';
      default:
        return '⚪';
    }
  };

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'Contador':
        return 'bg-blue-100 text-blue-800';
      case 'Parceiro':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
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
            <h1 className="text-3xl font-bold text-gray-900">Comissões</h1>
            <p className="text-gray-600 mt-2">Gerencie todas as comissões geradas por indicações de contadores e parceiros.</p>
          </div>
          <button className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center gap-2 transition">
            <span>+</span> Nova comissão
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-orange-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Total de comissões geradas</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">R$ {totalComissoes.toFixed(2)}</p>
                <p className="text-xs text-green-600 font-semibold mt-2">↑ +18% em relação ao mês anterior</p>
              </div>
              <span className="text-2xl">💰</span>
            </div>
          </div>

          <div className="bg-green-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Comissões pagas</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">R$ {pagasComissoes.toFixed(2)}</p>
                <p className="text-xs text-green-700 font-semibold mt-2">
                  {totalComissoes > 0 ? ((pagasComissoes / totalComissoes) * 100).toFixed(1) : '0'}% do total
                </p>
              </div>
              <span className="text-2xl">✓</span>
            </div>
          </div>

          <div className="bg-orange-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Comissões pendentes</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">R$ {pendentesComissoes.toFixed(2)}</p>
                <p className="text-xs text-orange-700 font-semibold mt-2">
                  {totalComissoes > 0 ? ((pendentesComissoes / totalComissoes) * 100).toFixed(1) : '0'}% do total
                </p>
              </div>
              <span className="text-2xl">⏱</span>
            </div>
          </div>

          <div className="bg-red-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Comissões canceladas</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">R$ {canceladasComissoes.toFixed(2)}</p>
                <p className="text-xs text-red-700 font-semibold mt-2">
                  {totalComissoes > 0 ? ((canceladasComissoes / totalComissoes) * 100).toFixed(1) : '0'}% do total
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
                placeholder="Buscar por contador, parceiro ou empresa..."
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
              <option value="paga">Paga</option>
              <option value="pendente">Pendente</option>
              <option value="cancelada">Cancelada</option>
            </select>

            <select
              value={tipoFilter}
              onChange={(e) => {
                setTipoFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
            >
              <option value="todos">Tipo: Todos</option>
              <option value="contador">Contador</option>
              <option value="parceiro">Parceiro</option>
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
              <option value="mes-atual">Mês atual</option>
              <option value="ultimos-3">Últimos 3 meses</option>
              <option value="ano">Ano atual</option>
            </select>

            {(searchTerm || statusFilter !== 'todos' || tipoFilter !== 'todos' || periodoFilter !== 'todos') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('todos');
                  setTipoFilter('todos');
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
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Beneficiário</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Tipo</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Empresa indicada</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Plano</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Mensalidade</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Comissão</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Competência</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Pagamento</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedComissoes.map((comissao) => (
                  <tr key={comissao.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <input type="checkbox" className="rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-xs font-semibold">
                          {comissao.beneficiarioId}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{comissao.beneficiarioNome}</p>
                          <p className="text-xs text-gray-500">{comissao.beneficiarioId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getTipoColor(comissao.tipo)}`}>
                        {comissao.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-sm">{comissao.empresaIndicada}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getPlanoColor(comissao.plano)}`}>
                        {comissao.plano}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-semibold">R$ {comissao.mensalidade.toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-700 font-semibold">R$ {comissao.comissao.toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-700 text-sm">{comissao.competencia}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                          comissao.status
                        )}`}
                      >
                        {getStatusDot(comissao.status)} {comissao.status.charAt(0).toUpperCase() + comissao.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-sm">{comissao.dataPagamento || '-'}</td>
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
              Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filteredComissoes.length)} de {filteredComissoes.length}
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
