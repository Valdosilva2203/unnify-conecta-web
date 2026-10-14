import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

// Card de indicador do Financeiro e do painel da empresa. Ícone acima do texto em telas estreitas.
export function Indicador({ titulo, valor, icone: Icone, cor, detalhe, destaque, children }: {
  titulo: string; valor: string; icone: LucideIcon; cor: string; detalhe?: string; destaque?: string; children?: ReactNode;
}) {
  return (
    <section aria-label={titulo} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col items-start sm:flex-row sm:items-center gap-2 sm:gap-3 min-w-0">
      <span className={`w-10 h-10 sm:w-11 sm:h-11 shrink-0 rounded-full inline-flex items-center justify-center ${cor}`}><Icone className="w-5 h-5" aria-hidden="true" /></span>
      <div className="min-w-0 max-w-full">
        <p className="text-sm text-gray-600">{titulo}</p>
        <p className={`text-base sm:text-xl font-bold break-words ${destaque ?? 'text-gray-900'}`}>{valor}</p>
        {detalhe && <p className="text-xs text-gray-500">{detalhe}</p>}
        {children}
      </div>
    </section>
  );
}
