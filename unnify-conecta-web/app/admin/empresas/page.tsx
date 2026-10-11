'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import {
  BarraFiltros,
  BotaoLimparFiltros,
  BotoesAcao,
  CampoBusca,
  Celula,
  CelulaCidade,
  CelulaContato,
  CelulaNome,
  EstadoTabela,
  FiltroSelect,
  IconeCidade,
  Linha,
  Paginacao,
  Selo,
  Tabela,
  TabelaCard,
  type TipoSelo,
} from '@/components/admin/tabela';
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

type SortField = 'razao_social' | 'cnpj' | 'cidade' | 'criado_em';
type SortDirection = 'asc' | 'desc';

const SELO_REGISTRO: Record<string, TipoSelo> = {
  ATIVA: 'sucesso',
  PENDENTE: 'alerta',
  SUSPENSA: 'perigo',
};

const ROTULO_REGISTRO: Record<string, string> = {
  ATIVA: 'Ativa',
  PENDENTE: 'Pendente',
  SUSPENSA: 'Suspensa',
};

function formatarTelefone(valor: string | null): string {
  const d = (valor || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor || '';
}

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
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortField, setSortField] = useState<SortField>('criado_em');
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
          .or('tipo_empresa.is.null,tipo_empresa.neq.escritorio_contabil')
          .order('criado_em', { ascending: false });

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
  const cities = Array.from(new Set(companies.map((c) => c.cidade).filter(Boolean))).sort();

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
          c.cnpj.toLowerCase().includes(term) ||
          (c.cidade ? c.cidade.toLowerCase().includes(term) : false)
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

      if (sortField === 'criado_em') {
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
  const paginatedCompanies = filteredCompanies.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const hasActiveFilters = searchTerm || statusFilter !== 'all' || cityFilter;

  return (
    <AdminLayout>
      {/* Page Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900">Empresas</h1>
          <button
            type="button"
            className="min-h-11 bg-orange-600 hover:bg-orange-700 text-white rounded-lg px-4 flex items-center gap-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Nova empresa
          </button>
        </div>
        <p className="text-gray-600">
          Gerencie todas as empresas cadastradas no Unnify Conecta.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-8">
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

      <TabelaCard>
        <BarraFiltros>
          <CampoBusca
            valor={searchTerm}
            aoMudar={handleSearchChange}
            placeholder="Buscar por nome, CNPJ ou cidade..."
          />
          <FiltroSelect valor={statusFilter} aoMudar={handleStatusChange}>
            <option value="all">Status: Todos</option>
            <option value="active">Ativa</option>
            <option value="pending">Pendente</option>
            <option value="inactive">Suspensa</option>
          </FiltroSelect>
          <FiltroSelect icone={IconeCidade} valor={cityFilter} aoMudar={handleCityChange}>
            <option value="">Cidade: Todas</option>
            {cities.map((cidade) => (
              <option key={cidade} value={cidade}>
                {cidade}
              </option>
            ))}
          </FiltroSelect>
          {hasActiveFilters && <BotaoLimparFiltros aoClicar={handleClearFilters} />}
        </BarraFiltros>

        <EstadoTabela
          carregando={loading}
          erro={error}
          vazio={filteredCompanies.length === 0}
          mensagemVazio={
            hasActiveFilters
              ? 'Nenhuma empresa encontrada com os filtros aplicados.'
              : 'Nenhuma empresa cadastrada ainda.'
          }
        >
          <Tabela
            colunas={[
              { titulo: 'Empresa' },
              { titulo: 'Contato' },
              { titulo: 'Cidade/UF' },
              { titulo: 'Status' },
              { titulo: 'Cadastro' },
              { titulo: 'Ações', alinhar: 'centro' },
            ]}
          >
            {paginatedCompanies.map((company, i) => (
              <Linha key={company.id}>
                <Celula>
                  <CelulaNome
                    nome={company.nome_comercial || company.razao_social}
                    detalhes={[company.razao_social, `CNPJ ${company.cnpj}`]}
                    indice={(currentPage - 1) * itemsPerPage + i}
                  />
                </Celula>
                <Celula>
                  <CelulaContato telefone={formatarTelefone(company.telefone)} email={company.email_comercial} />
                </Celula>
                <Celula>
                  <CelulaCidade cidade={company.cidade} uf={company.estado} />
                </Celula>
                <Celula>
                  <Selo
                    tipo={SELO_REGISTRO[company.status_registro ?? ''] ?? 'neutro'}
                    texto={ROTULO_REGISTRO[company.status_registro ?? ''] ?? 'Sem status'}
                  />
                </Celula>
                <Celula className="whitespace-nowrap">
                  {new Date(company.criado_em).toLocaleDateString('pt-BR')}
                </Celula>
                <Celula alinhar="centro">
                  <BotoesAcao />
                </Celula>
              </Linha>
            ))}
          </Tabela>
          <Paginacao
            pagina={currentPage}
            aoMudarPagina={setCurrentPage}
            porPagina={itemsPerPage}
            aoMudarPorPagina={setItemsPerPage}
            total={filteredCompanies.length}
          />
        </EstadoTabela>
      </TabelaCard>
    </AdminLayout>
  );
}
