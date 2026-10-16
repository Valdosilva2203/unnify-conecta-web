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
  IconePlano,
  SELO_PLANO,
  type TipoSelo,
} from '@/components/admin/tabela';

const SELO_ASSINATURA: Record<string, TipoSelo> = {
  ativa: 'sucesso',
  pendente: 'alerta',
  cancelada: 'perigo',
};

const ROTULO_ASSINATURA: Record<string, string> = {
  ativa: 'Ativa',
  pendente: 'Pendente',
  cancelada: 'Cancelada',
};

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


export default function AssinaturasPage() {
  // Ainda não existe cadastro de assinaturas no sistema: a lista fica vazia (nada fictício).
  const assinaturas: Assinatura[] = [];
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [planoFilter, setPlanoFilter] = useState('todos');
  const [periodoFilter, setPeriodoFilter] = useState('todos');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Calcular stats
  const totalAssinaturas = assinaturas.length;
  const ativasCount = assinaturas.filter((a) => a.status === 'ativa').length;
  const pendentesCount = assinaturas.filter((a) => a.status === 'pendente').length;
  const canceladasCount = assinaturas.filter((a) => a.status === 'cancelada').length;

  // Filtrar assinaturas
  const filteredAssinaturas = assinaturas.filter((assinatura) => {
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

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Assinaturas</h1>
            <p className="text-gray-600 mt-2">Gerencie todas as assinaturas das empresas cadastradas no Unnify Conecta.</p>
          </div>
          <button className="self-start shrink-0 min-h-11 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-4 rounded-lg flex items-center gap-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2">
            <span>+</span> Nova assinatura
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
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

        <TabelaCard>
          <BarraFiltros>
            <CampoBusca
              valor={searchTerm}
              aoMudar={(v) => {
                setSearchTerm(v);
                setCurrentPage(1);
              }}
              placeholder="Buscar por empresa, CNPJ ou plano..."
            />
            <FiltroSelect
              valor={statusFilter}
              aoMudar={(v) => {
                setStatusFilter(v);
                setCurrentPage(1);
              }}
            >
              <option value="todos">Status: Todos</option>
              <option value="ativa">Ativa</option>
              <option value="pendente">Pendente</option>
              <option value="cancelada">Cancelada</option>
            </FiltroSelect>
            <FiltroSelect
              icone={IconePlano}
              valor={planoFilter}
              aoMudar={(v) => {
                setPlanoFilter(v);
                setCurrentPage(1);
              }}
            >
              <option value="todos">Plano: Todos</option>
              <option value="basico">Básico</option>
              <option value="pro">Pro</option>
              <option value="premium">Premium</option>
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
              <option value="este-mes">Este mês</option>
              <option value="ultimos-3-meses">Últimos 3 meses</option>
              <option value="este-ano">Este ano</option>
            </FiltroSelect>
            {(searchTerm || statusFilter !== 'todos' || planoFilter !== 'todos' || periodoFilter !== 'todos') && (
              <BotaoLimparFiltros
                aoClicar={() => {
                  setSearchTerm('');
                  setStatusFilter('todos');
                  setPlanoFilter('todos');
                  setPeriodoFilter('todos');
                  setCurrentPage(1);
                }}
              />
            )}
          </BarraFiltros>

          <EstadoTabela vazio={filteredAssinaturas.length === 0} mensagemVazio="Ainda não há assinaturas cadastradas no sistema.">
            <Tabela
              colunas={[
                { titulo: 'Empresa' },
                { titulo: 'Plano' },
                { titulo: 'Valor' },
                { titulo: 'Início' },
                { titulo: 'Próxima cobrança' },
                { titulo: 'Status' },
                { titulo: 'Ações', alinhar: 'centro' },
              ]}
            >
              {paginatedAssinaturas.map((assinatura, i) => (
                <Linha key={assinatura.id}>
                  <Celula>
                    <CelulaNome
                      nome={assinatura.nomeFantasia}
                      detalhes={[assinatura.razaoSocial, `CNPJ ${assinatura.cnpj}`]}
                      indice={(currentPage - 1) * itemsPerPage + i}
                    />
                  </Celula>
                  <Celula>
                    <Selo tipo={SELO_PLANO[assinatura.plano]} texto={assinatura.plano} />
                  </Celula>
                  <Celula className="font-semibold whitespace-nowrap">
                    {assinatura.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </Celula>
                  <Celula className="whitespace-nowrap">{assinatura.dataInicio}</Celula>
                  <Celula className="whitespace-nowrap">{assinatura.proximaCobranca}</Celula>
                  <Celula>
                    <Selo tipo={SELO_ASSINATURA[assinatura.status]} texto={ROTULO_ASSINATURA[assinatura.status]} />
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
              total={filteredAssinaturas.length}
            />
          </EstadoTabela>
        </TabelaCard>
      </div>
    </AdminLayout>
  );
}
