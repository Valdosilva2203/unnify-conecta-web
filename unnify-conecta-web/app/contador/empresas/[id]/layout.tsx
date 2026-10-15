import { Suspense, type ReactNode } from 'react';
import { EspacoEmpresa } from '@/components/contador/EspacoEmpresa';

// Espaço da empresa gerenciada: cabeçalho da empresa + menu horizontal dos módulos (o menu lateral é do escritório).
// useParams/usePathname em rota dinâmica precisam de <Suspense> (cacheComponents).
// O vínculo/permissões vêm do navegador (sessão do contador) antes de renderizar o módulo: a entrada no espaço
// da empresa não é instantânea por desenho, então fica fora da validação de "instant navigation".
export const instant = false;

export default function EspacoEmpresaLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div role="status" aria-label="Carregando empresa" className="h-40 rounded-2xl bg-white border border-gray-200 animate-pulse" />}>
      <EspacoEmpresa>{children}</EspacoEmpresa>
    </Suspense>
  );
}
