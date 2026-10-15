'use client';

import { ExigePermissao, useEspacoEmpresa } from '@/components/contador/EspacoEmpresa';
import { ModuloImpostos } from '@/components/impostos/ModuloImpostos';

export default function ImpostosEmpresaPage() {
  const { empresa } = useEspacoEmpresa();
  return <ExigePermissao modulo="impostos"><ModuloImpostos idEmpresa={empresa.id_empresa} papel="contador" cnpjEmpresa={empresa.cnpj} /></ExigePermissao>;
}
