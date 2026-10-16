'use client';

import Link from 'next/link';
import { Building2, ChevronRight } from 'lucide-react';
import { ROTULO_STATUS_EMPRESA, type EmpresaResumo } from '@/lib/admin-dashboard';

const SELO: Record<string, string> = { ATIVA: 'bg-green-100 text-green-800', PENDENTE: 'bg-amber-100 text-amber-800', SUSPENSA: 'bg-red-100 text-red-800' };
export const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

// Últimos cadastros REAIS (empresas ou escritórios)
export function RecentCompanies({ itens, titulo = 'Novas empresas', href = '/admin/empresas', vazio = 'Nenhuma empresa cadastrada.', escritorio = false }: {
  itens: EmpresaResumo[]; titulo?: string; href?: string; vazio?: string; escritorio?: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-gray-900">{titulo}</h3>
        <Link href={href} className="inline-flex items-center gap-1 min-h-11 -my-2 px-2 -mr-2 rounded-lg text-orange-600 hover:text-orange-700 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
          Ver todas <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>
      {itens.length === 0 ? <p className="text-sm text-gray-500 text-center py-8">{vazio}</p> : (
        <div className="space-y-1">
          {itens.map((e) => (
            <div key={e.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className={`w-8 h-8 shrink-0 rounded-lg inline-flex items-center justify-center ${escritorio ? 'bg-orange-600 text-white text-xs font-bold' : 'bg-orange-100 text-orange-600'}`}>
                  {escritorio ? e.nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() : <Building2 className="w-4 h-4" aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{e.nome}</p>
                  <p className="text-xs text-gray-600">{dataHora(e.criadoEm)}</p>
                </div>
              </div>
              <span className={`ml-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold shrink-0 ${SELO[e.status ?? ''] ?? 'bg-gray-100 text-gray-700'}`}>
                {ROTULO_STATUS_EMPRESA[e.status ?? ''] ?? 'Sem status'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
