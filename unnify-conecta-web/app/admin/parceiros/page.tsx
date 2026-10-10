'use client';

import { useState } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';

interface Parceiro {
  id: string;
  nome: string;
  nomeComercial: string;
  tipo: 'Pessoa Física' | 'Pessoa Jurídica';
  cpfCnpj: string;
  telefone: string;
  email: string;
  cidade: string;
  uf: string;
  indicacoes: number;
  comissoes: number;
  status: 'ativo' | 'pendente' | 'inativo';
  cadastro: string;
  dataAcao: string;
}

const parceirosFicticios: Parceiro[] = [
  {
    id: '1',
    nome: 'Alex Lima',
    nomeComercial: 'AL Soluções em TI',
    tipo: 'Pessoa Física',
    cpfCnpj: '123.456.789-00',
    telefone: '63 99912-3456',
    email: 'alex@alsolucoes.com.br',
    cidade: 'Augustinópolis',
    uf: 'TO',
    indicacoes: 12,
    comissoes: 2398.80,
    status: 'ativo',
    cadastro: '10/10/2026',
    dataAcao: '10/10/2026 às 14:20',
  },
  {
    id: '2',
    nome: 'João Ribeiro',
    nomeComercial: 'JR Telecom',
    tipo: 'Pessoa Física',
    cpfCnpj: '234.567.890-11',
    telefone: '63 99234-5678',
    email: 'joao@jrtelecom.com.br',
    cidade: 'Araguatins',
    uf: 'TO',
    indicacoes: 8,
    comissoes: 1599.20,
    status: 'ativo',
    cadastro: '05/10/2026',
    dataAcao: '05/10/2026 às 11:45',
  },
  {
    id: '3',
    nome: 'Comercial Martins',
    nomeComercial: 'Martins Implementações',
    tipo: 'Pessoa Jurídica',
    cpfCnpj: '12.345.678/0001-90',
    telefone: '63 99345-6789',
    email: 'contato@martinsimp.com.br',
    cidade: 'Sampaio',
    uf: 'TO',
    indicacoes: 15,
    comissoes: 3299.00,
    status: 'ativo',
    cadastro: '28/09/2026',
    dataAcao: '28/09/2026 às 16:30',
  },
  {
    id: '4',
    nome: 'Silva Fiber',
    nomeComercial: 'Silva Fiber Internet',
    tipo: 'Pessoa Jurídica',
    cpfCnpj: '23.456.789/0001-01',
    telefone: '63 99123-4567',
    email: 'contato@silvafiber.com.br',
    cidade: 'Axixá',
    uf: 'TO',
    indicacoes: 5,
    comissoes: 999.50,
    status: 'pendente',
    cadastro: '25/09/2026',
    dataAcao: '25/09/2026 às 10:15',
  },
  {
    id: '5',
    nome: 'Ricardo Costa',
    nomeComercial: 'RC Marketing Digital',
    tipo: 'Pessoa Física',
    cpfCnpj: '345.678.901-22',
    telefone: '63 99678-9012',
    email: 'ricardo@rcmarketing.com.br',
    cidade: 'Imperatriz',
    uf: 'MA',
    indicacoes: 9,
    comissoes: 1849.10,
    status: 'ativo',
    cadastro: '20/09/2026',
    dataAcao: '20/09/2026 às 09:40',
  },
  {
    id: '6',
    nome: 'Top Serviços',
    nomeComercial: 'Top Serviços LTDA',
    tipo: 'Pessoa Jurídica',
    cpfCnpj: '34.567.890/0001-12',
    telefone: '63 99901-2345',
    email: 'contato@topservicos.com.br',
    cidade: 'Palmas',
    uf: 'TO',
    indicacoes: 3,
    comissoes: 599.70,
    status: 'inativo',
    cadastro: '15/09/2026',
    dataAcao: '15/09/2026 às 13:10',
  },
  {
    id: '7',
    nome: 'Fernanda Barbosa',
    nomeComercial: 'FB Consultoria',
    tipo: 'Pessoa Física',
    cpfCnpj: '456.789.012-33',
    telefone: '63 99222-3344',
    email: 'fernanda@fbconsult.com.br',
    cidade: 'Gurupi',
    uf: 'TO',
    indicacoes: 7,
    comissoes: 1399.30,
    status: 'ativo',
    cadastro: '10/09/2026',
    dataAcao: '10/09/2026 às 08:25',
  },
  {
    id: '8',
    nome: 'Norte Vendas',
    nomeComercial: 'Norte Vendas LTDA',
    tipo: 'Pessoa Jurídica',
    cpfCnpj: '45.678.901/0001-23',
    telefone: '63 99876-5432',
    email: 'contato@nortevendas.com.br',
    cidade: 'Porto Nacional',
    uf: 'TO',
    indicacoes: 4,
    comissoes: 799.60,
    status: 'pendente',
    cadastro: '05/09/2026',
    dataAcao: '05/09/2026 às 15:50',
  },
  {
    id: '9',
    nome: 'Diego Lima',
    nomeComercial: 'DL Tecnologia',
    tipo: 'Pessoa Física',
    cpfCnpj: '567.890.123-44',
    telefone: '63 99111-7788',
    email: 'diego@dltecnologia.com.br',
    cidade: 'Tocantinópolis',
    uf: 'TO',
    indicacoes: 11,
    comissoes: 2199.40,
    status: 'ativo',
    cadastro: '01/09/2026',
    dataAcao: '01/09/2026 às 12:35',
  },
  {
    id: '10',
    nome: 'Sampaio Parceiros',
    nomeComercial: 'Sampaio Parceiros LTDA',
    tipo: 'Pessoa Jurídica',
    cpfCnpj: '56.789.012/0001-34',
    telefone: '63 99444-8899',
    email: 'contato@sampaiop.com.br',
    cidade: 'Sampaio',
    uf: 'TO',
    indicacoes: 6,
    comissoes: 1199.00,
    status: 'ativo',
    cadastro: '28/08/2026',
    dataAcao: '28/08/2026 às 17:10',
  },
];

export default function ParceirosPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [tipoFilter, setTipoFilter] = useState('todos');
  const [cidadeFilter, setCidadeFilter] = useState('todas');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Calcular stats
  const totalParceiros = parceirosFicticios.length;
  const ativosCount = parceirosFicticios.filter((p) => p.status === 'ativo').length;
  const pendentesCount = parceirosFicticios.filter((p) => p.status === 'pendente').length;
  const inativos = parceirosFicticios.filter((p) => p.status === 'inativo').length;

  // Filtrar parceiros
  const filteredParceiros = parceirosFicticios.filter((parceiro) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      parceiro.nome.toLowerCase().includes(searchLower) ||
      parceiro.nomeComercial.toLowerCase().includes(searchLower) ||
      parceiro.cpfCnpj.includes(searchTerm) ||
      parceiro.email.toLowerCase().includes(searchLower) ||
      parceiro.telefone.includes(searchTerm);

    const matchesStatus =
      statusFilter === 'todos' ||
      (statusFilter === 'ativo' && parceiro.status === 'ativo') ||
      (statusFilter === 'pendente' && parceiro.status === 'pendente') ||
      (statusFilter === 'inativo' && parceiro.status === 'inativo');

    const matchesTipo =
      tipoFilter === 'todos' ||
      (tipoFilter === 'pessoa-fisica' && parceiro.tipo === 'Pessoa Física') ||
      (tipoFilter === 'pessoa-juridica' && parceiro.tipo === 'Pessoa Jurídica');

    const matchesCidade = cidadeFilter === 'todas' || parceiro.cidade === cidadeFilter;

    return matchesSearch && matchesStatus && matchesTipo && matchesCidade;
  });

  // Paginar
  const paginatedParceiros = filteredParceiros.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const totalPages = Math.ceil(filteredParceiros.length / itemsPerPage);

  // Cidades únicas
  const cidades = Array.from(new Set(parceirosFicticios.map((p) => p.cidade))).sort();

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

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'Pessoa Física':
        return 'bg-blue-100 text-blue-800';
      case 'Pessoa Jurídica':
        return 'bg-purple-100 text-purple-800';
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
            <h1 className="text-3xl font-bold text-gray-900">Parceiros</h1>
            <p className="text-gray-600 mt-2">Gerencie todos os parceiros comerciais cadastrados no Unnify Conecta.</p>
          </div>
          <button className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center gap-2 transition">
            <span>+</span> Novo parceiro
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-orange-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Total de parceiros</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{totalParceiros}</p>
                <p className="text-xs text-green-600 font-semibold mt-2">↑ +28% em relação ao mês anterior</p>
              </div>
              <span className="text-2xl">👥</span>
            </div>
          </div>

          <div className="bg-green-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Parceiros ativos</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{ativosCount}</p>
                <p className="text-xs text-green-700 font-semibold mt-2">
                  {totalParceiros > 0 ? ((ativosCount / totalParceiros) * 100).toFixed(1) : '0'}% do total
                </p>
              </div>
              <span className="text-2xl">✓</span>
            </div>
          </div>

          <div className="bg-orange-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Parceiros pendentes</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{pendentesCount}</p>
                <p className="text-xs text-orange-700 font-semibold mt-2">
                  {totalParceiros > 0 ? ((pendentesCount / totalParceiros) * 100).toFixed(1) : '0'}% do total
                </p>
              </div>
              <span className="text-2xl">⏱</span>
            </div>
          </div>

          <div className="bg-red-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-gray-600 text-sm">Parceiros inativos</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{inativos}</p>
                <p className="text-xs text-red-700 font-semibold mt-2">
                  {totalParceiros > 0 ? ((inativos / totalParceiros) * 100).toFixed(1) : '0'}% do total
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
                placeholder="Buscar por name, CPF/CNPJ, e-mail ou telefone..."
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
              value={tipoFilter}
              onChange={(e) => {
                setTipoFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
            >
              <option value="todos">Tipo: Todos</option>
              <option value="pessoa-fisica">Pessoa Física</option>
              <option value="pessoa-juridica">Pessoa Jurídica</option>
            </select>

            <select
              value={cidadeFilter}
              onChange={(e) => {
                setCidadeFilter(e.target.value);
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

            {(searchTerm || statusFilter !== 'todos' || tipoFilter !== 'todos' || cidadeFilter !== 'todas') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('todos');
                  setTipoFilter('todos');
                  setCidadeFilter('todas');
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
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Parceiro</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Tipo</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Contato</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Cidade/UF</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Indicações</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Comissões</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Cadastro</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedParceiros.map((parceiro) => (
                  <tr key={parceiro.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <input type="checkbox" className="rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold text-gray-900">{parceiro.nome}</p>
                        <p className="text-xs text-gray-500">{parceiro.nomeComercial}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getTipoColor(parceiro.tipo)}`}>
                        {parceiro.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-700 text-sm">📞 {parceiro.telefone}</p>
                      <p className="text-xs text-gray-500">📧 {parceiro.email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-sm">
                      {parceiro.cidade}/{parceiro.uf}
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-semibold text-center">{parceiro.indicacoes}</td>
                    <td className="px-4 py-3 text-gray-700 font-semibold">R$ {parceiro.comissoes.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                          parceiro.status
                        )}`}
                      >
                        {getStatusDot(parceiro.status)} {parceiro.status.charAt(0).toUpperCase() + parceiro.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{parceiro.cadastro}</td>
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
              Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filteredParceiros.length)} de {filteredParceiros.length}
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
