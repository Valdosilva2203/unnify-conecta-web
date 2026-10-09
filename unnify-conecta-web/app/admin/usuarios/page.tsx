'use client';

import { useState } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';

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

const usuariosFicticios: Usuario[] = [
  {
    id: '1',
    nome: 'Vado Silva',
    profissao: 'Administrador Master',
    email: 'vado@unnify.com.br',
    perfil: 'Admin Master',
    tipoConta: 'Admin Master',
    vinculacao: null,
    status: 'ativo',
    ultimoAcesso: '10/10/2026 às 14:20',
    cadastro: '10/01/2026 às 09:00',
    avatar: 'VS',
  },
  {
    id: '2',
    nome: 'Ana Clara Souza',
    profissao: 'Contadora',
    email: 'ana@claracontabil.com.br',
    perfil: 'Usuário',
    tipoConta: 'Contador',
    vinculacao: 'Clara Contábil Escritório',
    status: 'ativo',
    ultimoAcesso: '09/10/2026 às 16:45',
    cadastro: '12/02/2026 às 10:30',
    avatar: 'AC',
  },
  {
    id: '3',
    nome: 'Ricardo Sousa',
    profissao: 'Parceiro',
    email: 'ricardo@rsconsultoria.com.br',
    perfil: 'Usuário',
    tipoConta: 'Empresário',
    vinculacao: null,
    status: 'ativo',
    ultimoAcesso: '09/10/2026 às 11:10',
    cadastro: '18/02/2026 às 14:15',
    avatar: 'RS',
  },
  {
    id: '4',
    nome: 'João Martins',
    profissao: 'Empresário',
    email: 'joao@mercadoalmeida.com.br',
    perfil: 'Usuário',
    tipoConta: 'Empresário',
    vinculacao: 'Mercado Almeida LTDA',
    status: 'ativo',
    ultimoAcesso: '08/10/2026 às 09:30',
    cadastro: '05/03/2026 às 11:20',
    avatar: 'JM',
  },
  {
    id: '5',
    nome: 'Fernanda Silva',
    profissao: 'Contadora',
    email: 'fernanda@silvacontabil.com.br',
    perfil: 'Usuário',
    tipoConta: 'Contador',
    vinculacao: 'Silva Contabilidade Escritório',
    status: 'pendente',
    ultimoAcesso: '28/09/2026 às 16:10',
    cadastro: '-',
    avatar: 'FS',
  },
  {
    id: '6',
    nome: 'Paulo Ribeiro',
    profissao: 'Empresário',
    email: 'paulo@barbeariaseis.com.br',
    perfil: 'Usuário',
    tipoConta: 'Empresário',
    vinculacao: 'Barbearia Reis LTDA',
    status: 'ativo',
    ultimoAcesso: '07/10/2026 às 13:50',
    cadastro: '15/03/2026 às 09:40',
    avatar: 'PR',
  },
  {
    id: '7',
    nome: 'Lucas Mendes',
    profissao: 'Empresário',
    email: 'lucas@lojasilva.com.br',
    perfil: 'Usuário',
    tipoConta: 'Empresário',
    vinculacao: 'Loja Silva LTDA',
    status: 'inativo',
    ultimoAcesso: '22/09/2026 às 10:15',
    cadastro: '01/02/2026 às 17:30',
    avatar: 'LM',
  },
  {
    id: '8',
    nome: 'Carlos Santos',
    profissao: 'Contador',
    email: 'carlos@santoscont.com.br',
    perfil: 'Usuário',
    tipoConta: 'Contador',
    vinculacao: 'Santos Contabilidade Escritório',
    status: 'ativo',
    ultimoAcesso: '10/10/2026 às 08:55',
    cadastro: '20/01/2026 às 14:20',
    avatar: 'CS',
  },
  {
    id: '9',
    nome: 'Maria Vitória',
    profissao: 'Empresária',
    email: 'maria@padariaalvorada.com.br',
    perfil: 'Usuário',
    tipoConta: 'Empresário',
    vinculacao: 'Padaria Alvorada LTDA',
    status: 'pendente',
    ultimoAcesso: '25/09/2026 às 13:10',
    cadastro: '-',
    avatar: 'MV',
  },
  {
    id: '10',
    nome: 'Diego Lima',
    profissao: 'Contador',
    email: 'diego@dlcontabilidade.com.br',
    perfil: 'Usuário',
    tipoConta: 'Contador',
    vinculacao: 'DL Contabilidade Escritório',
    status: 'ativo',
    ultimoAcesso: '09/10/2026 às 18:20',
    cadastro: '10/02/2026 às 11:45',
    avatar: 'DL',
  },
];

export default function UsuariosPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState('todos');
  const [perfilFilter, setPerfilFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [cadastroFilter, setCadastroFilter] = useState('todos');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Calcular stats
  const totalUsuarios = usuariosFicticios.length;
  const ativosCount = usuariosFicticios.filter((u) => u.status === 'ativo').length;
  const pendentesCount = usuariosFicticios.filter((u) => u.status === 'pendente').length;
  const inativos = usuariosFicticios.filter((u) => u.status === 'inativo').length;

  // Filtrar usuários
  const filteredUsuarios = usuariosFicticios.filter((usuario) => {
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
  const totalPages = Math.ceil(filteredUsuarios.length / itemsPerPage);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ativo':
        return 'bg-green-100 text-green-800';
      case 'pendente':
        return 'bg-orange-100 text-orange-800';
      case 'inativo':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'ativo':
        return '🟢';
      case 'pendente':
        return '🟠';
      case 'inativo':
        return '🔴';
      default:
        return '⚪';
    }
  };

  const getPerfilColor = (perfil: string) => {
    switch (perfil) {
      case 'Admin Master':
        return 'bg-red-100 text-red-800';
      case 'Administrador':
        return 'bg-purple-100 text-purple-800';
      case 'Usuário':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'Admin Master':
        return 'bg-red-100 text-red-800';
      case 'Administrador':
        return 'bg-purple-100 text-purple-800';
      case 'Contador':
        return 'bg-purple-100 text-purple-800';
      case 'Empresário':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Usuários</h1>
            <p className="text-gray-600 mt-2">Gerencie todos os usuários da plataforma Unnify Conecta.</p>
          </div>
          <button className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center gap-2 transition">
            <span>+</span> Novo usuário
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

        {/* Filtros */}
        <div className="bg-white rounded-lg p-4 space-y-4">
          <div className="flex flex-col lg:flex-row gap-4 items-end">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nome, e-mail ou empresa..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              />
            </div>

            <select
              value={tipoFilter}
              onChange={(e) => {
                setTipoFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
            >
              <option value="todos">Tipo: Todos</option>
              <option value="admin-master">Admin Master</option>
              <option value="admin">Administrador</option>
              <option value="contador">Contador</option>
              <option value="empresario">Empresário</option>
            </select>

            <select
              value={perfilFilter}
              onChange={(e) => {
                setPerfilFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
            >
              <option value="todos">Perfil: Todos</option>
              <option value="admin-master">Admin Master</option>
              <option value="admin">Administrador</option>
              <option value="usuario">Usuário</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
            >
              <option value="todos">Status: Todos</option>
              <option value="ativo">Ativo</option>
              <option value="pendente">Pendente</option>
              <option value="inativo">Inativo</option>
            </select>

            <select
              value={cadastroFilter}
              onChange={(e) => {
                setCadastroFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
            >
              <option value="todos">Cadastro: Todos</option>
              <option value="mes-atual">Este mês</option>
              <option value="ultimos-3">Últimos 3 meses</option>
              <option value="ano">Este ano</option>
            </select>

            {(searchTerm || tipoFilter !== 'todos' || perfilFilter !== 'todos' || statusFilter !== 'todos' || cadastroFilter !== 'todos') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setTipoFilter('todos');
                  setPerfilFilter('todos');
                  setStatusFilter('todos');
                  setCadastroFilter('todos');
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
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Usuário</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">E-mail</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Perfil</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Tipo de conta</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Vinculação</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Último acesso</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Cadastro</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedUsuarios.map((usuario) => (
                  <tr key={usuario.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <input type="checkbox" className="rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-xs font-semibold">
                          {usuario.avatar}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{usuario.nome}</p>
                          <p className="text-xs text-gray-500">{usuario.profissao}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-sm">{usuario.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getPerfilColor(usuario.perfil)}`}>
                        {usuario.perfil}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getTipoColor(usuario.tipoConta)}`}>
                        {usuario.tipoConta}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-sm">{usuario.vinculacao || '-'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                          usuario.status
                        )}`}
                      >
                        {getStatusDot(usuario.status)} {usuario.status.charAt(0).toUpperCase() + usuario.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-sm">{usuario.ultimoAcesso}</td>
                    <td className="px-4 py-3 text-gray-600 text-sm">{usuario.cadastro}</td>
                    <td className="px-4 py-3 text-right">
                      <button className="text-gray-600 hover:text-gray-900 p-1 text-lg">👁</button>
                      <button className="text-gray-600 hover:text-gray-900 p-1 text-lg">✏️</button>
                      <button className="text-gray-600 hover:text-gray-900 p-1 text-lg">⋯</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="border-t border-gray-200 px-4 py-4 flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filteredUsuarios.length)} de {filteredUsuarios.length} usuários
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
