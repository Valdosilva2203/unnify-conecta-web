'use client';

import { AdminLayout } from '@/components/AdminLayout';
import { useAcessoAdminConfirmado } from '@/components/admin/GuardaAdmin';
import { ModuloTarefas } from '@/components/tarefas/ModuloTarefas';

// Tarefas internas da administração do Unnify (contexto 'plataforma'): não inclui tarefas de empresas/escritórios.
export default function TarefasAdminPage() {
  const confirmado = useAcessoAdminConfirmado();
  return <AdminLayout>{confirmado && <ModuloTarefas contexto="plataforma" idEmpresa={null} />}</AdminLayout>;
}