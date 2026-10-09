'use client';

import { useState } from 'react';
import { Building2, Search, X, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';

interface Company {
  id: string;
  cnpj: string;
  legal_name: string;
  trade_name: string | null;
  phone: string | null;
  commercial_email: string;
  city: string;
  state: string;
  registration_status: 'ATIVA' | 'SUSPENSA' | 'PENDENTE';
  created_at: string;
}

interface Stats {
  total: number;
  active: number;
  inactive: number;
  pending: number;
}

type SortField = 'legal_name' | 'cnpj' | 'city' | 'created_at';
type SortDirection = 'asc' | 'desc';

const ITEMS_PER_PAGE = 10;

// Dados fictícios de empresas
const companiesFicticias: Company[] = [
  {
    id: '1',
    cnpj: '12.345.678/0001-90',
    legal_name: 'Comercial Ferreira LTDA',
    trade_name: 'Ferreira',
    phone: '(63) 99999-1111',
    commercial_email: 'contato@ferreira.com.br',
    city: 'Augustinópolis',
    state: 'TO',
    registration_status: 'ATIVA',
    created_at: '2026-02-15T10:30:00Z',
  },
  {
    id: '2',
    cnpj: '23.456.789/0001-01',
    legal_name: 'Top Serviços LTDA',
    trade_name: 'Top Serviços',
    phone: '(63) 99999-2222',
    commercial_email: 'contato@topservicos.com.br',
    city: 'Goianésia',
    state: 'TO',
    registration_status: 'ATIVA',
    created_at: '2026-02-10T14:45:00Z',
  },
  {
    id: '3',
    cnpj: '34.567.890/0001-12',
    legal_name: 'Mercado Almeida LTDA',
    trade_name: 'Mercado Almeida',
    phone: '(63) 99999-3333',
    commercial_email: 'contato@mercadoalmeida.com.br',
    city: 'Palmas',
    state: 'TO',
    registration_status: 'ATIVA',
    created_at: '2026-03-05T09:15:00Z',
  },
];

export default function EmpresasPage() {
  const [companies] = useState<Company[]>(companiesFicticias);
  const [filteredCompanies, setFilteredCompanies] = useState<Company[]>(companiesFicticias);

  // Filters and search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Calculate stats
  const stats: Stats = {
    total: companies.length,
    active: companies.filter((c) => c.registration_status === 'ATIVA').length,
    inactive: companies.filter((c) => c.registration_status === 'SUSPENSA').length,
    pending: companies.filter((c) => c.registration_status === 'PENDENTE').length,
  };

  // Extract unique cities for filter
  const cities = Array.from(new Set(companies.map((c) => c.city))).sort();

  // Apply filters and search
  const applyFilters = (search: string, status: string, city: string) => {
    let result = companies;

    // Search
    if (search) {
      const term = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.legal_name.toLowerCase().includes(term) ||
          (c.trade_name?.toLowerCase().includes(term) || false) ||
          c.cnpj.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (status !== 'all') {
      if (status === 'active') {
        result = result.filter((c) => c.registration_status === 'ATIVA');
      } else if (status === 'inactive') {
        result = result.filter((c) => c.registration_status === 'SUSPENSA');
      } else if (status === 'pending') {
        result = result.filter((c) => c.registration_status === 'PENDENTE');
      }
    }

    // City filter
    if (city) {
      result = result.filter((c) => c.city === city);
    }

    // Sort
    result.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === 'created_at') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      } else {
        aVal = aVal?.toString().toLowerCase() || '';
        bVal = bVal?.toString().toLowerCase() || '';
      }

      return sortDirection === 'asc'
        ? aVal > bVal ? 1 : -1
        : aVal < bVal ? 1 : -1;
    });

    setFilteredCompanies(result);
    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    applyFilters(value, statusFilter, cityFilter);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    applyFilters(searchTerm, value, cityFilter);
  };

  const handleCityChange = (value: string) => {
    setCityFilter(value);
    applyFilters(searchTerm, statusFilter, value);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setCityFilter('');
    applyFilters('', 'all', '');
  };

  // Pagination
  const totalPages = Math.ceil(filteredCompanies.length / ITEMS_PER_PAGE);
  const paginatedCompanies = filteredCompanies.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const hasActiveFilters = searchTerm || statusFilter !== 'all' || cityFilter;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ATIVA':
        return 'bg-green-100 text-green-800';
      case 'SUSPENSA':
        return 'bg-red-100 text-red-800';
      case 'PENDENTE':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'ATIVA':
        return '🟢';
      case 'SUSPENSA':
        return '🔴';
      case 'PENDENTE':
        return '🟠';
      default:
        return '⚪';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
  };

  return (
    <AdminLayout>
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-black text-gray-900">Empresas</h1>
          <button className="bg-orange-600 hover:bg-orange-700 text-white rounded-lg px-4 py-2 flex items-center gap-2 text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" />
            Nova empresa
          </button>
        </div>
        <p className="text-gray-600">
          Gerencie todas as empresas cadastradas no Unnify Conecta.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-orange-50 rounded-lg p-4 border border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-gray-600 text-sm">Total de empresas</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.total}</p>
            </div>
            <span className="text-2xl">🏢</span>
          </div>
        </div>
        <div className="bg-green-50 rounded-lg p-4 border border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-gray-600 text-sm">Empresas ativas</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.active}</p>
              <p className="text-xs text-green-700 font-semibold mt-2">
                {stats.total > 0 ? ((stats.active / stats.total) * 100).toFixed(1) : '0'}% do total
              </p>
            </div>
            <span className="text-2xl">✓</span>
          </div>
        </div>
        <div className="bg-orange-50 rounded-lg p-4 border border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-gray-600 text-sm">Empresas pendentes</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.pending}</p>
              <p className="text-xs text-orange-700 font-semibold mt-2">
                {stats.total > 0 ? ((stats.pending / stats.total) * 100).toFixed(1) : '0'}% do total
              </p>
            </div>
            <span className="text-2xl">⏱</span>
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-gray-600 text-sm">Empresas inativas</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.inactive}</p>
              <p className="text-xs text-gray-700 font-semibold mt-2">
                {stats.total > 0 ? ((stats.inactive / stats.total) * 100).toFixed(1) : '0'}% do total
              </p>
            </div>
            <span className="text-2xl">✕</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome, CNPJ, cidade..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          >
            <option value="all">Status: Todos</option>
            <option value="active">Ativa</option>
            <option value="inactive">Suspensa</option>
            <option value="pending">Pendente</option>
          </select>

          {/* City Filter */}
          <select
            value={cityFilter}
            onChange={(e) => handleCityChange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          >
            <option value="">Cidade: Todas</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <X className="w-4 h-4" />
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {filteredCompanies.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">
            {searchTerm || statusFilter !== 'all' || cityFilter
              ? 'Nenhuma empresa encontrada com os filtros aplicados.'
              : 'Nenhuma empresa cadastrada ainda.'}
          </p>
          {(searchTerm || statusFilter !== 'all' || cityFilter) && (
            <button
              onClick={handleClearFilters}
              className="text-orange-600 hover:text-orange-700 font-semibold text-sm"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="bg-white rounded-lg overflow-hidden border border-gray-200">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Empresa</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">CNPJ</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">E-mail</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Telefone</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Cidade/UF</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Cadastro</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedCompanies.map((company) => (
                    <tr key={company.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-semibold text-gray-900">{company.legal_name}</p>
                          <p className="text-xs text-gray-500">{company.trade_name || 'N/A'}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-sm">{company.cnpj}</td>
                      <td className="px-4 py-3 text-gray-700 text-sm">{company.commercial_email}</td>
                      <td className="px-4 py-3 text-gray-700 text-sm">{company.phone || 'N/A'}</td>
                      <td className="px-4 py-3 text-gray-700 text-sm">{company.city}/{company.state}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(company.registration_status)}`}>
                          {getStatusDot(company.registration_status)} {company.registration_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-sm">{formatDate(company.created_at)}</td>
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
          </div>

          {/* Pagination */}
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} de{' '}
              {filteredCompanies.length} empresas
            </p>
            <div className="flex items-center gap-2">
              <select
                value={ITEMS_PER_PAGE}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="10">10 por página</option>
                <option value="20">20 por página</option>
                <option value="50">50 por página</option>
              </select>
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="p-1 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-1 rounded text-sm ${
                      currentPage === pageNum
                        ? 'bg-orange-600 text-white'
                        : 'border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() =>
                  setCurrentPage(Math.min(totalPages, currentPage + 1))
                }
                disabled={currentPage === totalPages}
                className="p-1 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
