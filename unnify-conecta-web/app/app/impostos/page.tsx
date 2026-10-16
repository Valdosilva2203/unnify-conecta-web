'use client';

import { Landmark } from 'lucide-react';
import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';
import { ModuloImpostos } from '@/components/impostos/ModuloImpostos';
import { CabecalhoModulo } from '@/components/navegacao/NavegacaoModulos';

// Impostos e parcelamentos da empresa (o contador com "Gerenciar impostos" vê e lança os mesmos registros).
export default function ImpostosEmpresaPage() {
  const { empresa } = useEmpresaAtual();
  if (!empresa) return null;
  return (
    <div className="space-y-5 min-w-0">
      <CabecalhoModulo icone={Landmark} titulo="Impostos" descricao="Guias, vencimentos e parcelamentos tributários — integrados às suas Contas a pagar." />
      <ModuloImpostos idEmpresa={empresa.id} papel="empresa" cnpjEmpresa={empresa.cnpj} />
    </div>
  );
}
