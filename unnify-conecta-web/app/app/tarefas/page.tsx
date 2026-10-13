'use client';

import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';
import { ModuloTarefas } from '@/components/tarefas/ModuloTarefas';

export default function TarefasEmpresaPage() {
  const { empresa } = useEmpresaAtual();
  if (!empresa) return null;
  return <ModuloTarefas contexto="empresa" idEmpresa={empresa.id} />;
}