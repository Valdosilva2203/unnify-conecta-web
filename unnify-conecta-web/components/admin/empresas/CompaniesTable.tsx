'use client';

import { Eye, Edit, MoreVertical, ArrowUpDown } from 'lucide-react';

interface Company {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_comercial: string | null;
  telefone: string | null;
  email_comercial: string;
  cidade: string;
  estado: string;
  status_registro: string | null;
  criado_em: string;
  criado_por: string;
}

interface CompaniesTableProps {
  companies: Company[];
  sortField: string;
  sortDirection: 'asc' | 'desc';
  onSort: (field: string) => void;
}

function getStatusBadge(status: string | null) {
  switch (status) {
    case 'ATIVA':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
          <span className="w-2 h-2 bg-green-600 rounded-full" />
          Ativa
        </span>
      );
    case 'SUSPENSA':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-700 rounded-full text-xs font-medium">
          <span className="w-2 h-2 bg-red-600 rounded-full" />
          Suspensa
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-50 text-yellow-700 rounded-full text-xs font-medium">
          <span className="w-2 h-2 bg-yellow-600 rounded-full" />
          Pendente
        </span>
      );
  }
}

function SortHeader({
  label,
  field,
  currentField,
  direction,
  onSort,
}: {
  label: string;
  field: string;
  currentField: string;
  direction: 'asc' | 'desc';
  onSort: (field: string) => void;
}) {
  const isActive = currentField === field;

  return (
    <button
      onClick={() => onSort(field)}
      className="flex items-center gap-2 font-medium text-gray-900 hover:text-orange-600 transition-colors"
    >
      {label}
      {isActive && (
        <ArrowUpDown
          className={`w-4 h-4 ${direction === 'desc' ? 'rotate-180' : ''}`}
        />
      )}
    </button>
  );
}

export function CompaniesTable({
  companies,
  sortField,
  sortDirection,
  onSort,
}: CompaniesTableProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                <SortHeader
                  label="Empresa"
                  field="razao_social"
                  currentField={sortField}
                  direction={sortDirection}
                  onSort={onSort}
                />
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                <SortHeader
                  label="CNPJ"
                  field="cnpj"
                  currentField={sortField}
                  direction={sortDirection}
                  onSort={onSort}
                />
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                <SortHeader
                  label="Cidade/UF"
                  field="cidade"
                  currentField={sortField}
                  direction={sortDirection}
                  onSort={onSort}
                />
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                Plano
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-900 uppercase tracking-wider">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {companies.map((company) => (
              <tr key={company.id} className="hover:bg-gray-50 transition-colors">
                {/* Company Name */}
                <td className="px-6 py-4">
                  <div>
                    <p className="font-medium text-gray-900">
                      {company.razao_social}
                    </p>
                    {company.nome_comercial && (
                      <p className="text-sm text-gray-600">
                        {company.nome_comercial}
                      </p>
                    )}
                  </div>
                </td>

                {/* CNPJ */}
                <td className="px-6 py-4">
                  <p className="text-sm font-mono text-gray-700">
                    {company.cnpj}
                  </p>
                </td>

                {/* City/State */}
                <td className="px-6 py-4">
                  <p className="text-sm text-gray-700">
                    {company.cidade} - {company.estado}
                  </p>
                </td>

                {/* Plan */}
                <td className="px-6 py-4">
                  <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                    N/A
                  </span>
                </td>

                {/* Status */}
                <td className="px-6 py-4">{getStatusBadge(company.registration_status)}</td>

                {/* Actions */}
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      title="Visualizar"
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600 hover:text-gray-900"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      title="Editar"
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600 hover:text-gray-900"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      title="Mais opções"
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600 hover:text-gray-900"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
