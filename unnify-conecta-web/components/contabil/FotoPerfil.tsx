'use client';

import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { iniciaisDe } from '@/lib/contabil';

// Foto em armazenamento privado: o link temporário só é gerado se as regras de acesso permitirem.
export function FotoPerfil({
  caminho,
  nome,
  escritorio = false,
  className = 'w-12 h-12 text-base',
  arredondado = 'rounded-full',
}: {
  caminho: string | null | undefined;
  nome: string;
  escritorio?: boolean;
  className?: string;
  arredondado?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    setUrl(null);
    if (!caminho) return;
    createClient()
      .storage.from('fotos-perfis')
      .createSignedUrl(caminho, 3600)
      .then(({ data }) => {
        if (ativo && data?.signedUrl) setUrl(data.signedUrl);
      });
    return () => {
      ativo = false;
    };
  }, [caminho]);

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Supabase
      <img src={url} alt={`Foto de ${nome}`} className={`${className} ${arredondado} object-cover shrink-0 bg-gray-100`} />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={`${className} ${arredondado} shrink-0 flex items-center justify-center font-semibold ${
        escritorio ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'
      }`}
    >
      {escritorio ? <Building2 className="w-1/2 h-1/2" /> : iniciaisDe(nome) || '?'}
    </div>
  );
}
