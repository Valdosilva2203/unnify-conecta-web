'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
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


export default function AuditoriaPage() {
  // Eventos REAIS da tabela de auditoria (o banco não guarda IP nem resultado: esses campos ficam como "—" / registrado)
  const [eventos, setEventos] = useState<AuditoriaEvento[]>([]);
  useEffect(() => {
    const supabase = createClient();
    const MODULOS: Record<string, string> = { empresas: 'Empresas', perfis: 'Usuários', usuarios_empresas: 'Usuários', vinculos_contabeis: 'Usuários', documentos_empresa: 'Documentos' };
    const ACOES: Record<string, [string, string]> = { INSERT: ['Inclusão de registro', 'bg-green-100 text-green-800'], UPDATE: ['Alteração de registro', 'bg-blue-100 text-blue-800'], DELETE: ['Exclusão de registro', 'bg-red-100 text-red-800'] };
    supabase.from('auditoria').select('id, id_usuario, acao, nome_tabela, id_registro, criado_em').order('criado_em', { ascending: false }).limit(500).then(async ({ data }) => {
      const linhas = data ?? [];
      const ids = [...new Set(linhas.map((l) => l.id_usuario as string | null).filter((x): x is string => !!x))];
      const nomes = new Map<string, { nome: string; papel: string }>();
      if (ids.length) {
        const { data: ps } = await supabase.from('perfis').select('id_usuario, nome_completo, email, funcao_global, tipo_usuario').in('id_usuario', ids);
        for (const p of ps ?? []) nomes.set(p.id_usuario as string, { nome: (p.nome_completo as string | null) || (p.email as string) || 'Usuário',
          papel: p.funcao_global === 'admin_master' ? 'Administrador Master' : p.funcao_global === 'admin' ? 'Administrador' : p.tipo_usuario === 'contador' ? 'Contador' : 'Empresário' });
      }
      setEventos(linhas.map((l) => {
        const quem = nomes.get(l.id_usuario as string) ?? { nome: 'Sistema', papel: '—' };
        const [evento, cor] = ACOES[String(l.acao).toUpperCase()] ?? [String(l.acao), 'bg-gray-100 text-gray-800'];
        return {
          id: l.id as string, dataHora: new Date(l.criado_em as string).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
          usuarioNome: quem.nome, usuarioId: quem.nome.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase(), usuarioRole: quem.papel,
          evento, eventoBadgeColor: cor, modulo: MODULOS[l.nome_tabela as string] ?? String(l.nome_tabela), enderecoIp: '—', resultado: 'sucesso',
          detalhes: `Tabela ${l.nome_tabela}${l.id_registro ? ` · registro ${String(l.id_registro).slice(0, 8)}` : ''}`,
        };
      }));
    });
  }, []);
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoEventoFilter, setTipoEventoFilter] = useState('todos');
  const [periodoFilter, setPeriodoFilter] = useState('todos');
  const [resultadoFilter, setResultadoFilter] = useState('todos');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Calcular stats
  const totalEventos = eventos.length;
  const acessos = eventos.filter((e) => e.modulo === 'Autenticação').length;
  const alteracoes = eventos.filter((e) =>
    e.evento.includes('Alteração') || e.evento.includes('Exclusão') || e.evento.includes('Inclusão')
  ).length;
  const seguranca = eventos.filter((e) =>
    e.evento.includes('Tentativa') || e.resultado === 'falha'
  ).length;

  // Filtrar eventos
  const filteredEventos = eventos.filter((evento) => {
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
