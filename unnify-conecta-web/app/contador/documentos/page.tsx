'use client';

import { useEffect, useState } from 'react';
import { useContadorAtual } from '@/components/contador/LayoutContador';
import { SeletorEmpresaVinculada, SemEmpresaAutorizada, useEmpresasVinculadas } from '@/components/contador/SeletorEmpresaVinculada';
import { BibliotecaDocumentos } from '@/components/documentos/BibliotecaDocumentos';
import { Solicitacoes } from '@/components/documentos/Solicitacoes';
import { Abas, CabecalhoPagina, useAvisoEVersao } from '@/components/documentos/PaginaComAviso';

type Aba = 'solicitacoes' | 'documentos';

// Contador: solicitações e documentos compartilhados das empresas que liberaram "Ver documentos"
export default function DocumentosContadorPage() {
  const contador = useContadorAtual();
  const empresas = useEmpresasVinculadas('ver_documentos');
  const { aviso, setAviso, versao, alterado } = useAvisoEVersao();
  const [idEmpresa, setIdEmpresa] = useState('');
  const [aba, setAba] = useState<Aba>('solicitacoes');

  useEffect(() => {
    if (empresas?.length && !empresas.some((e) => e.id_empresa === idEmpresa)) setIdEmpresa(empresas[0].id_empresa);
  }, [empresas, idEmpresa]);

  if (!contador || !empresas) return null;
  const empresa = empresas.find((e) => e.id_empresa === idEmpresa);
  return (
    <div className="space-y-5 min-w-0">
      <CabecalhoPagina titulo="Documentos" subtitulo="Solicite documentos às empresas e acompanhe o que foi compartilhado." aviso={aviso} aoFecharAviso={() => setAviso(null)}>
        {empresas.length > 0 && <SeletorEmpresaVinculada empresas={empresas} valor={idEmpresa} aoMudar={setIdEmpresa} />}
      </CabecalhoPagina>
      {empresas.length === 0 ? <SemEmpresaAutorizada permissao="Ver documentos" /> : empresa && (
        <>
          <Abas rotulo="Seções de documentos" atual={aba} aoMudar={setAba} abas={[{ id: 'solicitacoes', titulo: 'Solicitações' }, { id: 'documentos', titulo: 'Documentos compartilhados' }]} />
          {aba === 'solicitacoes'
            ? <Solicitacoes key={empresa.id_empresa} idEmpresa={empresa.id_empresa} papel="contador" versao={versao} aoAlterar={alterado} />
            : <BibliotecaDocumentos key={empresa.id_empresa} idEmpresa={empresa.id_empresa} papel="contador" podeEnviar={empresa.permissoes.includes('enviar_documentos')}
                idUsuario={contador.id} versao={versao} aoAlterar={alterado} />}
        </>
      )}
    </div>
  );
}
