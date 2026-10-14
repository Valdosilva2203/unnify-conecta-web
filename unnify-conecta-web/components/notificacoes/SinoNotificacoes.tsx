'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { recursoAusente } from '@/lib/erros-banco';

interface Notificacao { id: string; titulo: string; mensagem: string; link: string | null; lida_em: string | null; criado_em: string }

// Notificações do próprio usuário (RLS). Atualiza ao abrir, ao voltar para a aba e a cada minuto.
export function SinoNotificacoes() {
  const [itens, setItens] = useState<Notificacao[]>([]);
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const indisponivel = useRef(false); // tabela inexistente neste banco: não consulta de novo (evita 404 a cada minuto)
  const carregar = useCallback(async () => {
    if (indisponivel.current) return;
    const { data, error } = await createClient().from('notificacoes').select('id, titulo, mensagem, link, lida_em, criado_em').order('criado_em', { ascending: false }).limit(15);
    if (recursoAusente(error)) { indisponivel.current = true; return; }
    if (!error) setItens((data ?? []) as Notificacao[]);
  }, []);
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 60000);
    const foco = () => document.visibilityState === 'visible' && carregar();
    document.addEventListener('visibilitychange', foco);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', foco); };
  }, [carregar]);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  const naoLidas = itens.filter((n) => !n.lida_em).length;
  const abrir = async () => {
    const abrindo = !aberto;
    setAberto(abrindo);
    if (abrindo && naoLidas > 0 && !indisponivel.current) {
      await createClient().rpc('marcar_notificacoes_lidas', { p_ids: null });
      setTimeout(carregar, 1500);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={abrir} aria-expanded={aberto} aria-label={naoLidas ? `Notificações (${naoLidas} não lidas)` : 'Notificações'}
        className="w-11 h-11 inline-flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
        <Bell className="w-5 h-5 text-gray-600" aria-hidden="true" />
        {naoLidas > 0 && <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-orange-600 text-white text-[10px] font-bold inline-flex items-center justify-center" aria-hidden="true">{naoLidas}</span>}
      </button>
      {aberto && (
        <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-1.5rem))] bg-white rounded-xl border border-gray-200 shadow-lg z-50" role="dialog" aria-label="Notificações">
          <p className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-900">Notificações</p>
          {itens.length === 0 ? <p className="px-4 py-6 text-sm text-gray-500 text-center">Nenhuma notificação.</p> : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-gray-100">
              {itens.map((n) => {
                const conteudo = (
                  <>
                    <span className="block text-sm font-semibold text-gray-900">{!n.lida_em && <span className="inline-block w-2 h-2 rounded-full bg-orange-600 mr-1.5 align-middle" aria-label="Não lida" />}{n.titulo}</span>
                    <span className="block text-xs text-gray-600 mt-0.5">{n.mensagem}</span>
                    <span className="block text-[11px] text-gray-400 mt-1">{new Date(n.criado_em).toLocaleString('pt-BR')}</span>
                  </>
                );
                return <li key={n.id}>{n.link ? <Link href={n.link} onClick={() => setAberto(false)} className="block px-4 py-3 hover:bg-gray-50">{conteudo}</Link> : <div className="px-4 py-3">{conteudo}</div>}</li>;
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
