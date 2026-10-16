'use client';

import { createContext, Suspense, useContext, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';

// Padrão visual único dos três portais: cabeçalho do módulo (ícone laranja + título + descrição) e, logo abaixo,
// a barra de módulos do departamento em pílulas. Cada portal informa quais módulos REAIS pertencem à rota atual.

export interface ModuloNav { href: string; rotulo: string; icone?: LucideIcon }

type ModulosDaRota = (pathname: string) => ModuloNav[];
const ContextoModulos = createContext<ModulosDaRota>(() => []);
export const ProvedorModulos = ContextoModulos.Provider;

const ativoNaRota = (pathname: string | null, href: string) => !!pathname && (pathname === href || pathname.startsWith(`${href}/`));

export const classePilula = (ativo: boolean) =>
  `inline-flex items-center gap-1.5 min-h-9 px-4 rounded-full border text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
    ativo ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
  }`;

function BarraInterna({ rotulo }: { rotulo: string }) {
  const pathname = usePathname();
  const modulos = useContext(ContextoModulos)(pathname ?? '');
  if (modulos.length < 2) return null; // um só módulo: nada para navegar
  return (
    <nav aria-label={rotulo} className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
      <ul className="flex gap-2 min-w-max pb-1">
        {modulos.map((m) => {
          const ativo = ativoNaRota(pathname, m.href);
          const Icone = m.icone;
          return (
            <li key={m.href}>
              <Link href={m.href} aria-current={ativo ? 'page' : undefined} className={classePilula(ativo)}>
                {Icone && <Icone className="w-4 h-4" aria-hidden="true" />}{m.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function BarraModulos({ rotulo = 'Módulos do departamento' }: { rotulo?: string }) {
  return <Suspense fallback={null}><BarraInterna rotulo={rotulo} /></Suspense>;
}

// Cabeçalho do módulo: ícone laranja, título (h1), descrição, ações à direita e a barra de módulos abaixo
export function CabecalhoModulo({ icone: Icone, titulo, descricao, acoes, barra = true }: {
  icone: LucideIcon; titulo: string; descricao?: string; acoes?: ReactNode; barra?: boolean;
}) {
  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-12 h-12 shrink-0 rounded-xl bg-orange-600 text-white inline-flex items-center justify-center"><Icone className="w-6 h-6" aria-hidden="true" /></span>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight">{titulo}</h1>
            {descricao && <p className="text-gray-600 mt-0.5 text-sm sm:text-base">{descricao}</p>}
          </div>
        </div>
        {acoes}
      </div>
      {barra && <BarraModulos />}
    </div>
  );
}
