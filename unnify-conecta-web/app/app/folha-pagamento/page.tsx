'use client';

import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';
import { ModuloFolha } from '@/components/folha/ModuloFolha';

// Folha de Pagamento (departamento Recursos Humanos). Permissões, etapas e números vêm do banco (migration 052).
export default function FolhaPagamentoPage() {
  const { empresa, usuario } = useEmpresaAtual();
  if (!empresa) return null;
  return <ModuloFolha key={empresa.id} idEmpresa={empresa.id} papel="empresa" nomeUsuario={usuario?.nome ?? ''} />;
}
