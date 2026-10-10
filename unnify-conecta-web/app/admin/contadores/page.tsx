'use client';

import { useState } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';

interface Contador {
  id: string;
  nome: string;
  cpfCnpj: string;
  telefone: string;
  email: string;
  cidade: string;
  uf: string;
  plano: string;
  empresas: number;
  status: 'ativo' | 'pendente' | 'inativo';
  cadastro: string;
}

const contadoresFicticios: Contador[] = [
  {
    id: '1',
    nome: 'Antônio De Sousa',
    cpfCnpj: '43.885.538/0001-33',
    telefone: '6 3999559555',
    email: 'suportedeepweb@gmail.com',
    cidade: 'Augustinópolis',
    uf: 'TO',
    plano: 'Pro',
    empresas: 3,
    status: 'ativo',
    cadastro: '08/10/2026',
  },
  {
    id: '2',
    nome: 'Maria Clara',
    cpfCnpj: '12.345.678/0001-90',
    telefone: '6 3991234567',
    email: 'maria@claracontabil.com',
    cidade: 'Araguatins',
    uf: 'TO',
    plano: 'Pro',
    empresas: 5,
    status: 'ativo',
    cadastro: '01/10/2026',
  },
  {
    id: '3',
    nome: 'João Silva',
    cpfCnpj: '98.765.432/0001-11',
    telefone: '6 3992345678',
    email: 'joao@silvacont.com.br',
    cidade: 'Sampaio',
    uf: 'TO',
    plano: 'Básico',
    empresas: 2,
    status: 'ativo',
    cadastro: '28/09/2026',
  },
  {
    id: '4',
    nome: 'Ana Fernandes',
    cpfCnpj: '56.789.123/0001-44',
    telefone: '6 3993456789',
    email: 'ana@afcontabil.com.br',
    cidade: 'Axixá',
    uf: 'TO',
    plano: 'Pro',
    empresas: 1,
    status: 'pendente',
    cadastro: '25/09/2026',
  },
  {
    id: '5',
    nome: 'Ricardo Pereira',
    cpfCnpj: '22.333.444/0001-55',
    telefone: '6 3994567890',
    email: 'ricardo@rpcontabil.com.br',
    cidade: 'Imperatriz',
    uf: 'MA',
    plano: 'Básico',
    empresas: 0,
    status: 'inativo',
    cadastro: '20/09/2026',
  },
  {
    id: '6',
    nome: 'Patricia Santos',
    cpfCnpj: '33.444.555/0001-66',
    telefone: '6 3995678901',
    email: 'patricia@santoscont.com',
    cidade: 'Palmas',
    uf: 'TO',
    plano: 'Pro',
    empresas: 4,
    status: 'ativo',
    cadastro: '15/09/2026',
  },
  {
    id: '7',
    nome: 'Carlos Oliveira',
    cpfCnpj: '44.555.666/0001-77',
    telefone: '6 3996789012',
    email: 'carlos@oliveiracont.com.br',
    cidade: 'Gurupi',
    uf: 'TO',
    plano: 'Básico',
    empresas: 2,
    status: 'ativo',
    cadastro: '10/09/2026',
  },
  {
    id: '8',
    nome: 'Fernanda Costa',
    cpfCnpj: '55.666.777/0001-88',
    telefone: '6 3997890123',
    email: 'fernanda@costacont.com',
    cidade: 'Araguacema',
    uf: 'TO',
    plano: 'Pro',
    empresas: 6,
    status: 'ativo',
    cadastro: '05/09/2026',
  },
  {
    id: '9',
    nome: 'Bruno Martins',
    cpfCnpj: '66.777.888/0001-99',
    telefone: '6 3998901234',
    email: 'bruno@martinscont.com.br',
    cidade: 'Porto Nacional',
    uf: 'TO',
    plano: 'Básico',
    empresas: 1,
    status: 'ativo',
    cadastro: '01/09/2026',
  },
  {
    id: '10',
    nome: 'Juliana Rocha',
    cpfCnpj: '77.888.999/0001-00',
    telefone: '6 3999012345',
    email: 'juliana@rochacont.com',
    cidade: 'Tocantinópolis',
    uf: 'TO',
    plano: 'Pro',
    empresas: 3,
    status: 'ativo',
    cadastro: '28/08/2026',
  },
  {
    id: '11',
    nome: 'Roberto Alves',
    cpfCnpj: '88.999.000/0001-11',
    telefone: '6 3990123456',
    email: 'roberto@alvescont.com.br',
    cidade: 'Dianópolis',
    uf: 'TO',
    plano: 'Básico',
    empresas: 2,
    status: 'ativo',
    cadastro: '20/08/2026',
  },
  {
    id: '12',
    nome: 'Camila Souza',
    cpfCnpj: '99.000.111/0001-22',
    telefone: '6 3991234567',
    email: 'camila@souzacont.com',
    cidade: 'Miracema',
    uf: 'TO',
    plano: 'Pro',
    empresas: 4,
    status: 'ativo',
    cadastro: '15/08/2026',
  },
];

export default function ContadoresPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [cityFilter, setCityFilter] = useState('todas');
  const [planoFilter, setPlanFilter] = useState('todos');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Calcular stats
  const totalContadores = contadoresFicticios.length;
  const ativosCount = contadoresFicticios.filter((c) => c.status === 'ativo').length;
  const pendentesCount = contadoresFicticios.filter((c) => c.status === 'pendente').length;
  const inativos = contadoresFicticios.filter((c) => c.status === 'inativo').length;

  // Filtrar contadores
  const filteredContadores = contadoresFicticios.filter((contador) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      contador.nome.toLowerCase().includes(searchLower) ||
      contador.cpfCnpj.includes(searchTerm) ||
      contador.email.toLowerCase().includes(searchLower) ||
      contador.telefone.includes(searchTerm);

    const matchesStatus =
      statusFilter === 'todos' ||
      (statusFilter === 'ativo' && contador.status === 'ativo') ||
      (statusFilter === 'pendente' && contador.status === 'pendente') ||
      (statusFilter === 'inativo' && contador.status === 'inativo');

    const matchesCity = cityFilter === 'todas' || contador.cidade === cityFilter;

    const matchesPlano =
      planoFilter === 'todos' ||
      (planoFilter === 'pro' && contador.plano === 'Pro') ||
      (planoFilter === 'basico' && contador.plano === 'Básico');

    return matchesSearch && matchesStatus && matchesCity && matchesPlano;
  });

  // Paginar
  const paginatedContadores = filteredContadores.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const totalPages = Math.ceil(filteredContadores.length / itemsPerPage);

  // Cidades únicas
  const cidades = Array.from(new Set(contadoresFicticios.map((c) => c.cidade))).sort();

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

  return (
    <AdminLayout>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Contadores</h1>
          <p className="text-gray-600 mt-2">Gerencie todos os contadores cadastrados no Unnify Conecta.</p>
        </div>
        <button className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center gap-2 transition">
          <span>+</span> Novo contador
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-orange-50 rounded-lg p-4 border border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-gray-600 text-sm">Total de contadores</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{totalContadores}</p>
              <p className="text-xs text-green-600 font-semibold mt-2">↑ +20% em relação ao mês anterior</p>
            </div>
            <span className="text-2xl">👥</span>
          </div>
        </div>

        <div className="bg-green-50 rounded-lg p-4 border border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-gray-600 text-sm">Contadores ativos</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{ativosCount}</p>
              <p className="text-xs text-green-700 font-semibold mt-2">
                {totalContadores > 0 ? ((ativosCount / totalContadores) * 100).toFixed(1) : '0'}% do total
              </p>
            </div>
            <span className="text-2xl">✓</span>
          </div>
        </div>

        <div className="bg-orange-50 rounded-lg p-4 border border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-gray-600 text-sm">Contadores pendentes</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{pendentesCount}</p>
              <p className="text-xs text-orange-700 font-semibold mt-2">
                {totalContadores > 0 ? ((pendentesCount / totalContadores) * 100).toFixed(1) : '0'}% do total
              </p>
            </div>
            <span className="text-2xl">⏱</span>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-gray-600 text-sm">Contadores inativos</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{inativos}</p>
              <p className="text-xs text-red-700 font-semibold mt-2">
                {totalContadores > 0 ? ((inativos / totalContadores) * 100).toFixed(1) : '0'}% do total
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
              placeholder="Buscar por nome, CPF, CNPJ, e-mail ou telefone..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
            />
          </div>

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
            value={cityFilter}
            onChange={(e) => {
              setCityFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
          >
            <option value="todas">Cidade: Todas</option>
            {cidades.map((cidade) => (
              <option key={cidade} value={cidade}>
                {cidade}
              </option>
            ))}
          </select>

          <select
            value={planoFilter}
            onChange={(e) => {
              setPlanFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
          >
            <option value="todos">Plano: Todos</option>
            <option value="pro">Pro</option>
            <option value="basico">Básico</option>
          </select>

          {(searchTerm || statusFilter !== 'todos' || cityFilter !== 'todas' || planoFilter !== 'todos') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('todos');
                setCityFilter('todas');
                setPlanFilter('todos');
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
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Nome</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">CPF/CNPJ</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Contato</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Cidade/UF</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Plano</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Empresas</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Cadastro</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedContadores.map((contador) => (
                <tr key={contador.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3">
                    <input type="checkbox" className="rounded" />
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-semibold text-gray-900">{contador.nome}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700 font-mono text-xs">{contador.cpfCnpj}</td>
                  <td className="px-4 py-3">
                    <p className="text-gray-700 text-sm">📞 {contador.telefone}</p>
                    <p className="text-xs text-gray-500">📧 {contador.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700 text-sm">
                    {contador.cidade}/{contador.uf}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                        contador.plano === 'Pro'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {contador.plano}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 font-semibold text-center">{contador.empresas}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                        contador.status
                      )}`}
                    >
                      {getStatusDot(contador.status)} {contador.status.charAt(0).toUpperCase() + contador.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{contador.cadastro}</td>
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
            Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filteredContadores.length)} de {filteredContadores.length}
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
