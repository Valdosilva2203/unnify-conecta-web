import type { ReactNode } from 'react';

export const campo = 'w-full h-12 sm:h-11 px-3 border border-gray-300 rounded-lg bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
export const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';

export function Cartao({ titulo, acao, children, id }: { titulo?: string; acao?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={titulo && id ? id : undefined} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 min-w-0">
      {(titulo || acao) && (
        <div className="flex items-center justify-between gap-2 mb-3">
          {titulo && <h2 id={id} className="text-base font-bold text-gray-900">{titulo}</h2>}
          {acao}
        </div>
      )}
      {children}
    </section>
  );
}

export const Erro = ({ texto }: { texto: string | null }) =>
  texto ? <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{texto}</p> : null;
export const Sucesso = ({ texto }: { texto: string | null }) =>
  texto ? <p role="status" className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{texto}</p> : null;
export const Carregando = ({ rotulo: r }: { rotulo: string }) => <div role="status" aria-label={r} className="h-24 rounded-xl bg-gray-100 animate-pulse" />;
