'use client';

import { useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import {
  BarraFiltros,
  BotaoLimparFiltros,
  BotoesAcao,
  CampoBusca,
  Celula,
  CelulaNome,
  EstadoTabela,
  FiltroSelect,
  Linha,
  Paginacao,
  Selo,
  Tabela,
  TabelaCard,
  IconeData,
  IconeTipo,
  SELO_PLANO,
  moeda,
  type TipoSelo,
} from '@/components/admin/tabela';

const SELO_COMISSAO: Record<string, TipoSelo> = {
  paga: 'sucesso',
  pendente: 'alerta',
  cancelada: 'perigo',
};

const ROTULO_COMISSAO: Record<string, string> = {
  paga: 'Paga',
  pendente: 'Pendente',
  cancelada: 'Cancelada',
};

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


export default function ComissoesPage() {
  // Ainda não existe cadastro de comissões no sistema: a lista fica vazia (nada fictício).
  const comissoes: Comissao[] = [];
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [tipoFilter, setTipoFilter] = useState('todos');
  const [periodoFilter, setPeriodoFilter] = useState('todos');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Calcular stats
  const totalComissoes = comissoes.reduce((sum, c) => sum + c.comissao, 0);
  const pagasComissoes = comissoes
    .filter((c) => c.status === 'paga')
    .reduce((sum, c) => sum + c.comissao, 0);
  const pendentesComissoes = comissoes
    .filter((c) => c.status === 'pendente')
    .reduce((sum, c) => sum + c.comissao, 0);
  const canceladasComissoes = comissoes
    .filter((c) => c.status === 'cancelada')
    .reduce((sum, c) => sum + c.comissao, 0);

  // Filtrar comissões
  const filteredComissoes = comissoes.filter((comissao) => {
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

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Comissões</h1>
            <p className="text-gray-600 mt-2">Gerencie todas as comissões geradas por indicações de contadores e parceiros.</p>
          </div>
          <button className="self-start shrink-0 min-h-11 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-4 rounded-lg flex items-center gap-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2">
            <span>+</span> Nova comissão
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
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

        <TabelaCard>
          <BarraFiltros>
            <CampoBusca
              valor={searchTerm}
              aoMudar={(v) => {
                setSearchTerm(v);
                setCurrentPage(1);
              }}
              placeholder="Buscar por contador, parceiro ou empresa..."
            />
            <FiltroSelect
              valor={statusFilter}
              aoMudar={(v) => {
                setStatusFilter(v);
                setCurrentPage(1);
              }}
            >
              <option value="todos">Status: Todos</option>
              <option value="paga">Paga</option>
              <option value="pendente">Pendente</option>
              <option value="cancelada">Cancelada</option>
            </FiltroSelect>
            <FiltroSelect
              icone={IconeTipo}
              valor={tipoFilter}
              aoMudar={(v) => {
                setTipoFilter(v);
                setCurrentPage(1);
              }}
            >
              <option value="todos">Tipo: Todos</option>
              <option value="contador">Contador</option>
              <option value="parceiro">Parceiro</option>
            </FiltroSelect>
            <FiltroSelect
              icone={IconeData}
              valor={periodoFilter}
              aoMudar={(v) => {
                setPeriodoFilter(v);
                setCurrentPage(1);
              }}
            >
              <option value="todos">Período: Todos</option>
              <option value="mes-atual">Mês atual</option>
              <option value="ultimos-3">Últimos 3 meses</option>
              <option value="ano">Ano atual</option>
            </FiltroSelect>
            {(searchTerm || statusFilter !== 'todos' || tipoFilter !== 'todos' || periodoFilter !== 'todos') && (
              <BotaoLimparFiltros
                aoClicar={() => {
                  setSearchTerm('');
                  setStatusFilter('todos');
                  setTipoFilter('todos');
                  setPeriodoFilter('todos');
                  setCurrentPage(1);
                }}
              />
            )}
          </BarraFiltros>

          <EstadoTabela vazio={filteredComissoes.length === 0} mensagemVazio="Ainda não há comissões cadastradas no sistema.">
            <Tabela
              colunas={[
                { titulo: 'Beneficiário' },
                { titulo: 'Empresa indicada' },
                { titulo: 'Plano' },
                { titulo: 'Mensalidade' },
                { titulo: 'Comissão' },
                { titulo: 'Competência' },
                { titulo: 'Status' },
                { titulo: 'Pagamento' },
                { titulo: 'Ações', alinhar: 'centro' },
              ]}
            >
              {paginatedComissoes.map((comissao, i) => (
                <Linha key={comissao.id}>
                  <Celula>
                    <CelulaNome
                      nome={comissao.beneficiarioNome}
                      detalhes={[comissao.tipo]}
                      indice={(currentPage - 1) * itemsPerPage + i}
                    />
                  </Celula>
                  <Celula>{comissao.empresaIndicada}</Celula>
                  <Celula>
                    <Selo tipo={SELO_PLANO[comissao.plano]} texto={comissao.plano} />
                  </Celula>
                  <Celula className="whitespace-nowrap">{moeda(comissao.mensalidade)}</Celula>
                  <Celula className="font-semibold whitespace-nowrap">{moeda(comissao.comissao)}</Celula>
                  <Celula>{comissao.competencia}</Celula>
                  <Celula>
                    <Selo tipo={SELO_COMISSAO[comissao.status]} texto={ROTULO_COMISSAO[comissao.status]} />
                  </Celula>
                  <Celula className="whitespace-nowrap">
                    {comissao.dataPagamento || <span className="text-gray-400">—</span>}
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
              total={filteredComissoes.length}
            />
          </EstadoTabela>
        </TabelaCard>
      </div>
    </AdminLayout>
  );
}
