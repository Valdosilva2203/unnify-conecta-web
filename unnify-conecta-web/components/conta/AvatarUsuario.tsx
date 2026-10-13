'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { iniciaisDe } from '@/lib/contabil';

// Foto pessoal (bucket privado "avatares", URL assinada) com iniciais como alternativa.
export function AvatarUsuario({ caminho, nome, className = '' }: { caminho: string | null; nome: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    if (!caminho) {
      setUrl(null);
      return;
    }
    createClient()
      .storage.from('avatares')
      .createSignedUrl(caminho, 3600)
      .then(({ data }) => ativo && setUrl(data?.signedUrl ?? null));
    return () => {
      ativo = false;
    };
  }, [caminho]);

  return (
    <span className={`shrink-0 rounded-full overflow-hidden bg-orange-100 text-orange-700 font-bold inline-flex items-center justify-center ${className}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada temporária do Storage
        <img src={url} alt={`Foto de ${nome}`} className="w-full h-full object-cover" />
      ) : (
        <span aria-hidden="true">{iniciaisDe(nome) || '?'}</span>
      )}
    </span>
  );
}
