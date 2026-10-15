'use client';

import { ExigePermissao, useEspacoEmpresa } from '@/components/contador/EspacoEmpresa';
import { Solicitacoes } from '@/components/documentos/Solicitacoes';

export default function SolicitacoesEmpresaPage() {
  const { empresa, versao, alterado } = useEspacoEmpresa();
  return <ExigePermissao modulo="solicitacoes"><Solicitacoes idEmpresa={empresa.id_empresa} papel="contador" versao={versao} aoAlterar={alterado} /></ExigePermissao>;
}
