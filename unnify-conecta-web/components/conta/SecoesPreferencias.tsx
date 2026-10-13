'use client';

import { useState } from 'react';
import { Bell, SlidersHorizontal } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { aplicarPreferenciasExibicao, type Preferencias } from '@/lib/conta';
import { classeBotaoPrimario } from '@/components/ui/Modal';
import { Aviso } from './Aviso';

// Categorias de notificação. Só "vínculos contábeis" corresponde a um recurso já existente;
// as demais aparecem como indisponíveis até os módulos serem lançados.
const CATEGORIAS = [
  { chave: 'vinculos', rotulo: 'Vínculos contábeis', descricao: 'Solicitações, aceites e encerramentos de vínculo', disponivel: true },
  { chave: 'documentos', rotulo: 'Documentos', descricao: 'Envio e recebimento de documentos', disponivel: false },
  { chave: 'obrigacoes', rotulo: 'Obrigações', descricao: 'Prazos e obrigações fiscais', disponivel: false },
  { chave: 'agenda', rotulo: 'Agenda', descricao: 'Compromissos e lembretes', disponivel: false },
  { chave: 'comunicados', rotulo: 'Comunicados', descricao: 'Avisos da plataforma', disponivel: false },
] as const;

function Interruptor({ id, marcado, aoMudar, rotulo, desativado }: { id: string; marcado: boolean; aoMudar: (v: boolean) => void; rotulo: string; desativado?: boolean }) {
  return (
    <label htmlFor={id} className={`inline-flex items-center gap-2 min-h-11 ${desativado ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <input id={id} type="checkbox" role="switch" aria-checked={marcado} className="peer sr-only" checked={marcado} disabled={desativado} onChange={(e) => aoMudar(e.target.checked)} />
      <span className="w-11 h-6 rounded-full bg-gray-300 peer-checked:bg-orange-600 relative transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-500 peer-focus-visible:ring-offset-2" />
      <span className="text-sm text-gray-700">{rotulo}</span>
    </label>
  );
}

async function salvarPreferencias(idUsuario: string, dados: Partial<Preferencias>) {
  return createClient()
    .from('preferencias_usuario')
    .upsert({ id_usuario: idUsuario, ...dados, atualizado_em: new Date().toISOString() }, { onConflict: 'id_usuario' });
}

export function Notificacoes({ idUsuario, preferencias, aoSalvar }: { idUsuario: string; preferencias: Preferencias; aoSalvar: (p: Preferencias) => void }) {
  const [valores, setValores] = useState(preferencias.notificacoes);
  const [salvando, setSalvando] = useState(false);
  const [retorno, setRetorno] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

  const valor = (cat: string, canal: 'sistema' | 'email') => valores[cat]?.[canal] ?? true;
  const mudar = (cat: string, canal: 'sistema' | 'email', v: boolean) => setValores((atual) => ({ ...atual, [cat]: { ...atual[cat], [canal]: v } }));

  const salvar = async () => {
    setSalvando(true);
    setRetorno(null);
    const { error } = await salvarPreferencias(idUsuario, { notificacoes: valores });
    setSalvando(false);
    if (error) return setRetorno({ tipo: 'erro', texto: 'Não foi possível salvar suas preferências.' });
    aoSalvar({ ...preferencias, notificacoes: valores });
    setRetorno({ tipo: 'sucesso', texto: 'Preferências de notificação salvas.' });
  };

  return (
    <section aria-labelledby="titulo-notificacoes" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
      <div className="flex items-start gap-3 mb-4">
        <span className="w-10 h-10 shrink-0 rounded-xl bg-orange-100 text-orange-600 inline-flex items-center justify-center">
          <Bell className="w-5 h-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="titulo-notificacoes" className="text-lg font-bold text-gray-900">
            Notificações
          </h2>
          <p className="text-sm text-gray-600">Escolha como quer ser avisado.</p>
        </div>
      </div>
      <Aviso tipo="info">
        <strong>O envio de notificações ainda está em desenvolvimento.</strong> Por enquanto nenhuma notificação é enviada. Suas escolhas ficam salvas e passam a valer quando o recurso for lançado.
      </Aviso>
      <ul className="mt-4 divide-y divide-gray-100">
        {CATEGORIAS.map((c) => (
          <li key={c.chave} className="py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                {c.rotulo}
                {!c.disponivel && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Em breve</span>}
              </p>
              <p className="text-xs text-gray-500">{c.descricao}</p>
            </div>
            <div className="flex flex-wrap gap-x-5">
              <Interruptor id={`notif-${c.chave}-sistema`} rotulo="No sistema" marcado={c.disponivel && valor(c.chave, 'sistema')} desativado={!c.disponivel} aoMudar={(v) => mudar(c.chave, 'sistema', v)} />
              <Interruptor id={`notif-${c.chave}-email`} rotulo="Por e-mail" marcado={c.disponivel && valor(c.chave, 'email')} desativado={!c.disponivel} aoMudar={(v) => mudar(c.chave, 'email', v)} />
            </div>
          </li>
        ))}
      </ul>
      {retorno && <div className="mt-3"><Aviso tipo={retorno.tipo}>{retorno.texto}</Aviso></div>}
      <button type="button" onClick={salvar} disabled={salvando} className={`${classeBotaoPrimario} mt-4 w-full sm:w-auto`}>
        {salvando ? 'Salvando...' : 'Salvar preferências'}
      </button>
    </section>
  );
}

export function PreferenciasExibicao({ idUsuario, preferencias, aoSalvar }: { idUsuario: string; preferencias: Preferencias; aoSalvar: (p: Preferencias) => void }) {
  const [retorno, setRetorno] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

  const mudarAnimacoes = async (v: boolean) => {
    setRetorno(null);
    aplicarPreferenciasExibicao({ reduzir_animacoes: v });
    const { error } = await salvarPreferencias(idUsuario, { reduzir_animacoes: v });
    if (error) {
      aplicarPreferenciasExibicao({ reduzir_animacoes: preferencias.reduzir_animacoes });
      return setRetorno({ tipo: 'erro', texto: 'Não foi possível salvar a preferência.' });
    }
    aoSalvar({ ...preferencias, reduzir_animacoes: v });
    setRetorno({ tipo: 'sucesso', texto: 'Preferência salva. Vale em todos os seus dispositivos.' });
  };

  return (
    <section aria-labelledby="titulo-preferencias" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
      <div className="flex items-start gap-3 mb-4">
        <span className="w-10 h-10 shrink-0 rounded-xl bg-orange-100 text-orange-600 inline-flex items-center justify-center">
          <SlidersHorizontal className="w-5 h-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="titulo-preferencias" className="text-lg font-bold text-gray-900">
            Preferências
          </h2>
          <p className="text-sm text-gray-600">Tema e visualização.</p>
        </div>
      </div>
      <ul className="divide-y divide-gray-100">
        <li className="py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-gray-900">Tema</p>
            <p className="text-xs text-gray-500">O Unnify Conecta usa o tema claro. O tema escuro ainda não está disponível.</p>
          </div>
          <span className="text-sm font-semibold text-gray-700">Claro</span>
        </li>
        <li className="py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-gray-900">Reduzir animações</p>
            <p className="text-xs text-gray-500">Desliga transições e efeitos de movimento da interface.</p>
          </div>
          <Interruptor id="pref-reduzir-animacoes" rotulo={preferencias.reduzir_animacoes ? 'Ativado' : 'Desativado'} marcado={preferencias.reduzir_animacoes} aoMudar={mudarAnimacoes} />
        </li>
      </ul>
      {retorno && <div className="mt-3"><Aviso tipo={retorno.tipo}>{retorno.texto}</Aviso></div>}
    </section>
  );
}
