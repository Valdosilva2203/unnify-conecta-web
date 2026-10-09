'use client';

import { useState } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';

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
  empresas: number;
  status: 'ativo' | 'pendente' | 'inativo';
  cadastro: string;
}

const escritoriosFicticios: Escritorio[] = [
  {
    id: '1',
    nomeFantasia: 'JM Contabilidade',
    razaoSocial: 'JM CONTADORES LTDA',
    cnpj: '43.885.538/0001-33',
    responsavel: 'Antônio De Sousa',
    telefone: '6 3999559555',
    email: 'contato@jmcontadores.com.br',
    cidade: 'Augustinópolis',
    uf: 'TO',
    contadores: 3,
    empresas: 15,
    status: 'ativo',
    cadastro: '08/10/2026',
  },
  {
    id: '2',
    nomeFantasia: 'Clara Contabilidade',
    razaoSocial: 'CLARA CONTABILIDADE LTDA',
    cnpj: '12.345.678/0001-90',
    responsavel: 'Maria Clara',
    telefone: '6 3991234567',
    email: 'contato@claracontabil.com',
    cidade: 'Araguatins',
    uf: 'TO',
    contadores: 2,
    empresas: 8,
    status: 'ativo',
    cadastro: '01/10/2026',
  },
  {
    id: '3',
    nomeFantasia: 'Silva & Associados',
    razaoSocial: 'SILVA E ASSOCIADOS LTDA',
    cnpj: '98.765.432/0001-11',
    responsavel: 'João Silva',
    telefone: '6 3992345678',
    email: 'contato@silvacont.com.br',
    cidade: 'Sampaio',
    uf: 'TO',
    contadores: 1,
    empresas: 5,
    status: 'ativo',
    cadastro: '28/09/2026',
  },
  {
    id: '4',
    nomeFantasia: 'AF Contabilidade',
    razaoSocial: 'AF CONTABILIDADE LTDA',
    cnpj: '56.789.123/0001-44',
    responsavel: 'Ana Fernandes',
    telefone: '6 3993456789',
    email: 'contato@afcontabil.com.br',
    cidade: 'Axixá',
    uf: 'TO',
    contadores: 4,
    empresas: 12,
    status: 'pendente',
    cadastro: '25/09/2026',
  },
  {
    id: '5',
    nomeFantasia: 'RP Contábil',
    razaoSocial: 'RP CONTABILIDADE LTDA',
    cnpj: '22.333.444/0001-55',
    responsavel: 'Ricardo Pereira',
    telefone: '6 3994567890',
    email: 'contato@rpcontabil.com.br',
    cidade: 'Imperatriz',
    uf: 'MA',
    contadores: 2,
    empresas: 3,
    status: 'inativo',
    cadastro: '20/09/2026',
  },
  {
    id: '6',
    nomeFantasia: 'Palmas Contabilidade',
    razaoSocial: 'PALMAS CONTABILIDADE LTDA',
    cnpj: '33.444.555/0001-66',
    responsavel: 'Patricia Santos',
    telefone: '6 3995678901',
    email: 'contato@palmascontabil.com',
    cidade: 'Palmas',
    uf: 'TO',
    contadores: 5,
    empresas: 20,
    status: 'ativo',
    cadastro: '15/09/2026',
  },
  {
    id: '7',
    nomeFantasia: 'Gurupi Contábil',
    razaoSocial: 'GURUPI CONTABILIDADE LTDA',
    cnpj: '44.555.666/0001-77',
    responsavel: 'Carlos Oliveira',
    telefone: '6 3996789012',
    email: 'contato@gurupicont.com.br',
    cidade: 'Gurupi',
    uf: 'TO',
    contadores: 1,
    empresas: 4,
    status: 'ativo',
    cadastro: '10/09/2026',
  },
  {
    id: '8',
    nomeFantasia: 'Costa Consultoria',
    razaoSocial: 'COSTA CONSULTORIA LTDA',
    cnpj: '55.666.777/0001-88',
    responsavel: 'Fernanda Costa',
    telefone: '6 3997890123',
    email: 'contato@costaconsult.com',
    cidade: 'Araguacema',
    uf: 'TO',
    contadores: 6,
    empresas: 18,
    status: 'ativo',
    cadastro: '05/09/2026',
  },
  {
    id: '9',
    nomeFantasia: 'Martins Contábil',
    razaoSocial: 'MARTINS CONTABILIDADE LTDA',
    cnpj: '66.777.888/0001-99',
    responsavel: 'Bruno Martins',
    telefone: '6 3998901234',
    email: 'contato@martinscont.com.br',
    cidade: 'Porto Nacional',
    uf: 'TO',
    contadores: 1,
    empresas: 2,
    status: 'ativo',
    cadastro: '01/09/2026',
  },
  {
    id: '10',
    nomeFantasia: 'Rocha Consultores',
    razaoSocial: 'ROCHA CONSULTORES LTDA',
    cnpj: '77.888.999/0001-00',
    responsavel: 'Juliana Rocha',
    telefone: '6 3999012345',
    email: 'contato@rochaconsult.com',
    cidade: 'Tocantinópolis',
    uf: 'TO',
    contadores: 3,
    empresas: 9,
    status: 'ativo',
    cadastro: '28/08/2026',
  },
];

export default function EscritoriosPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [cityFilter, setCityFilter] = useState('todas');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Calcular stats
  const totalEscritorios = escritoriosFicticios.length;
  const ativosCount = escritoriosFicticios.filter((e) => e.status === 'ativo').length;
  const pendentesCount = escritoriosFicticios.filter((e) => e.status === 'pendente').length;
  const inativosCount = escritoriosFicticios.filter((e) => e.status === 'inativo').length;

  // Filtrar escritórios
  const filteredEscritorios = escritoriosFicticios.filter((escritorio) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      escritorio.nomeFantasia.toLowerCase().includes(searchLower) ||
      escritorio.razaoSocial.toLowerCase().includes(searchLower) ||
      escritorio.cnpj.includes(searchTerm) ||
      escritorio.email.toLowerCase().includes(searchLower) ||
      escritorio.telefone.includes(searchTerm);

    const matchesStatus =
      statusFilter === 'todos' ||
      (statusFilter === 'ativo' && escritorio.status === 'ativo') ||
      (statusFilter === 'pendente' && escritorio.status === 'pendente') ||
      (statusFilter === 'inativo' && escritorio.status === 'inativo');

    const matchesCity = cityFilter === 'todas' || escritorio.cidade === cityFilter;

    return matchesSearch && matchesStatus && matchesCity;
  });

  // Paginar
  const paginatedEscritorios = filteredEscritorios.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const totalPages = Math.ceil(filteredEscritorios.length / itemsPerPage);

  // Cidades únicas
  const cidades = Array.from(new Set(escritoriosFicticios.map((e) => e.cidade))).sort();

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
            <h1 className="text-3xl font-bold text-gray-900">Escritórios</h1>
            <p className="text-gray-600 mt-2">Gerencie todos os escritórios contábeis cadastrados no Unnify Conecta.</p>
          </div>
          <button className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center gap-2 transition">
            <span>+</span> Novo escritório
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-orange-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Total de escritórios</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{totalEscritorios}</p>
                <p className="text-xs text-green-600 font-semibold mt-2">↑ +20% em relação ao mês anterior</p>
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

        {/* Filtros */}
        <div className="bg-white rounded-lg p-4 space-y-4">
          <div className="flex flex-col lg:flex-row gap-4 items-end">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por razão social, nome fantasia, CNPJ, telefone ou e-mail..."
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
              {cidades.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>

            {(searchTerm || statusFilter !== 'todos' || cityFilter !== 'todas') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('todos');
                  setCityFilter('todas');
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
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Escritório</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">CNPJ</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Responsável</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Contato</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Cidade/UF</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Contadores</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Empresas</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Cadastro</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedEscritorios.map((escritorio) => (
                  <tr key={escritorio.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <input type="checkbox" className="rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold text-gray-900">{escritorio.nomeFantasia}</p>
                        <p className="text-xs text-gray-500">{escritorio.razaoSocial}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-mono text-xs">{escritorio.cnpj}</td>
                    <td className="px-4 py-3 text-gray-700 text-sm">{escritorio.responsavel}</td>
                    <td className="px-4 py-3">
                      <p className="text-gray-700 text-sm">📞 {escritorio.telefone}</p>
                      <p className="text-xs text-gray-500">📧 {escritorio.email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-sm">
                      {escritorio.cidade}/{escritorio.uf}
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-semibold text-center">{escritorio.contadores}</td>
                    <td className="px-4 py-3 text-gray-700 font-semibold text-center">{escritorio.empresas}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                          escritorio.status
                        )}`}
                      >
                        {getStatusDot(escritorio.status)} {escritorio.status.charAt(0).toUpperCase() + escritorio.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{escritorio.cadastro}</td>
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
              Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filteredEscritorios.length)} de {filteredEscritorios.length}
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
