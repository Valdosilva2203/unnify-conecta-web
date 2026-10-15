'use client';

import { useEffect, useState } from 'react';
import { ExigePermissao, useEspacoEmpresa } from '@/components/contador/EspacoEmpresa';
import { VisaoGeral } from '@/components/financeiro/VisaoGeral';
import { hojeBrasil, inicioDoMes } from '@/lib/financeiro';

export default function FinanceiroEmpresaPage() {
  const { empresa, versao } = useEspacoEmpresa();
  const [periodo, setPeriodo] = useState('');
  useEffect(() => setPeriodo(inicioDoMes(hojeBrasil())), []); // data só no navegador
  return <ExigePermissao modulo="financeiro">{periodo && <VisaoGeral idEmpresa={empresa.id_empresa} periodo={periodo} versao={versao} />}</ExigePermissao>;
}
