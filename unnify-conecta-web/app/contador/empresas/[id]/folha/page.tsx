'use client';

import { ExigePermissao, useEspacoEmpresa } from '@/components/contador/EspacoEmpresa';
import { ModuloFolha } from '@/components/folha/ModuloFolha';

// Folha da empresa atendida: "ver_folha" lê; com "processar_folha" o contador recebe, pede correção e devolve (conferido no banco).
export default function FolhaEmpresaPage() {
  const { empresa } = useEspacoEmpresa();
  return <ExigePermissao modulo="folha"><ModuloFolha key={empresa.id_empresa} idEmpresa={empresa.id_empresa} papel="contador" /></ExigePermissao>;
}
