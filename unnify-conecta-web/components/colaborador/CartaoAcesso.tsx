import Image from 'next/image';
import type { ReactNode } from 'react';

// Moldura das telas de acesso do colaborador (ativar conta, sessão expirada, acesso indisponível)
export function CartaoAcesso({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-gray-50 flex items-start sm:items-center justify-center px-4 py-8" style={{ paddingTop: 'max(2rem, env(safe-area-inset-top))' }}>
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8 space-y-5">
        <div className="flex justify-center"><Image src="/brand/unnify-logo.png" alt="Unnify Conecta" width={170} height={48} className="h-auto w-[150px]" priority /></div>
        <div className="text-center space-y-1">
          <h1 className="text-xl sm:text-2xl font-black text-gray-900">{titulo}</h1>
          {subtitulo && <p className="text-sm text-gray-600">{subtitulo}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}
