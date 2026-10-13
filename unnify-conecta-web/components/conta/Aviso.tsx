import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

const ESTILO = {
  sucesso: { classe: 'border-green-200 bg-green-50 text-green-800', Icone: CheckCircle2, papel: 'status' },
  erro: { classe: 'border-red-200 bg-red-50 text-red-800', Icone: AlertCircle, papel: 'alert' },
  info: { classe: 'border-amber-200 bg-amber-50 text-amber-900', Icone: Info, papel: 'status' },
} as const;

// Mensagem de retorno padrão das seções de Minha conta.
export function Aviso({ tipo, children }: { tipo: keyof typeof ESTILO; children: ReactNode }) {
  const { classe, Icone, papel } = ESTILO[tipo];
  return (
    <div role={papel} className={`flex gap-3 rounded-xl border p-3 sm:p-4 text-sm ${classe}`}>
      <Icone className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
