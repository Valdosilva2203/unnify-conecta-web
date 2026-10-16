'use client';

import { Pencil } from 'lucide-react';
import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';
import { CabecalhoModulo } from '@/components/navegacao/NavegacaoModulos';
import { ModuloAnotacoes } from '@/components/anotacoes/ModuloAnotacoes';

// Anotações da empresa (departamento Administrativo). Quem pode ver/editar cada anotação é decidido pelo banco.
export default function AnotacoesPage() {
  const { empresa } = useEmpresaAtual();
  if (!empresa) return null;
  return (
    <div className="space-y-5 min-w-0">
      <CabecalhoModulo icone={Pencil} titulo="Anotações" descricao="Organize suas ideias, lembretes e informações importantes em um só lugar." />
      <ModuloAnotacoes key={empresa.id} idEmpresa={empresa.id} />
    </div>
  );
}
