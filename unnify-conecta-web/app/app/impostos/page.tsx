'use client';

import { Landmark } from 'lucide-react';
import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';
import { ModuloImpostos } from '@/components/impostos/ModuloImpostos';

// Impostos e parcelamentos da empresa (o contador com "Gerenciar impostos" vê e lança os mesmos registros).
export default function ImpostosEmpresaPage() {
  const { empresa } = useEmpresaAtual();
  if (!empresa) return null;
  return (
    <div className="space-y-5 min-w-0">
      <div className="flex items-start gap-3 min-w-0">
        <span className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-2xl bg-orange-100 text-orange-600 inline-flex items-center justify-center"><Landmark className="w-7 h-7" aria-hidden="true" /></span>
        <div className="min-w-0"><h1 className="text-2xl sm:text-3xl font-black text-gray-900">Impostos</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">Guias, vencimentos e parcelamentos tributários — integrados às suas Contas a pagar.</p></div>
      </div>
      <ModuloImpostos idEmpresa={empresa.id} papel="empresa" cnpjEmpresa={empresa.cnpj} />
    </div>
  );
}
