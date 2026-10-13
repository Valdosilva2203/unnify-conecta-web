'use client';

import { useContadorAtual } from '@/components/contador/LayoutContador';
import { ModuloTarefas } from '@/components/tarefas/ModuloTarefas';

export default function TarefasEscritorioPage() {
  const contador = useContadorAtual();
  if (!contador) return null;
  if (!contador.escritorio) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <h1 className="text-xl font-black text-gray-900">Tarefas</h1>
        <p className="text-gray-600 mt-2">As tarefas ficam no escritório contábil. Cadastre seu escritório para organizar as tarefas da equipe.</p>
      </div>
    );
  }
  return <ModuloTarefas contexto="escritorio" idEmpresa={contador.escritorio.id} />;
}