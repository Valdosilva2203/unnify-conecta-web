'use client';

import { useEffect, useState } from 'react';
import { SeletorEmpresaVinculada, SemEmpresaAutorizada, useEmpresasVinculadas } from '@/components/contador/SeletorEmpresaVinculada';
import { ModuloObrigacoes } from '@/components/obrigacoes/ModuloObrigacoes';
import { CabecalhoPagina, useAvisoEVersao } from '@/components/documentos/PaginaComAviso';

// Contador: obrigações das empresas que liberaram "Gerenciar obrigações"
export default function ObrigacoesContadorPage() {
  const empresas = useEmpresasVinculadas('gerenciar_obrigacoes');
  const { aviso, setAviso, versao, alterado } = useAvisoEVersao();
  const [idEmpresa, setIdEmpresa] = useState('');

  useEffect(() => {
    if (empresas?.length && !empresas.some((e) => e.id_empresa === idEmpresa)) setIdEmpresa(empresas[0].id_empresa);
  }, [empresas, idEmpresa]);

  if (!empresas) return null;
  return (
    <div className="space-y-5 min-w-0">
      <CabecalhoPagina titulo="Obrigações" subtitulo="Prazos e compromissos das empresas que você atende." aviso={aviso} aoFecharAviso={() => setAviso(null)}>
        {empresas.length > 0 && <SeletorEmpresaVinculada empresas={empresas} valor={idEmpresa} aoMudar={setIdEmpresa} />}
      </CabecalhoPagina>
      {empresas.length === 0 ? <SemEmpresaAutorizada permissao="Gerenciar obrigações" />
        : idEmpresa && <ModuloObrigacoes key={idEmpresa} idEmpresa={idEmpresa} papel="contador" versao={versao} aoAlterar={alterado} />}
    </div>
  );
}
