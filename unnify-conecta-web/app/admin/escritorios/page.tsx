'use client';

import { useEffect, useState } from 'react';
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
  Contagem,
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

interface Escritorio {
  id: string;
  nomeFantasia: string;
  razaoSocial: string;
  cnpj: string;
  responsavel: string;
  telefone: string;
  email: string;
  cidade: string;
  uf: string;
  contadores: number;
  status: 'ativo' | 'pendente' | 'inativo' | 'sem_status';
  criadoEm: string;
}

const STATUS_MAP: Record<string, Escritorio['status']> = {
  ATIVA: 'ativo',
  PENDENTE: 'pendente',
  SUSPENSA: 'inativo',
};

const STATUS_LABEL: Record<Escritorio['status'], string> = {
  ativo: 'Ativo',
  pendente: 'Pendente',
  inativo: 'Inativo',
  sem_status: 'Sem status',
};

const SELO_STATUS: Record<Escritorio['status'], TipoSelo> = {
  ativo: 'sucesso',
  pendente: 'alerta',
  inativo: 'perigo',
  sem_status: 'neutro',
};

function formatPhone(value: string | null): string {
  const d = (value || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return value || '';
}

export default function EscritoriosPage() {
  const [escritorios, setEscritorios] = useState<Escritorio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [novosNoMes, setNovosNoMes] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [cityFilter, setCityFilter] = useState('todas');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    const fetchEscritorios = async () => {
      try {
        const supabase = createClient();

        const { data: empresas, error: empresasError } = await supabase
          .from('empresas')
          .select('id, razao_social, nome_comercial, cnpj, telefone, email_comercial, cidade, estado, status_registro, criado_por, criado_em')
          .eq('tipo_empresa', 'escritorio_contabil')
          .order('criado_em', { ascending: false });

        if (empresasError) throw empresasError;
        if (!empresas || empresas.length === 0) {
          setEscritorios([]);
          return;
        }

        const agora = new Date();
        const inicioDoMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
        setNovosNoMes(empresas.filter((e) => new Date(e.criado_em) >= inicioDoMes).length);

        const ids = empresas.map((e) => e.id);
        const donos = Array.from(new Set(empresas.map((e) => e.criado_por).filter(Boolean)));

        const [{ data: perfis, error: perfisError }, { data: vinculos, error: vinculosError }] = await Promise.all([
          supabase.from('perfis').select('id_usuario, nome_completo, email').in('id_usuario', donos),
          supabase.from('usuarios_empresas').select('id_empresa').in('id_empresa', ids).eq('ativo', true),
        ]);

        if (perfisError) throw perfisError;
        if (vinculosError) throw vinculosError;

        const nomePorUsuario = new Map((perfis || []).map((p) => [p.id_usuario, p.nome_completo || p.email || '']));
        const membrosPorEmpresa = new Map<string, number>();
        (vinculos || []).forEach((v) => {
          membrosPorEmpresa.set(v.id_empresa, (membrosPorEmpresa.get(v.id_empresa) || 0) + 1);
        });

        setEscritorios(
          empresas.map((e) => ({
            id: e.id,
            nomeFantasia: e.nome_comercial || e.razao_social,
            razaoSocial: e.razao_social,
            cnpj: e.cnpj,
            responsavel: nomePorUsuario.get(e.criado_por) || '—',
            telefone: formatPhone(e.telefone),
            email: e.email_comercial || '',
            cidade: e.cidade || '',
            uf: e.estado || '',
            contadores: membrosPorEmpresa.get(e.id) || 0,
            status: STATUS_MAP[e.status_registro ?? ''] || 'sem_status',
            criadoEm: e.criado_em,
          }))
        );
      } catch (err) {
        console.error('Erro ao carregar escritórios:', err);
        setError(err instanceof Error ? err.message : 'Erro ao carregar escritórios');
      } finally {
        setLoading(false);
      }
    };

    fetchEscritorios();
  }, []);

  // Calcular stats
  const totalEscritorios = escritorios.length;
  const ativosCount = escritorios.filter((e) => e.status === 'ativo').length;
  const pendentesCount = escritorios.filter((e) => e.status === 'pendente').length;
  const inativosCount = escritorios.filter((e) => e.status === 'inativo').length;

  // Filtrar escritórios
  const filteredEscritorios = escritorios.filter((escritorio) => {
    const searchLower = searchTerm.toLowerCase();
    const searchDigits = searchTerm.replace(/\D/g, '');
    const matchesSearch =
      escritorio.nomeFantasia.toLowerCase().includes(searchLower) ||
      escritorio.razaoSocial.toLowerCase().includes(searchLower) ||
      escritorio.email.toLowerCase().includes(searchLower) ||
      escritorio.cnpj.includes(searchTerm) ||
      (searchDigits.length > 0 &&
        (escritorio.cnpj.replace(/\D/g, '').includes(searchDigits) ||
          escritorio.telefone.replace(/\D/g, '').includes(searchDigits)));

    const matchesStatus = statusFilter === 'todos' || escritorio.status === statusFilter;
    const matchesCity = cityFilter === 'todas' || escritorio.cidade === cityFilter;

    return matchesSearch && matchesStatus && matchesCity;
  });

  // Paginar
  const paginatedEscritorios = filteredEscritorios.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Cidades únicas
  const cidades = Array.from(new Set(escritorios.map((e) => e.cidade).filter(Boolean))).sort();

  const hasActiveFilters = searchTerm || statusFilter !== 'todos' || cityFilter !== 'todas';

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Escritórios</h1>
            <p className="text-gray-600 mt-2">Gerencie todos os escritórios contábeis cadastrados no Unnify Conecta.</p>
          </div>
          <button className="self-start shrink-0 min-h-11 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-4 rounded-lg flex items-center gap-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2">
            <span>+</span> Novo escritório
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-orange-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Total de escritórios</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{totalEscritorios}</p>
                <p className="text-xs text-green-600 font-semibold mt-2">
                  {novosNoMes} {novosNoMes === 1 ? 'cadastrado' : 'cadastrados'} este mês
                </p>
              </div>
              <span className="text-2xl">🏢</span>
            </div>
          </div>

          <div className="bg-green-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Escritórios ativos</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{ativosCount}</p>
                <p className="text-xs text-green-700 font-semibold mt-2">
                  {totalEscritorios > 0 ? ((ativosCount / totalEscritorios) * 100).toFixed(1) : '0'}% do total
                </p>
              </div>
              <span className="text-2xl">✓</span>
            </div>
          </div>

          <div className="bg-orange-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Escritórios pendentes</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{pendentesCount}</p>
                <p className="text-xs text-orange-700 font-semibold mt-2">
                  {totalEscritorios > 0 ? ((pendentesCount / totalEscritorios) * 100).toFixed(1) : '0'}% do total
                </p>
              </div>
              <span className="text-2xl">⏱</span>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Escritórios inativos</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{inativosCount}</p>
                <p className="text-xs text-red-700 font-semibold mt-2">
                  {totalEscritorios > 0 ? ((inativosCount / totalEscritorios) * 100).toFixed(1) : '0'}% do total
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
              aoMudar={(v) => {
                setSearchTerm(v);
                setCurrentPage(1);
              }}
              placeholder="Buscar por razão social, nome fantasia, CNPJ, telefone ou e-mail..."
            />
            <FiltroSelect
              valor={statusFilter}
              aoMudar={(v) => {
                setStatusFilter(v);
                setCurrentPage(1);
              }}
            >
              <option value="todos">Status: Todos</option>
              <option value="ativo">Ativo</option>
              <option value="pendente">Pendente</option>
              <option value="inativo">Inativo</option>
              <option value="sem_status">Sem status</option>
            </FiltroSelect>
            <FiltroSelect
              icone={IconeCidade}
              valor={cityFilter}
              aoMudar={(v) => {
                setCityFilter(v);
                setCurrentPage(1);
              }}
            >
              <option value="todas">Cidade: Todas</option>
              {cidades.map((cidade) => (
                <option key={cidade} value={cidade}>
                  {cidade}
                </option>
              ))}
            </FiltroSelect>
            {hasActiveFilters && (
              <BotaoLimparFiltros
                aoClicar={() => {
                  setSearchTerm('');
                  setStatusFilter('todos');
                  setCityFilter('todas');
                  setCurrentPage(1);
                }}
              />
            )}
          </BarraFiltros>

          <EstadoTabela
            carregando={loading}
            erro={error}
            vazio={filteredEscritorios.length === 0}
            mensagemVazio={
              hasActiveFilters
                ? 'Nenhum escritório encontrado com os filtros aplicados.'
                : 'Nenhum escritório cadastrado ainda.'
            }
          >
            <Tabela
              colunas={[
                { titulo: 'Escritório' },
                { titulo: 'Responsável' },
                { titulo: 'Contato' },
                { titulo: 'Cidade/UF' },
                { titulo: 'Contadores', alinhar: 'centro' },
                { titulo: 'Empresas', alinhar: 'centro' },
                { titulo: 'Status' },
                { titulo: 'Cadastro' },
                { titulo: 'Ações', alinhar: 'centro' },
              ]}
            >
              {paginatedEscritorios.map((escritorio, i) => (
                <Linha key={escritorio.id}>
                  <Celula>
                    <CelulaNome
                      nome={escritorio.nomeFantasia}
                      indice={(currentPage - 1) * itemsPerPage + i}
                      detalhes={[escritorio.razaoSocial, `CNPJ ${escritorio.cnpj}`]}
                    />
                  </Celula>
                  <Celula>{escritorio.responsavel}</Celula>
                  <Celula>
                    <CelulaContato telefone={escritorio.telefone} email={escritorio.email} />
                  </Celula>
                  <Celula>
                    <CelulaCidade cidade={escritorio.cidade} uf={escritorio.uf} />
                  </Celula>
                  <Celula alinhar="centro">
                    <Contagem valor={escritorio.contadores} />
                  </Celula>
                  <Celula alinhar="centro">
                    <Contagem valor={null} />
                  </Celula>
                  <Celula>
                    <Selo tipo={SELO_STATUS[escritorio.status]} texto={STATUS_LABEL[escritorio.status]} />
                  </Celula>
                  <Celula className="whitespace-nowrap">
                    {new Date(escritorio.criadoEm).toLocaleDateString('pt-BR')}
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
              total={filteredEscritorios.length}
            />
          </EstadoTabela>
        </TabelaCard>
      </div>
    </AdminLayout>
  );
}
