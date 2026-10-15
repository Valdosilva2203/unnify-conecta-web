'use client';

import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';
import { PaginaAgenda } from '@/components/agenda/PaginaAgenda';

export default function AgendaPage() {
  const { empresa, usuario } = useEmpresaAtual();
  if (!empresa || !usuario) return null;
  return <PaginaAgenda modo="empresa" empresa={empresa} usuarioId={usuario.id} />;
}
