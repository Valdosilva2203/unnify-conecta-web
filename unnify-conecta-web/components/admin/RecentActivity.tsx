'use client';

import Link from 'next/link';
import { Activity, ChevronRight } from 'lucide-react';
import type { EventoResumo } from '@/lib/admin-dashboard';
import { dataHora } from './RecentCompanies';

const ACOES: Record<string, string> = { INSERT: 'Registro criado', UPDATE: 'Registro alterado', DELETE: 'Registro removido' };

// Últimos eventos REAIS da auditoria da plataforma
export function RecentActivity({ itens }: { itens: EventoResumo[] }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-gray-900">Atividade recente</h3>
        <Link href="/admin/auditoria" className="inline-flex items-center gap-1 min-h-11 -my-2 px-2 -mr-2 rounded-lg text-orange-600 hover:text-orange-700 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
          Ver todas <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>
      {itens.length === 0 ? <p className="text-sm text-gray-500 text-center py-8">Nenhuma atividade registrada.</p> : (
        <div className="space-y-4">
          {itens.map((a) => (
            <div key={a.id} className="flex items-start gap-4 pb-4 border-b border-gray-200 last:pb-0 last:border-b-0">
              <span className="w-8 h-8 shrink-0 rounded-lg bg-orange-100 text-orange-600 inline-flex items-center justify-center mt-0.5"><Activity className="w-4 h-4" aria-hidden="true" /></span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{ACOES[a.acao.toUpperCase()] ?? a.acao}</p>
                <p className="text-xs text-gray-600 truncate mt-1">{a.tabela}</p>
                <p className="text-xs text-gray-500 mt-1">{dataHora(a.criadoEm)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
