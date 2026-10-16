'use client';

import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';
import { ControlePonto } from '@/components/ponto/ControlePonto';

// Controle de Ponto (Recursos Humanos). Regras, permissões e cálculos no banco (migration 056).
export default function ControlePontoPage() {
  const { empresa } = useEmpresaAtual();
  if (!empresa) return null;
  return <ControlePonto key={empresa.id} idEmpresa={empresa.id} />;
}
