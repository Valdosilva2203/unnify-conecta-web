'use client';

import { useEffect, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarData, rotuloMes } from '@/lib/financeiro';
import { useColaborador } from '@/components/colaborador/LayoutColaborador';
import { Cartao, Carregando, Erro } from '@/components/colaborador/comum';

interface Holerite { id: string; competencia: string; nome_arquivo: string; caminho: string; enviado_em: string }

// Holerites disponibilizados (competência aprovada) — só os do próprio colaborador; download por link temporário
export default function MeusDocumentosPage() {
  const { vinculo } = useColaborador();
  const [lista, setLista] = useState<Holerite[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);
  useEffect(() => {
    createClient().rpc('meus_holerites', { p_id_funcionario: vinculo.id_funcionario }).then(({ data, error }) => {
      if (error) setErro(mensagemDeErro(error, 'Não foi possível carregar seus documentos.'));
      else setLista((data ?? []) as Holerite[]);
    });
  }, [vinculo.id_funcionario]);
  async function baixar(h: Holerite) {
    if (baixando) return;
    setBaixando(h.id); setErro(null);
    const { data, error } = await createClient().storage.from('folha').createSignedUrl(h.caminho, 60, { download: h.nome_arquivo });
    setBaixando(null);
    if (error || !data?.signedUrl) return setErro('Não foi possível abrir o documento.');
    window.location.assign(data.signedUrl);
  }
  return (
    <>
      <h1 className="text-2xl font-black text-gray-900">Meus documentos</h1>
      <Erro texto={erro} />
      <Cartao titulo="Holerites" id="titulo-holerites">
        {lista === null && !erro ? <Carregando rotulo="Carregando holerites" /> : !lista?.length ? (
          <p className="text-sm text-gray-500">Nenhum holerite disponível ainda. Eles aparecem aqui quando a folha do mês é aprovada.</p>
        ) : (
          <ul className="divide-y divide-gray-100" data-testid="holerites">
            {lista.map((h) => (
              <li key={h.id} className="py-3 flex items-center gap-3">
                <span className="w-10 h-10 shrink-0 rounded-lg bg-orange-50 text-orange-600 inline-flex items-center justify-center"><FileText className="w-5 h-5" aria-hidden="true" /></span>
                <div className="flex-1 min-w-0"><p className="font-semibold text-gray-900">Holerite – {rotuloMes(h.competencia)}</p>
                  <p className="text-xs text-gray-500 truncate">Disponível em {formatarData(h.enviado_em.slice(0, 10))} · {h.nome_arquivo}</p></div>
                <button type="button" onClick={() => baixar(h)} disabled={baixando === h.id} aria-label={`Baixar holerite de ${rotuloMes(h.competencia)}`}
                  className="w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"><Download className="w-5 h-5" aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </>
  );
}
