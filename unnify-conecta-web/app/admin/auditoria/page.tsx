'use client';

import { useState } from 'react';
import { Eye } from 'lucide-react';
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
  BotaoIcone,
  IconeCategoria,
  IconeData,
  seloDaCor,
} from '@/components/admin/tabela';

interface AuditoriaEvento {
  id: string;
  dataHora: string;
  usuarioNome: string;
  usuarioId: string;
  usuarioRole: string;
  evento: string;
  eventoBadgeColor: string;
  modulo: string;
  enderecoIp: string;
  resultado: 'sucesso' | 'falha';
  detalhes: string;
}

const eventosFicticios: AuditoriaEvento[] = [
  {
    id: '1',
    dataHora: '10/10/2026 14:20:35',
    usuarioNome: 'Vado Silva',
    usuarioId: 'VS',
    usuarioRole: 'Administrador Master',
    evento: 'Login no sistema',
    eventoBadgeColor: 'bg-blue-100 text-blue-800',
    modulo: 'Autenticação',
    enderecoIp: '179.189.25.14',
    resultado: 'sucesso',
    detalhes: 'Login realizado com sucesso via navegador Chrome.',
  },
  {
    id: '2',
    dataHora: '10/10/2026 14:18:12',
    usuarioNome: 'Ana Clara Souza',
    usuarioId: 'AC',
    usuarioRole: 'Contadora',
    evento: 'Alteração de empresa',
    eventoBadgeColor: 'bg-orange-100 text-orange-800',
    modulo: 'Empresas',
    enderecoIp: '179.189.25.14',
    resultado: 'sucesso',
    detalhes: 'Dados da empresa ABC LTDA foram atualizados.',
  },
  {
    id: '3',
    dataHora: '10/10/2026 13:45:03',
    usuarioNome: 'Ricardo Sousa',
    usuarioId: 'RS',
    usuarioRole: 'Parceiro',
    evento: 'Inclusão de usuário',
    eventoBadgeColor: 'bg-green-100 text-green-800',
    modulo: 'Usuários',
    enderecoIp: '187.62.33.51',
    resultado: 'sucesso',
    detalhes: 'Novo usuário, João Martins foi cadastrado.',
  },
  {
    id: '4',
    dataHora: '10/10/2026 12:33:18',
    usuarioNome: 'João Martins',
    usuarioId: 'JM',
    usuarioRole: 'Empresário',
    evento: 'Alteração de assinatura',
    eventoBadgeColor: 'bg-orange-100 text-orange-800',
    modulo: 'Assinaturas',
    enderecoIp: '179.189.25.14',
    resultado: 'sucesso',
    detalhes: 'Plano da empresa Mercado Almeida foi alterado para Premium.',
  },
  {
    id: '5',
    dataHora: '10/10/2026 11:12:47',
    usuarioNome: 'Fernanda Silva',
    usuarioId: 'FS',
    usuarioRole: 'Contadora',
    evento: 'Exclusão de documento',
    eventoBadgeColor: 'bg-red-100 text-red-800',
    modulo: 'Documentos',
    enderecoIp: '200.217.18.90',
    resultado: 'sucesso',
    detalhes: 'Documento "Contrato.pdf" foi excluído.',
  },
  {
    id: '6',
    dataHora: '09/10/2026 18:25:30',
    usuarioNome: 'Diego Lima',
    usuarioId: 'DL',
    usuarioRole: 'Contador',
    evento: 'Tentativa de login',
    eventoBadgeColor: 'bg-yellow-100 text-yellow-800',
    modulo: 'Autenticação',
    enderecoIp: '201.48.102.77',
    resultado: 'falha',
    detalhes: 'Tentativa de login com senha inválida.',
  },
  {
    id: '7',
    dataHora: '09/10/2026 16:10:22',
    usuarioNome: 'Maria Vitória',
    usuarioId: 'MV',
    usuarioRole: 'Empresária',
    evento: 'Visualização de relatório',
    eventoBadgeColor: 'bg-purple-100 text-purple-800',
    modulo: 'Relatórios',
    enderecoIp: '179.189.25.14',
    resultado: 'sucesso',
    detalhes: 'Relatório de comissões visualizado.',
  },
  {
    id: '8',
    dataHora: '09/10/2026 15:47:19',
    usuarioNome: 'Carlos Santos',
    usuarioId: 'CS',
    usuarioRole: 'Contador',
    evento: 'Alteração de permissão',
    eventoBadgeColor: 'bg-indigo-100 text-indigo-800',
    modulo: 'Usuários',
    enderecoIp: '177.91.12.43',
    resultado: 'sucesso',
    detalhes: 'Permissões do usuário Lucas Mendes foram atualizadas.',
  },
  {
    id: '9',
    dataHora: '09/10/2026 14:30:11',
    usuarioNome: 'Paulo Ribeiro',
    usuarioId: 'PR',
    usuarioRole: 'Empresário',
    evento: 'Cadastro de empresa',
    eventoBadgeColor: 'bg-blue-100 text-blue-800',
    modulo: 'Empresas',
    enderecoIp: '179.189.25.14',
    resultado: 'sucesso',
    detalhes: 'Empresa Barbearia Reis LTDA foi cadastrada.',
  },
  {
    id: '10',
    dataHora: '09/10/2026 13:05:56',
    usuarioNome: 'Lucas Mendes',
    usuarioId: 'LM',
    usuarioRole: 'Empresário',
    evento: 'Alteração de plano',
    eventoBadgeColor: 'bg-orange-100 text-orange-800',
    modulo: 'Assinaturas',
    enderecoIp: '189.72.44.21',
    resultado: 'sucesso',
    detalhes: 'Plano alterado de Básico para Pro.',
  },
];

export default function AuditoriaPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoEventoFilter, setTipoEventoFilter] = useState('todos');
  const [periodoFilter, setPeriodoFilter] = useState('todos');
  const [resultadoFilter, setResultadoFilter] = useState('todos');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Calcular stats
  const totalEventos = eventosFicticios.length;
  const acessos = eventosFicticios.filter((e) => e.modulo === 'Autenticação').length;
  const alteracoes = eventosFicticios.filter((e) =>
    e.evento.includes('Alteração') || e.evento.includes('Exclusão') || e.evento.includes('Inclusão')
  ).length;
  const seguranca = eventosFicticios.filter((e) =>
    e.evento.includes('Tentativa') || e.resultado === 'falha'
  ).length;

  // Filtrar eventos
  const filteredEventos = eventosFicticios.filter((evento) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      evento.usuarioNome.toLowerCase().includes(searchLower) ||
      evento.evento.toLowerCase().includes(searchLower) ||
      evento.enderecoIp.includes(searchTerm);

    const matchesTipo =
      tipoEventoFilter === 'todos' ||
      (tipoEventoFilter === 'autenticacao' && evento.modulo === 'Autenticação') ||
      (tipoEventoFilter === 'empresas' && evento.modulo === 'Empresas') ||
      (tipoEventoFilter === 'usuarios' && evento.modulo === 'Usuários') ||
      (tipoEventoFilter === 'assinaturas' && evento.modulo === 'Assinaturas') ||
      (tipoEventoFilter === 'documentos' && evento.modulo === 'Documentos') ||
      (tipoEventoFilter === 'relatorios' && evento.modulo === 'Relatórios');

    const matchesPeriodo = periodoFilter === 'todos';

    const matchesResultado =
      resultadoFilter === 'todos' ||
      (resultadoFilter === 'sucesso' && evento.resultado === 'sucesso') ||
      (resultadoFilter === 'falha' && evento.resultado === 'falha');

    return matchesSearch && matchesTipo && matchesPeriodo && matchesResultado;
  });

  // Paginar
  const paginatedEventos = filteredEventos.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Auditoria</h1>
            <p className="text-gray-600 mt-2">Acompanhe o histórico de atividades realizadas no Unnify Conecta.</p>
          </div>
          <button className="self-start shrink-0 min-h-11 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-4 rounded-lg flex items-center gap-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2">
            <span>⬇</span> Exportar relatório
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-blue-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Total de eventos registrados</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{totalEventos.toLocaleString('pt-BR')}</p>
                <p className="text-xs text-green-600 font-semibold mt-2">↑ +12% em relação ao mês anterior</p>
              </div>
              <span className="text-2xl">📋</span>
            </div>
          </div>

          <div className="bg-green-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Acessos realizados</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{acessos}</p>
                <p className="text-xs text-green-700 font-semibold mt-2">
                  {((acessos / totalEventos) * 100).toFixed(1)}% do total
                </p>
              </div>
              <span className="text-2xl">👤</span>
            </div>
          </div>

          <div className="bg-orange-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Alterações de dados</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{alteracoes}</p>
                <p className="text-xs text-orange-700 font-semibold mt-2">
                  {((alteracoes / totalEventos) * 100).toFixed(1)}% do total
                </p>
              </div>
              <span className="text-2xl">📊</span>
            </div>
          </div>

          <div className="bg-red-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Eventos de segurança</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{seguranca}</p>
                <p className="text-xs text-red-700 font-semibold mt-2">
                  {((seguranca / totalEventos) * 100).toFixed(1)}% do total
                </p>
              </div>
              <span className="text-2xl">🛡</span>
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
              placeholder="Buscar por usuário, ação ou endereço IP..."
            />
            <FiltroSelect
              icone={IconeCategoria}
              valor={tipoEventoFilter}
              aoMudar={(v) => {
                setTipoEventoFilter(v);
                setCurrentPage(1);
              }}
            >
              <option value="todos">Tipo: Todos</option>
              <option value="autenticacao">Autenticação</option>
              <option value="empresas">Empresas</option>
              <option value="usuarios">Usuários</option>
              <option value="assinaturas">Assinaturas</option>
              <option value="documentos">Documentos</option>
              <option value="relatorios">Relatórios</option>
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
              <option value="mes-atual">Este mês</option>
              <option value="ultimos-7">Últimos 7 dias</option>
              <option value="ultimos-30">Últimos 30 dias</option>
            </FiltroSelect>
            <FiltroSelect
              valor={resultadoFilter}
              aoMudar={(v) => {
                setResultadoFilter(v);
                setCurrentPage(1);
              }}
            >
              <option value="todos">Resultado: Todos</option>
              <option value="sucesso">Sucesso</option>
              <option value="falha">Falha</option>
            </FiltroSelect>
            {(searchTerm || tipoEventoFilter !== 'todos' || periodoFilter !== 'todos' || resultadoFilter !== 'todos') && (
              <BotaoLimparFiltros
                aoClicar={() => {
                  setSearchTerm('');
                  setTipoEventoFilter('todos');
                  setPeriodoFilter('todos');
                  setResultadoFilter('todos');
                  setCurrentPage(1);
                }}
              />
            )}
          </BarraFiltros>

          <EstadoTabela vazio={filteredEventos.length === 0} mensagemVazio="Nenhum evento encontrado.">
            <Tabela
              colunas={[
                { titulo: 'Usuário' },
                { titulo: 'Data e hora' },
                { titulo: 'Evento' },
                { titulo: 'Módulo' },
                { titulo: 'Endereço IP' },
                { titulo: 'Resultado' },
                { titulo: 'Detalhes' },
                { titulo: 'Ações', alinhar: 'centro' },
              ]}
            >
              {paginatedEventos.map((evento, i) => (
                <Linha key={evento.id}>
                  <Celula>
                    <CelulaNome
                      nome={evento.usuarioNome}
                      detalhes={[evento.usuarioRole]}
                      indice={(currentPage - 1) * itemsPerPage + i}
                    />
                  </Celula>
                  <Celula className="whitespace-nowrap">{evento.dataHora}</Celula>
                  <Celula>
                    <Selo tipo={seloDaCor(evento.eventoBadgeColor)} texto={evento.evento} />
                  </Celula>
                  <Celula>{evento.modulo}</Celula>
                  <Celula className="whitespace-nowrap">{evento.enderecoIp}</Celula>
                  <Celula>
                    <Selo
                      tipo={evento.resultado === 'sucesso' ? 'sucesso' : 'perigo'}
                      texto={evento.resultado === 'sucesso' ? 'Sucesso' : 'Falha'}
                    />
                  </Celula>
                  <Celula className="text-gray-600">
                    <span className="block max-w-xs line-clamp-2">{evento.detalhes}</span>
                  </Celula>
                  <Celula alinhar="centro">
                    <BotaoIcone icone={Eye} titulo="Ver detalhes" />
                  </Celula>
                </Linha>
              ))}
            </Tabela>
            <Paginacao
              pagina={currentPage}
              aoMudarPagina={setCurrentPage}
              porPagina={itemsPerPage}
              aoMudarPorPagina={setItemsPerPage}
              total={filteredEventos.length}
            />
          </EstadoTabela>
        </TabelaCard>
      </div>
    </AdminLayout>
  );
}
