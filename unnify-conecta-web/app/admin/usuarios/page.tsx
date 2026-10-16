'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
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
  IconeCategoria,
  IconeData,
  IconeTipo,
  ROTULO_STATUS,
  SELO_STATUS,
  type TipoSelo,
} from '@/components/admin/tabela';

const SELO_PERFIL: Record<string, TipoSelo> = {
  'Admin Master': 'perigo',
  Administrador: 'roxo',
  Usuário: 'info',
};

const SELO_TIPO_CONTA: Record<string, TipoSelo> = {
  'Admin Master': 'perigo',
  Administrador: 'roxo',
  Contador: 'info',
  Empresário: 'sucesso',
};

interface Usuario {
  id: string;
  nome: string;
  profissao: string;
  email: string;
  perfil: 'Admin Master' | 'Administrador' | 'Usuário';
  tipoConta: 'Admin Master' | 'Administrador' | 'Contador' | 'Empresário';
  vinculacao: string | null;
  status: 'ativo' | 'pendente' | 'inativo';
  ultimoAcesso: string;
  cadastro: string;
  avatar: string;
}


export default function UsuariosPage() {
  // Usuários REAIS (perfis): o banco só entrega ao Admin Master o que as políticas permitem
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregandoUsuarios, setCarregandoUsuarios] = useState(true);
  const [erroUsuarios, setErroUsuarios] = useState<string | null>(null);
  useEffect(() => {
    const supabase = createClient();
    const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).replace(', ', ' às ') : '—');
    Promise.all([
      supabase.from('perfis').select('id_usuario, nome_completo, email, funcao_global, tipo_usuario, status, criado_em').order('criado_em', { ascending: false }),
      supabase.from('usuarios_empresas').select('id_usuario, empresas(nome_comercial, razao_social)').eq('ativo', true),
    ]).then(([perfis, vinculos]) => {
      if (perfis.error) { setErroUsuarios('Não foi possível carregar os usuários.'); setCarregandoUsuarios(false); return; }
      const empresaDe = new Map<string, string>();
      for (const v of (vinculos.data ?? []) as unknown as { id_usuario: string; empresas: { nome_comercial: string | null; razao_social: string } | null }[]) {
        if (v.empresas && !empresaDe.has(v.id_usuario)) empresaDe.set(v.id_usuario, v.empresas.nome_comercial || v.empresas.razao_social);
      }
      setUsuarios((perfis.data ?? []).map((u) => {
        const funcao = u.funcao_global as string | null;
        const perfil: Usuario['perfil'] = funcao === 'admin_master' ? 'Admin Master' : funcao === 'admin' ? 'Administrador' : 'Usuário';
        const tipoConta: Usuario['tipoConta'] = funcao === 'admin_master' ? 'Admin Master' : funcao === 'admin' ? 'Administrador' : u.tipo_usuario === 'contador' ? 'Contador' : 'Empresário';
        const nome = (u.nome_completo as string | null) || (u.email as string | null) || 'Usuário';
        return {
          id: u.id_usuario as string, nome, profissao: tipoConta, email: (u.email as string | null) ?? '', perfil, tipoConta,
          vinculacao: empresaDe.get(u.id_usuario as string) ?? null,
          status: u.status === 'active' ? 'ativo' : u.status === 'pending' ? 'pendente' : 'inativo',
          ultimoAcesso: '—', // o último acesso não fica registrado nos perfis
          cadastro: quando(u.criado_em as string | null),
          avatar: nome.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase(),
        };
      }));
      setCarregandoUsuarios(false);
    });
  }, []);
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState('todos');
  const [perfilFilter, setPerfilFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [cadastroFilter, setCadastroFilter] = useState('todos');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Calcular stats
  const totalUsuarios = usuarios.length;
  const ativosCount = usuarios.filter((u) => u.status === 'ativo').length;
  const pendentesCount = usuarios.filter((u) => u.status === 'pendente').length;
  const inativos = usuarios.filter((u) => u.status === 'inativo').length;

  // Filtrar usuários
  const filteredUsuarios = usuarios.filter((usuario) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      usuario.nome.toLowerCase().includes(searchLower) ||
      usuario.email.toLowerCase().includes(searchLower) ||
      (usuario.vinculacao?.toLowerCase().includes(searchLower) ?? false);

    const matchesTipo =
      tipoFilter === 'todos' ||
      (tipoFilter === 'admin-master' && usuario.tipoConta === 'Admin Master') ||
      (tipoFilter === 'admin' && usuario.tipoConta === 'Administrador') ||
      (tipoFilter === 'contador' && usuario.tipoConta === 'Contador') ||
      (tipoFilter === 'empresario' && usuario.tipoConta === 'Empresário');

    const matchesPerfil =
      perfilFilter === 'todos' ||
      (perfilFilter === 'admin-master' && usuario.perfil === 'Admin Master') ||
      (perfilFilter === 'admin' && usuario.perfil === 'Administrador') ||
      (perfilFilter === 'usuario' && usuario.perfil === 'Usuário');

    const matchesStatus =
      statusFilter === 'todos' ||
      (statusFilter === 'ativo' && usuario.status === 'ativo') ||
      (statusFilter === 'pendente' && usuario.status === 'pendente') ||
      (statusFilter === 'inativo' && usuario.status === 'inativo');

    const matchesCadastro = cadastroFilter === 'todos';

    return matchesSearch && matchesTipo && matchesPerfil && matchesStatus && matchesCadastro;
  });

  // Paginar
  const paginatedUsuarios = filteredUsuarios.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Usuários</h1>
            <p className="text-gray-600 mt-2">Gerencie todos os usuários da plataforma Unnify Conecta.</p>
          </div>
          <button className="self-start shrink-0 min-h-11 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-4 rounded-lg flex items-center gap-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2">
            <span>+</span> Novo usuário
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-orange-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Total de usuários</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{totalUsuarios}</p>
                <p className="text-xs text-green-600 font-semibold mt-2">↑ +20% em relação ao mês anterior</p>
              </div>
              <span className="text-2xl">👥</span>
            </div>
          </div>

          <div className="bg-green-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Usuários ativos</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{ativosCount}</p>
                <p className="text-xs text-green-700 font-semibold mt-2">
                  {((ativosCount / totalUsuarios) * 100).toFixed(1)}% do total
                </p>
              </div>
              <span className="text-2xl">✓</span>
            </div>
          </div>

          <div className="bg-orange-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Usuários pendentes</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{pendentesCount}</p>
                <p className="text-xs text-orange-700 font-semibold mt-2">
                  {((pendentesCount / totalUsuarios) * 100).toFixed(1)}% do total
                </p>
              </div>
              <span className="text-2xl">⏱</span>
            </div>
          </div>

          <div className="bg-red-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Usuários inativos</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{inativos}</p>
                <p className="text-xs text-red-700 font-semibold mt-2">
                  {((inativos / totalUsuarios) * 100).toFixed(1)}% do total
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
              placeholder="Buscar por nome, e-mail ou empresa..."
            />
            <FiltroSelect
              icone={IconeTipo}
              valor={tipoFilter}
              aoMudar={(v) => {
                setTipoFilter(v);
                setCurrentPage(1);
              }}
            >
              <option value="todos">Tipo: Todos</option>
              <option value="admin-master">Admin Master</option>
              <option value="admin">Administrador</option>
              <option value="contador">Contador</option>
              <option value="empresario">Empresário</option>
            </FiltroSelect>
            <FiltroSelect
              icone={IconeCategoria}
              valor={perfilFilter}
              aoMudar={(v) => {
                setPerfilFilter(v);
                setCurrentPage(1);
              }}
            >
              <option value="todos">Perfil: Todos</option>
              <option value="admin-master">Admin Master</option>
              <option value="admin">Administrador</option>
              <option value="usuario">Usuário</option>
            </FiltroSelect>
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
            </FiltroSelect>
            <FiltroSelect
              icone={IconeData}
              valor={cadastroFilter}
              aoMudar={(v) => {
                setCadastroFilter(v);
                setCurrentPage(1);
              }}
            >
              <option value="todos">Cadastro: Todos</option>
              <option value="mes-atual">Este mês</option>
              <option value="ultimos-3">Últimos 3 meses</option>
              <option value="ano">Este ano</option>
            </FiltroSelect>
            {(searchTerm || tipoFilter !== 'todos' || perfilFilter !== 'todos' || statusFilter !== 'todos' || cadastroFilter !== 'todos') && (
              <BotaoLimparFiltros
                aoClicar={() => {
                  setSearchTerm('');
                  setTipoFilter('todos');
                  setPerfilFilter('todos');
                  setStatusFilter('todos');
                  setCadastroFilter('todos');
                  setCurrentPage(1);
                }}
              />
            )}
          </BarraFiltros>

          <EstadoTabela carregando={carregandoUsuarios} erro={erroUsuarios} vazio={filteredUsuarios.length === 0} mensagemVazio="Nenhum usuário encontrado.">
            <Tabela
              colunas={[
                { titulo: 'Usuário' },
                { titulo: 'Perfil' },
                { titulo: 'Tipo de conta' },
                { titulo: 'Vinculação' },
                { titulo: 'Status' },
                { titulo: 'Último acesso' },
                { titulo: 'Cadastro' },
                { titulo: 'Ações', alinhar: 'centro' },
              ]}
            >
              {paginatedUsuarios.map((usuario, i) => (
                <Linha key={usuario.id}>
                  <Celula>
                    <CelulaNome
                      nome={usuario.nome}
                      detalhes={[usuario.profissao, usuario.email]}
                      indice={(currentPage - 1) * itemsPerPage + i}
                    />
                  </Celula>
                  <Celula>
                    <Selo tipo={SELO_PERFIL[usuario.perfil]} texto={usuario.perfil} />
                  </Celula>
                  <Celula>
                    <Selo tipo={SELO_TIPO_CONTA[usuario.tipoConta]} texto={usuario.tipoConta} />
                  </Celula>
                  <Celula>{usuario.vinculacao || <span className="text-gray-400">—</span>}</Celula>
                  <Celula>
                    <Selo tipo={SELO_STATUS[usuario.status]} texto={ROTULO_STATUS[usuario.status]} />
                  </Celula>
                  <Celula>{usuario.ultimoAcesso}</Celula>
                  <Celula>{usuario.cadastro}</Celula>
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
              total={filteredUsuarios.length}
            />
          </EstadoTabela>
        </TabelaCard>
      </div>
    </AdminLayout>
  );
}
