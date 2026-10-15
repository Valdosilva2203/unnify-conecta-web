'use client';

import { ExigePermissao, useEspacoEmpresa } from '@/components/contador/EspacoEmpresa';
import { ModuloObrigacoes } from '@/components/obrigacoes/ModuloObrigacoes';

export default function ObrigacoesEmpresaPage() {
  const { empresa, versao, alterado, pode } = useEspacoEmpresa();
  return <ExigePermissao modulo="obrigacoes"><ModuloObrigacoes idEmpresa={empresa.id_empresa} papel="contador" versao={versao} aoAlterar={alterado} podeAnexar={pode('enviar_documentos')} /></ExigePermissao>;
}
