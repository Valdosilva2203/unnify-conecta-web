'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail, RefreshCw, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { recursoAusente } from '@/lib/erros-banco';
import { SITUACAO_CONVITE, mascaraCnpj } from '@/lib/convites';
import { Selo } from '@/components/admin/tabela';

interface Convite {
  id: string; sentido: string; email_destino: string; nome_destino: string | null; cnpj_convidado: string | null;
  situacao: string; envio_status: 'pendente' | 'enviado' | 'falhou'; criado_em: string; expira_em: string;
}
const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

// Convites por e-mail enviados. idEmpresa = convites da empresa a contadores; sem idEmpresa = convites do contador logado.
export function ListaConvites({ idEmpresa, versao = 0 }: { idEmpresa?: string; versao?: number }) {
  const [itens, setItens] = useState<Convite[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ausente, setAusente] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data: linhas, error } = await createClient().rpc('convites_enviados', { p_id_empresa: idEmpresa ?? null });
    if (error) { setAusente(recursoAusente(error)); setErro(mensagemDeErro(error, 'Não foi possível carregar os convites.')); return; }
    setErro(null);
    setItens((linhas ?? []) as Convite[]);
  }, [idEmpresa]);
  useEffect(() => { carregar(); }, [carregar, versao]);

  const reenviar = async (c: Convite) => {
    setOcupado(c.id); setAviso(null);
    const r = await fetch(`/api/convites/${c.id}/reenviar`, { method: 'POST' }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setOcupado(null);
    if (!r || !r.ok) setAviso({ tipo: 'erro', texto: j.erro ?? 'Erro ao reenviar o convite.' });
    else setAviso(j.enviado ? { tipo: 'ok', texto: `Convite reenviado para ${c.email_destino}. O link anterior deixou de valer.` }
      : { tipo: 'erro', texto: 'Novo convite gerado, mas não conseguimos enviar o e-mail. Tente reenviar em instantes.' });
    carregar();
  };
  const cancelar = async (c: Convite) => {
    setOcupado(c.id); setAviso(null);
    const { error } = await createClient().rpc('cancelar_convite', { p_id: c.id });
    setOcupado(null);
    setAviso(error ? { tipo: 'erro', texto: mensagemDeErro(error, 'Não foi possível cancelar.') } : { tipo: 'ok', texto: 'Convite cancelado. O link deixou de valer.' });
    carregar();
  };

  return (
    <section aria-label="Convites enviados" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 min-w-0 space-y-3">
      <h2 className="font-bold text-gray-900 flex items-center gap-2"><Mail className="w-5 h-5 text-orange-600" aria-hidden="true" />Convites enviados por e-mail</h2>
      {aviso && <p role={aviso.tipo === 'erro' ? 'alert' : 'status'} className={`text-sm rounded-lg px-3 py-2 ${aviso.tipo === 'erro' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{aviso.texto}</p>}
      {erro ? <p role={ausente ? 'status' : 'alert'} data-testid={ausente ? 'convites-indisponivel' : undefined} className={`text-sm ${ausente ? 'text-amber-900 bg-amber-50 rounded-lg px-3 py-2' : 'text-red-700'}`}>{erro}</p>
        : itens === null ? <div role="status" aria-label="Carregando" className="h-16 rounded-xl bg-gray-50 animate-pulse" />
        : itens.length === 0 ? <p className="text-sm text-gray-500 py-4 text-center">Nenhum convite enviado.</p>
        : (
          <ul className="divide-y divide-gray-100">
            {itens.map((c) => {
              const s = SITUACAO_CONVITE[c.situacao] ?? SITUACAO_CONVITE.pendente;
              const aberto = c.situacao === 'pendente' || c.situacao === 'expirado';
              return (
                <li key={c.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2" data-testid={`convite-${c.email_destino}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 break-all">{c.nome_destino ? `${c.nome_destino} · ` : ''}{c.email_destino}</p>
                    <p className="text-xs text-gray-500">
                      {c.cnpj_convidado ? `CNPJ ${mascaraCnpj(c.cnpj_convidado)} · ` : ''}Enviado em {data(c.criado_em)}
                      {c.situacao === 'pendente' ? ` · vale até ${data(c.expira_em)}` : ''}
                    </p>
                    {c.envio_status === 'falhou' && aberto && <p className="text-xs font-semibold text-red-700">E-mail não enviado — use “Reenviar”.</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Selo tipo={s.selo} texto={s.texto} />
                    {aberto && (
                      <button type="button" disabled={ocupado === c.id} onClick={() => reenviar(c)}
                        className="min-h-11 px-3 inline-flex items-center gap-1 rounded-lg text-sm font-semibold text-orange-600 hover:bg-orange-50 disabled:opacity-50">
                        <RefreshCw className="w-4 h-4" aria-hidden="true" />Reenviar
                      </button>
                    )}
                    {c.situacao === 'pendente' && (
                      <button type="button" disabled={ocupado === c.id} onClick={() => cancelar(c)} aria-label={`Cancelar convite para ${c.email_destino}`}
                        className="min-h-11 px-3 inline-flex items-center gap-1 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50">
                        <X className="w-4 h-4" aria-hidden="true" />Cancelar
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}
