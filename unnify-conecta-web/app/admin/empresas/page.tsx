'use client';

import { useEffect, useState } from 'react';
import { Building2, Search, X, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { createClient } from '@/lib/supabase/client';

interface Company {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_comercial: string | null;
  telefone: string | null;
  email_comercial: string;
  cidade: string;
  estado: string;
  status_registro: 'ATIVA' | 'SUSPENSA' | 'PENDENTE' | null;
  criado_em: string;
}

interface Stats {
  total: number;
  active: number;
  inactive: number;
  pending: number;
}

type SortField = 'razao_social' | 'cnpj' | 'cidade' | 'created_at';
type SortDirection = 'asc' | 'desc';

const ITEMS_PER_PAGE = 10;

export default function EmpresasPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [filteredCompanies, setFilteredCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters and search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Fetch companies from Supabase
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        setLoading(true);
        const supabase = createClient();

        const { data, error: fetchError } = await supabase
          .from('empresas')
          .select('*')
          .order('created_at', { ascending: false });

        if (fetchError) {
          console.error('Erro ao carregar empresas:', fetchError);
          setError(`Erro ao carregar empresas: ${fetchError.message}`);
          return;
        }

        const companiesData = (data || []) as Company[];
        setCompanies(companiesData);
        setFilteredCompanies(companiesData);
      } catch (err) {
        console.error('Erro:', err);
        setError('Erro ao carregar dados');
      } finally {
        setLoading(false);
      }
    };

    fetchCompanies();
  }, []);

  // Calculate stats
  const stats: Stats = {
    total: companies.length,
    active: companies.filter((c) => c.status_registro === 'ATIVA').length,
    inactive: companies.filter((c) => c.status_registro === 'SUSPENSA').length,
    pending: companies.filter((c) => c.status_registro === 'PENDENTE').length,
  };

  // Extract unique cities for filter
  const cities = Array.from(new Set(companies.map((c) => c.cidade))).sort();

  // Apply filters and search
  const applyFilters = (search: string, status: string, cidade: string) => {
    let result = companies;

    // Search
    if (search) {
      const term = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.razao_social.toLowerCase().includes(term) ||
          (c.nome_comercial ? c.nome_comercial.toLowerCase().includes(term) : false) ||
          c.cnpj.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (status !== 'all') {
      if (status === 'active') {
        result = result.filter((c) => c.status_registro === 'ATIVA');
      } else if (status === 'inactive') {
        result = result.filter((c) => c.status_registro === 'SUSPENSA');
      } else if (status === 'pending') {
        result = result.filter((c) => c.status_registro === 'PENDENTE');
      }
    }

    // City filter
    if (cidade) {
      result = result.filter((c) => c.cidade === cidade);
    }

    // Sort
    result.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === 'created_at') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      } else {
        aVal = aVal ? aVal.toString().toLowerCase() : '';
        bVal = bVal ? bVal.toString().toLowerCase() : '';
      }

      return sortDirection === 'asc'
        ? aVal > bVal ? 1 : -1
        : aVal < bVal ? 1 : -1;
    });

    setFilteredCompanies(result);
    setCurrentPage(1);
  };

  // Apply filters whenever search/filter changes
  useEffect(() => {
    applyFilters(searchTerm, statusFilter, cityFilter);
  }, [searchTerm, statusFilter, cityFilter, companies]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
  };

  const handleCityChange = (value: string) => {
    setCityFilter(value);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setCityFilter('');
  };

  // Pagination
  const totalPages = Math.ceil(filteredCompanies.length / ITEMS_PER_PAGE);
  const paginatedCompanies = filteredCompanies.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const hasActiveFilters = searchTerm || statusFilter !== 'all' || cityFilter;

  const getStatusColor = (status: string | null) => {
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

  const getStatusDot = (status: string | null) => {
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
            {cities.map((cidade) => (
              <option key={cidade} value={cidade}>
                {cidade}
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

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Carregando empresas...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-red-700 font-medium mb-2">Erro ao carregar empresas</p>
          <p className="text-red-600 text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <>
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
                          <p className="font-semibold text-gray-900">{company.razao_social}</p>
                          <p className="text-xs text-gray-500">{company.nome_comercial || 'N/A'}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-sm">{company.cnpj}</td>
                      <td className="px-4 py-3 text-gray-700 text-sm">{company.email_comercial}</td>
                      <td className="px-4 py-3 text-gray-700 text-sm">{company.telefone || 'N/A'}</td>
                      <td className="px-4 py-3 text-gray-700 text-sm">{company.cidade}/{company.estado}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(company.status_registro)}`}>
                          {getStatusDot(company.status_registro)} {company.status_registro}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-sm">{formatDate(company.criado_em)}</td>
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
                defaultValue={ITEMS_PER_PAGE}
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
        </>
      )}
    </AdminLayout>
  );
}
