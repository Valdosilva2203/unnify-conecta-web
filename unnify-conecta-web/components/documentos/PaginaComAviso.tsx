'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { FileText, type LucideIcon } from 'lucide-react';
import { Aviso } from '@/components/conta/Aviso';
import { CabecalhoModulo, classePilula } from '@/components/navegacao/NavegacaoModulos';

// Cabeçalho + aviso de sucesso/atenção + "versão" que recarrega as listas após cada ação
export function useAvisoEVersao() {
  const [aviso, setAviso] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const alterado = useCallback((m: string) => { setAviso(m); setVersao((v) => v + 1); }, []);
  // Recarrega sem aviso (quando o próprio componente filho já mostrou a mensagem)
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  return { aviso, setAviso, versao, alterado, recarregar };
}

export function CabecalhoPagina({ titulo, subtitulo, aviso, aoFecharAviso, icone = FileText, children }: {
  titulo: string; subtitulo: string; aviso: string | null; aoFecharAviso: () => void; icone?: LucideIcon; children?: ReactNode;
}) {
  return (
    <>
      <CabecalhoModulo icone={icone} titulo={titulo} descricao={subtitulo} acoes={children} />
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
      <div className="flex gap-2 min-w-max pb-1">
        {abas.map((a) => (
          <button key={a.id} type="button" onClick={() => aoMudar(a.id)} aria-current={atual === a.id ? 'page' : undefined}
            className={classePilula(atual === a.id)}>
            {a.titulo}
            {!!a.contador && <span className={`min-w-5 h-5 px-1.5 rounded-full text-[11px] inline-flex items-center justify-center ${atual === a.id ? 'bg-white text-orange-700' : 'bg-orange-600 text-white'}`}>{a.contador}</span>}
          </button>
        ))}
      </div>
    </nav>
  );
}
