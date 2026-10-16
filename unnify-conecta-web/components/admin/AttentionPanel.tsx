'use client';

import Link from 'next/link';
import { AlertCircle, CheckCircle2, ChevronRight } from 'lucide-react';

// Pontos de atenção REAIS (só aparecem os que têm ocorrências)
export function AttentionPanel({ itens }: { itens: { id: string; titulo: string; descricao: string; quantidade: number; href: string }[] }) {
  return (
    <div className="border-t border-gray-200 mt-8 pt-8">
      <div className="flex items-center gap-2 mb-6">
        {itens.length ? <AlertCircle className="w-5 h-5 text-red-600" aria-hidden="true" /> : <CheckCircle2 className="w-5 h-5 text-green-600" aria-hidden="true" />}
        <h3 className={`text-lg font-bold ${itens.length ? 'text-red-600' : 'text-green-700'}`}>Requer atenção</h3>
      </div>
      {itens.length === 0 ? <p className="text-sm text-gray-600">Nada requer atenção agora.</p> : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {itens.map((item) => (
            <Link key={item.id} href={item.href} className="bg-red-50 border border-red-200 rounded-lg p-4 hover:bg-red-100 transition-colors text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
              <div className="flex items-start justify-between mb-2">
                <p className="text-2xl font-black text-red-600">{item.quantidade}</p>
                <ChevronRight className="w-5 h-5 text-red-400 group-hover:text-red-600 transition-colors" aria-hidden="true" />
              </div>
              <p className="text-sm font-semibold text-red-900 mb-1">{item.titulo}</p>
              <p className="text-xs text-red-700">{item.descricao}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
