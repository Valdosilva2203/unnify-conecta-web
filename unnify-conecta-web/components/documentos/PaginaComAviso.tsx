'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { Aviso } from '@/components/conta/Aviso';

// Cabeçalho + aviso de sucesso/atenção + "versão" que recarrega as listas após cada ação
export function useAvisoEVersao() {
  const [aviso, setAviso] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const alterado = useCallback((m: string) => { setAviso(m); setVersao((v) => v + 1); }, []);
  // Recarrega sem aviso (quando o próprio componente filho já mostrou a mensagem)
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  return { aviso, setAviso, versao, alterado, recarregar };
}

export function CabecalhoPagina({ titulo, subtitulo, aviso, aoFecharAviso, children }: {
  titulo: string; subtitulo: string; aviso: string | null; aoFecharAviso: () => void; children?: ReactNode;
}) {
  return (
    <>
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900">{titulo}</h1>
          <p className="text-gray-600 mt-1">{subtitulo}</p>
        </div>
        {children}
      </div>
      {aviso && (
        <div className="flex items-start gap-2">
          <div className="flex-1"><Aviso tipo={aviso.startsWith('Atenção') ? 'info' : 'sucesso'}>{aviso}</Aviso></div>
          <button type="button" onClick={aoFecharAviso} aria-label="Fechar aviso" className="min-h-11 px-3 text-sm text-gray-500 hover:text-gray-800">✕</button>
        </div>
      )}
    </>
  );
}

export function Abas<T extends string>({ abas, atual, aoMudar, rotulo }: { abas: { id: T; titulo: string; contador?: number }[]; atual: T; aoMudar: (a: T) => void; rotulo: string }) {
  return (
    <nav aria-label={rotulo} className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
      <div className="flex gap-1 border-b border-gray-200 min-w-max">
        {abas.map((a) => (
          <button key={a.id} type="button" onClick={() => aoMudar(a.id)} aria-current={atual === a.id ? 'page' : undefined}
            className={`min-h-11 px-4 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap inline-flex items-center gap-2 ${atual === a.id ? 'border-orange-600 text-orange-600' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>
            {a.titulo}
            {!!a.contador && <span className="min-w-5 h-5 px-1.5 rounded-full bg-orange-600 text-white text-[11px] inline-flex items-center justify-center">{a.contador}</span>}
          </button>
        ))}
      </div>
    </nav>
  );
}
