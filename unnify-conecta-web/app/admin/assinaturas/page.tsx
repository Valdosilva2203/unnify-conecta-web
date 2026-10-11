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

          <EstadoTabela vazio={filteredAssinaturas.length === 0} mensagemVazio="Nenhuma assinatura encontrada.">
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
