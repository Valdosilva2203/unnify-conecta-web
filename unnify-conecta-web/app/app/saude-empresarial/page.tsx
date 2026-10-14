'use client';

import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';
import { PainelSaude } from '@/components/saude/PainelSaude';

// E5 — Saúde Empresarial da empresa selecionada. Tudo é calculado no banco (saude_empresarial), que confere a permissão.
export default function SaudeEmpresarialPage() {
  const { empresa } = useEmpresaAtual();
  if (!empresa) return null;
  return <PainelSaude key={empresa.id} idEmpresa={empresa.id} papel="empresa" />;
}
