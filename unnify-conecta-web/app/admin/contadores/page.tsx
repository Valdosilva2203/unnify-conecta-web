'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { AlertCircle, Search } from 'lucide-react';

interface AccountingOffice {
  id: string;
  legal_name: string;
  trade_name: string | null;
  cnpj: string;
  phone: string | null;
  commercial_email: string;
  city: string;
  state: string;
  created_at: string;
}

interface Stats {
  total: number;
  active: number;
  pending: number;
  inactive: number;
}

export default function ContadoresPage() {
  const [contadores, setContadores] = useState<AccountingOffice[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, pending: 0, inactive: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [cityFilter, setCityFilter] = useState('todos');
  const [sortBy, setSortBy] = useState<'name' | 'date'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const supabase = createClient();

  useEffect(() => {
    fetchContadores();
  }, []);

  async function fetchContadores() {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('accounting_offices')
        .select('*')
        .order(sortBy === 'name' ? 'legal_name' : 'created_at', {
          ascending: sortDir === 'asc'
        });

      if (fetchError) {
        throw fetchError;
      }

      setContadores(data || []);

      // Calculate stats
      const total = data?.length || 0;
      // Status simples: consideramos todos como "Ativo" por enquanto
      setStats({
        total,
        active: total,
        pending: 0,
        inactive: 0
      });
    } catch (err) {
      console.error('[ContadoresPage] Erro ao buscar contadores:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar contadores');
    } finally {
      setLoading(false);
    }
  }

  const filteredContadores = contadores.filter(contador => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      contador.legal_name.toLowerCase().includes(searchLower) ||
      contador.cnpj.includes(searchTerm) ||
      contador.commercial_email.toLowerCase().includes(searchLower) ||
      (contador.phone?.includes(searchTerm) || false);

    const matchesCity = cityFilter === 'todos' || contador.city === cityFilter;
    const matchesStatus = statusFilter === 'todos' ||
      (statusFilter === 'ativo' && true) || // Todos são "ativos" por enquanto
      (statusFilter === 'pendente' && false) ||
      (statusFilter === 'inativo' && false);

    return matchesSearch && matchesCity && matchesStatus;
  });

  const paginatedContadores = filteredContadores.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredContadores.length / itemsPerPage);
  const cities = Array.from(new Set(contadores.map(c => c.city))).sort();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
          <p className="mt-4 text-gray-600">Carregando contadores...</p>
        </div>
      </div>
    );
  }

  return (
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
        <StatsCard
          icon="🏢"
          label="Total de contadores"
          value={stats.total}
          subtext={stats.total === 1 ? "1 contador" : `${stats.total} contadores`}
        />
        <StatsCard
          icon="✓"
          label="Contadores ativos"
          value={stats.active}
          percentage={stats.total > 0 ? ((stats.active / stats.total) * 100).toFixed(1) : '—'}
          color="green"
        />
        <StatsCard
          icon="⏱"
          label="Contadores pendentes"
          value={stats.pending}
          percentage={stats.total > 0 ? ((stats.pending / stats.total) * 100).toFixed(1) : '—'}
          color="orange"
        />
        <StatsCard
          icon="✕"
          label="Contadores inativos"
          value={stats.inactive}
          percentage={stats.total > 0 ? ((stats.inactive / stats.total) * 100).toFixed(1) : '—'}
          color="gray"
        />
      </div>

      {/* Search and Filters */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-red-900">Erro ao carregar</p>
            <p className="text-red-700">{error}</p>
            <button
              onClick={fetchContadores}
              className="mt-2 text-sm text-red-600 hover:text-red-700 font-semibold"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-4 items-end">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome, CNPJ, cidade ou..."
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
            <option value="todos">Cidade: Todos</option>
            {cities.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>

          {(searchTerm || statusFilter !== 'todos' || cityFilter !== 'todos') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('todos');
                setCityFilter('todos');
                setCurrentPage(1);
              }}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg overflow-hidden border border-gray-200">
        {paginatedContadores.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">📋</div>
            <p className="text-gray-600">Nenhum contador cadastrado ainda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    <button
                      onClick={() => {
                        setSortBy('name');
                        setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                      }}
                      className="flex items-center gap-2 hover:text-gray-900"
                    >
                      Escritório
                      {sortBy === 'name' && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">CNPJ</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Contato</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Cidade/UF</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    <button
                      onClick={() => {
                        setSortBy('date');
                        setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                      }}
                      className="flex items-center gap-2 hover:text-gray-900"
                    >
                      Cadastro
                      {sortBy === 'date' && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedContadores.map(contador => (
                  <tr key={contador.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold text-gray-900">{contador.legal_name}</p>
                        {contador.trade_name && (
                          <p className="text-xs text-gray-500">{contador.trade_name}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{contador.cnpj}</td>
                    <td className="px-4 py-3">
                      {contador.phone && (
                        <p className="text-gray-700">{contador.phone}</p>
                      )}
                      <p className="text-xs text-gray-500">{contador.commercial_email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{contador.city}/{contador.state}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                        Ativo
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {new Date(contador.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className="text-gray-600 hover:text-gray-900 p-1">👁</button>
                      <button className="text-gray-600 hover:text-gray-900 p-1">✏</button>
                      <button className="text-gray-600 hover:text-gray-900 p-1">⋯</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-gray-200 px-4 py-4 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filteredContadores.length)} de {filteredContadores.length}
              </span>
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
            </div>

            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
                className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                ←
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
                className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface StatsCardProps {
  icon: string;
  label: string;
  value: number;
  subtext?: string;
  percentage?: string | number;
  color?: 'green' | 'orange' | 'gray';
}

function StatsCard({ icon, label, value, subtext, percentage, color }: StatsCardProps) {
  const bgColor = {
    green: 'bg-green-50',
    orange: 'bg-orange-50',
    gray: 'bg-gray-50',
  }[color || 'orange'];

  const textColor = {
    green: 'text-green-700',
    orange: 'text-orange-700',
    gray: 'text-gray-700',
  }[color || 'orange'];

  return (
    <div className={`${bgColor} rounded-lg p-4 border border-gray-200`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-gray-600 text-sm">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
          {subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p>}
          {percentage && (
            <p className={`text-xs font-semibold mt-2 ${textColor}`}>
              {percentage}% do total
            </p>
          )}
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  );
}
