'use client';

import { useEffect, useState } from 'react';
import { Building2, Search, Filter, X, Plus } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { createClient } from '@/lib/supabase/client';
import { CompaniesTable } from '@/components/admin/empresas/CompaniesTable';
import { StatsCard } from '@/components/admin/empresas/StatsCard';

interface Company {
  id: string;
  cnpj: string;
  legal_name: string;
  trade_name: string | null;
  phone: string | null;
  commercial_email: string;
  city: string;
  state: string;
  registration_status: string | null;
  created_at: string;
  created_by: string;
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

export default function EmpresasPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [filteredCompanies, setFilteredCompanies] = useState<Company[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    active: 0,
    inactive: 0,
    pending: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters and search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Extract unique cities for filter
  const cities = Array.from(new Set(companies.map((c) => c.city))).sort();

  // Fetch companies
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        setLoading(true);
        const supabase = createClient();

        console.log('[AdminEmpresas] 1. Iniciando fetch de empresas');

        const { data, error: fetchError } = await supabase
          .from('companies')
          .select('*')
          .order('created_at', { ascending: false });

        console.log('[AdminEmpresas] 2. Resposta do Supabase:', {
          hasError: !!fetchError,
          errorMessage: fetchError?.message,
          dataLength: data ? (Array.isArray(data) ? data.length : 'não é array') : 'null',
          rawData: data,
        });

        if (fetchError) {
          console.error('[AdminEmpresas] 3. Erro na consulta:', fetchError);
          setError(`Erro ao carregar empresas: ${fetchError.message}`);
          return;
        }

        const companiesData = (data || []) as Company[];
        console.log('[AdminEmpresas] 4. Empresas carregadas:', companiesData.length);

        // Calculate stats
        const totalCount = companiesData.length;
        const activeCount = companiesData.filter(
          (c) => c.registration_status === 'ATIVA'
        ).length;
        const inactiveCount = companiesData.filter(
          (c) => c.registration_status === 'SUSPENSA'
        ).length;
        const pendingCount = totalCount - activeCount - inactiveCount;

        setStats({
          total: totalCount,
          active: activeCount,
          inactive: inactiveCount,
          pending: pendingCount,
        });
      } catch (err) {
        setError('Erro ao carregar dados');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchCompanies();
  }, []);

  // Apply filters and search
  useEffect(() => {
    let result = companies;

    // Search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (c) =>
          c.legal_name.toLowerCase().includes(term) ||
          (c.trade_name?.toLowerCase().includes(term) || false) ||
          c.cnpj.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'active') {
        result = result.filter((c) => c.registration_status === 'ATIVA');
      } else if (statusFilter === 'inactive') {
        result = result.filter((c) => c.registration_status === 'SUSPENSA');
      } else if (statusFilter === 'pending') {
        result = result.filter(
          (c) =>
            c.registration_status !== 'ATIVA' &&
            c.registration_status !== 'SUSPENSA'
        );
      }
    }

    // City filter
    if (cityFilter) {
      result = result.filter((c) => c.city === cityFilter);
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
  }, [companies, searchTerm, statusFilter, cityFilter, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(filteredCompanies.length / ITEMS_PER_PAGE);
  const paginatedCompanies = filteredCompanies.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const hasActiveFilters =
    searchTerm || statusFilter !== 'all' || cityFilter;

  const handleClearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setCityFilter('');
    setCurrentPage(1);
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
        <StatsCard
          icon={<Building2 className="w-6 h-6" />}
          label="Total de empresas"
          value={stats.total}
          color="orange"
        />
        <StatsCard
          label="Empresas ativas"
          value={stats.active}
          percentage={stats.total > 0 ? (stats.active / stats.total * 100).toFixed(1) + '%' : '—'}
          percentageLabel="do total"
          color="green"
        />
        <StatsCard
          label="Empresas pendentes"
          value={stats.pending}
          percentage={stats.total > 0 ? (stats.pending / stats.total * 100).toFixed(1) + '%' : '—'}
          percentageLabel="do total"
          color="orange"
        />
        <StatsCard
          label="Empresas inativas"
          value={stats.inactive}
          percentage={stats.total > 0 ? (stats.inactive / stats.total * 100).toFixed(1) + '%' : '—'}
          percentageLabel="do total"
          color="gray"
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome, CNPJ, cidade ou responsável..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
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
            onChange={(e) => setCityFilter(e.target.value)}
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
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Carregando empresas...</p>
          </div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-red-700 font-medium mb-2">Erro ao carregar empresas</p>
          <p className="text-red-600 text-sm">{error}</p>
          <p className="text-red-600 text-xs mt-3 font-mono">
            Verifique se há problemas de permissão RLS ou se o Supabase está acessível.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
          >
            Tentar novamente
          </button>
        </div>
      ) : filteredCompanies.length === 0 ? (
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
          <CompaniesTable
            companies={paginatedCompanies}
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={(field) => {
              if (sortField === field) {
                setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
              } else {
                setSortField(field as SortField);
                setSortDirection('asc');
              }
            }}
          />

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
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50"
              >
                ← Anterior
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-2 rounded-lg text-sm ${
                      currentPage === pageNum
                        ? 'bg-orange-600 text-white'
                        : 'border border-gray-300'
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
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50"
              >
                Próxima →
              </button>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
