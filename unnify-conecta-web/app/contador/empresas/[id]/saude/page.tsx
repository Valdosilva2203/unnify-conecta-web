'use client';

import { ExigePermissao, useEspacoEmpresa } from '@/components/contador/EspacoEmpresa';
import { PainelSaude } from '@/components/saude/PainelSaude';

export default function SaudeEmpresaPage() {
  const { empresa } = useEspacoEmpresa();
  return <ExigePermissao modulo="saude"><PainelSaude idEmpresa={empresa.id_empresa} papel="contador" /></ExigePermissao>;
}
