'use client';

import { ExigePermissao, useEspacoEmpresa } from '@/components/contador/EspacoEmpresa';
import { PaginaAgenda } from '@/components/agenda/PaginaAgenda';

// Mesma Agenda do contador, filtrada nesta empresa (compromissos compartilhados/dele + obrigações, conforme permissões)
export default function AgendaEmpresaPage() {
  const { empresa, contador } = useEspacoEmpresa();
  const esta = [{ id: empresa.id_empresa, nome: empresa.nome }];
  return (
    <ExigePermissao modulo="agenda">
      <PaginaAgenda modo="contador" usuarioId={contador.id} empresas={esta} empresasAgenda={esta} idEmpresaFixa={empresa.id_empresa} embutida />
    </ExigePermissao>
  );
}
