'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

// Diálogo acessível: no celular abre como "bottom sheet"; no desktop, centralizado.
export function Modal({
  aberto,
  aoFechar,
  titulo,
  descricao,
  children,
  rodape,
  tamanho = 'md',
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao?: string;
  children: ReactNode;
  rodape?: ReactNode;
  tamanho?: 'md' | 'lg';
}) {
  const painelRef = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  const idDescricao = useId();
  // Guardado em ref: quem usa o Modal costuma passar uma função nova a cada renderização,
  // e isso não pode reiniciar o efeito abaixo (senão o foco volta ao primeiro campo a cada tecla).
  const aoFecharRef = useRef(aoFechar);
  useEffect(() => {
    aoFecharRef.current = aoFechar;
  }, [aoFechar]);

  // Roda só quando o diálogo abre/fecha: foco inicial, trava de rolagem e Esc/Tab.
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focaveis = () =>
      painelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
      ) ?? [];
    (focaveis()[1] ?? focaveis()[0])?.focus();

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFecharRef.current();
      if (e.key !== 'Tab') return;
      const lista = focaveis();
      if (!lista.length) return;
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflowAnterior;
      anterior?.focus();
    };
  }, [aberto]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-gray-900/50" onClick={aoFechar} />
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={descricao ? idDescricao : undefined}
        className={`relative w-full ${tamanho === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-lg'} max-h-[90dvh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-xl pb-[env(safe-area-inset-bottom)]`}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="min-w-0">
            <h2 id={idTitulo} className="text-lg font-bold text-gray-900">
              {titulo}
            </h2>
            {descricao && (
              <p id={idDescricao} className="text-sm text-gray-600 mt-1">
                {descricao}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="w-11 h-11 -mr-2 -mt-2 shrink-0 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {rodape && (
          <div className="px-5 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">{rodape}</div>
        )}
      </div>
    </div>
  );
}

export const classeBotaoPrimario =
  'min-h-11 px-5 inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2';
export const classeBotaoSecundario =
  'min-h-11 px-5 inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-800 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500';
export const classeBotaoPerigo =
  'min-h-11 px-5 inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2';
