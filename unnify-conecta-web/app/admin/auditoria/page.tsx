'use client';

import { useState } from 'react';
import { Search, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';

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
  const totalPages = Math.ceil(filteredEventos.length / itemsPerPage);

  const getResultadoColor = (resultado: string) => {
    switch (resultado) {
      case 'sucesso':
        return 'bg-green-100 text-green-800';
      case 'falha':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getResultadoDot = (resultado: string) => {
    switch (resultado) {
      case 'sucesso':
        return '🟢';
      case 'falha':
        return '🔴';
      default:
        return '⚪';
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Auditoria</h1>
            <p className="text-gray-600 mt-2">Acompanhe o histórico de atividades realizadas no Unnify Conecta.</p>
          </div>
          <button className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center gap-2 transition">
            <span>⬇</span> Exportar relatório
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

        {/* Filtros */}
        <div className="bg-white rounded-lg p-4 space-y-4">
          <div className="flex flex-col lg:flex-row gap-4 items-end">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por usuário, ação ou endereço IP..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              />
            </div>

            <select
              value={tipoEventoFilter}
              onChange={(e) => {
                setTipoEventoFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
            >
              <option value="todos">Tipo de evento: Todos</option>
              <option value="autenticacao">Autenticação</option>
              <option value="empresas">Empresas</option>
              <option value="usuarios">Usuários</option>
              <option value="assinaturas">Assinaturas</option>
              <option value="documentos">Documentos</option>
              <option value="relatorios">Relatórios</option>
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
              <option value="mes-atual">Este mês</option>
              <option value="ultimos-7">Últimos 7 dias</option>
              <option value="ultimos-30">Últimos 30 dias</option>
            </select>

            <select
              value={resultadoFilter}
              onChange={(e) => {
                setResultadoFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
            >
              <option value="todos">Resultado: Todos</option>
              <option value="sucesso">Sucesso</option>
              <option value="falha">Falha</option>
            </select>

            {(searchTerm || tipoEventoFilter !== 'todos' || periodoFilter !== 'todos' || resultadoFilter !== 'todos') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setTipoEventoFilter('todos');
                  setPeriodoFilter('todos');
                  setResultadoFilter('todos');
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
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Data e hora</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Usuário</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Evento</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Módulo</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Endereço IP</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Resultado</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedEventos.map((evento) => (
                  <tr key={evento.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <input type="checkbox" className="rounded" />
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-sm font-medium">{evento.dataHora}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-xs font-semibold">
                          {evento.usuarioId}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{evento.usuarioNome}</p>
                          <p className="text-xs text-gray-500">{evento.usuarioRole}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${evento.eventoBadgeColor}`}>
                        {evento.evento}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-sm">{evento.modulo}</td>
                    <td className="px-4 py-3 text-gray-700 text-sm">{evento.enderecoIp}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${getResultadoColor(
                          evento.resultado
                        )}`}
                      >
                        {getResultadoDot(evento.resultado)} {evento.resultado.charAt(0).toUpperCase() + evento.resultado.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="max-w-xs line-clamp-2">{evento.detalhes}</span>
                        <button className="text-gray-600 hover:text-gray-900 p-1" title="Ver detalhes">
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="border-t border-gray-200 px-4 py-4 flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Mostrando {((currentPage - 1) * itemsPerPage) + 1} de {filteredEventos.length} eventos
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
