'use client';

import { useEffect, useState } from 'react';
import { ExigePermissao, useEspacoEmpresa } from '@/components/contador/EspacoEmpresa';
import { BibliotecaDocumentos } from '@/components/documentos/BibliotecaDocumentos';
import { ModuloCertidoes } from '@/components/certidoes/ModuloCertidoes';
import { Abas } from '@/components/documentos/PaginaComAviso';

// Documentos da empresa: arquivos compartilhados ("ver_documentos") e certidões ("ver_documentos" vê; "gerenciar_certidoes" gerencia)
export default function DocumentosEmpresaPage() {
  const { empresa, contador, pode, versao, alterado } = useEspacoEmpresa();
  const verArquivos = pode('ver_documentos');
  const [aba, setAba] = useState<'arquivos' | 'certidoes'>(verArquivos ? 'arquivos' : 'certidoes');
  useEffect(() => { if (window.location.hash === '#certidoes') setAba('certidoes'); }, []);
  const mudar = (a: 'arquivos' | 'certidoes') => { setAba(a); window.history.replaceState(null, '', a === 'certidoes' ? '#certidoes' : window.location.pathname); };
  const abas = [...(verArquivos ? [{ id: 'arquivos' as const, titulo: 'Arquivos' }] : []), { id: 'certidoes' as const, titulo: 'Certidões' }];
  return (
    <ExigePermissao modulo="documentos">
      <div className="space-y-4 min-w-0">
        <Abas rotulo="Seções de documentos" atual={verArquivos ? aba : 'certidoes'} aoMudar={mudar} abas={abas} />
        {aba === 'arquivos' && verArquivos
          ? <BibliotecaDocumentos idEmpresa={empresa.id_empresa} papel="contador" podeEnviar={pode('enviar_documentos')} idUsuario={contador.id} versao={versao} aoAlterar={alterado} />
          : <ModuloCertidoes idEmpresa={empresa.id_empresa} cnpjEmpresa={empresa.cnpj} podeGerenciar={pode('gerenciar_certidoes')} />}
      </div>
    </ExigePermissao>
  );
}
