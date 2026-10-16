'use client';

import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';
import { ModuloObrigacoes } from '@/components/obrigacoes/ModuloObrigacoes';
import { AlertCircle } from 'lucide-react';
import { CabecalhoPagina, useAvisoEVersao } from '@/components/documentos/PaginaComAviso';

export default function ObrigacoesEmpresaPage() {
  const { empresa } = useEmpresaAtual();
  const { aviso, setAviso, versao, alterado } = useAvisoEVersao();
  if (!empresa) return null;
  return (
    <div className="space-y-5 min-w-0">
      <CabecalhoPagina icone={AlertCircle} titulo="Obrigações" subtitulo="Acompanhe prazos e compromissos da empresa, com o seu contador." aviso={aviso} aoFecharAviso={() => setAviso(null)} />
      <ModuloObrigacoes idEmpresa={empresa.id} papel="empresa" versao={versao} aoAlterar={alterado} />
    </div>
  );
}
