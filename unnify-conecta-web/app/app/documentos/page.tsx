'use client';

import { useEffect, useState } from 'react';
import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';
import { createClient } from '@/lib/supabase/client';
import { BibliotecaDocumentos } from '@/components/documentos/BibliotecaDocumentos';
import { Solicitacoes } from '@/components/documentos/Solicitacoes';
import { ModuloCertidoes } from '@/components/certidoes/ModuloCertidoes';
import { Abas, CabecalhoPagina, useAvisoEVersao } from '@/components/documentos/PaginaComAviso';

type Aba = 'documentos' | 'certidoes' | 'solicitacoes';

export default function DocumentosEmpresaPage() {
  const { empresa, usuario } = useEmpresaAtual();
  const { aviso, setAviso, versao, alterado } = useAvisoEVersao();
  const [aba, setAba] = useState<Aba>('documentos');
  const [aguardando, setAguardando] = useState(0);

  useEffect(() => {
    if (window.location.hash === '#solicitacoes') setAba('solicitacoes');
    if (window.location.hash === '#certidoes') setAba('certidoes');
  }, []);

  useEffect(() => {
    if (!empresa) return;
    createClient().rpc('resumo_documentos_obrigacoes', { p_id_empresa: empresa.id })
      .then(({ data }) => setAguardando(Number((data as { solicitacoes_aguardando_empresa?: number } | null)?.solicitacoes_aguardando_empresa ?? 0)));
  }, [empresa, versao]);

  if (!empresa || !usuario) return null;
  const mudar = (a: Aba) => { setAba(a); window.history.replaceState(null, '', `#${a}`); };

  return (
    <div className="space-y-5 min-w-0">
      <CabecalhoPagina titulo="Meus documentos" subtitulo="Guarde os documentos da empresa e responda ao que o seu contador pedir." aviso={aviso} aoFecharAviso={() => setAviso(null)} />
      <Abas rotulo="Seções de documentos" atual={aba} aoMudar={mudar} abas={[
        { id: 'documentos', titulo: 'Documentos' },
        { id: 'certidoes', titulo: 'Certidões' },
        { id: 'solicitacoes', titulo: 'Solicitações do contador', contador: aguardando },
      ]} />
      {aba === 'certidoes' ? <ModuloCertidoes idEmpresa={empresa.id} cnpjEmpresa={empresa.cnpj} podeGerenciar />
        : aba === 'documentos'
        ? <BibliotecaDocumentos idEmpresa={empresa.id} papel="empresa" podeEnviar idUsuario={usuario.id} versao={versao} aoAlterar={alterado} />
        : <Solicitacoes idEmpresa={empresa.id} papel="empresa" versao={versao} aoAlterar={alterado} />}
    </div>
  );
}
