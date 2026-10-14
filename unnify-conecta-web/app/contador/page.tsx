'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, CalendarClock, CheckCircle2, ChevronRight, FileClock, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useContadorAtual } from '@/components/contador/LayoutContador';
import { formatarCnpj, mensagemDeErro } from '@/lib/contabil';
import { recursoAusente } from '@/lib/erros-banco';
import { formatarData } from '@/lib/financeiro';
import { CampoBusca, FiltroSelect, Selo } from '@/components/admin/tabela';
import { Indicador } from '@/components/financeiro/Indicador';

// Números por empresa: null = a empresa não concedeu a permissão daquela área (não é "zero")
interface LinhaPainel {
  id_empresa: string;
  nome: string;
  cnpj: string;
  permissoes: string[];
  solicitacoes_aguardando_analise: number | null;
  solicitacoes_aguardando_empresa: number | null;
  obrigacoes_abertas: number | null;
  obrigacoes_atrasadas: number | null;
  obrigacoes_7_dias: number | null;
  itens_concluidos: number;
}
interface Proxima { id: string; id_empresa: string; empresa_nome: string; titulo: string; data_vencimento: string; situacao: string }
// ausente = a função do banco ainda não existe neste ambiente (migration pendente): diferente de erro de rede e de lista vazia
type Estado<T> = { carregando: true } | { carregando: false; erro: string; ausente?: boolean } | { carregando: false; dados: T };

const n = (v: number | null | undefined) => Number(v ?? 0);
const pendenciasDe =(e: LinhaPainel) => n(e.solicitacoes_aguardando_analise) + n(e.obrigacoes_atrasadas) + n(e.obrigacoes_7_dias);
function situacaoEmpresa(e: LinhaPainel): { tipo: 'perigo' | 'alerta' | 'sucesso' | 'neutro'; texto: string } {
  if (e.obrigacoes_abertas === null) return { tipo: 'neutro', texto: 'Sem acesso a obrigações' };
  if (n(e.obrigacoes_atrasadas) > 0) return { tipo: 'perigo', texto: 'Atrasada' };
  if (n(e.obrigacoes_7_dias) > 0) return { tipo: 'alerta', texto: 'A vencer' };
  return { tipo: 'sucesso', texto: 'Em dia' };
}

export default function PainelContadorPage() {
  const contador = useContadorAtual();
  const [painel, setPainel] = useState<Estado<LinhaPainel[]>>({ carregando: true });
  const [proximas, setProximas] = useState<Estado<Proxima[]>>({ carregando: true });
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('');

  const carregar = useCallback(() => {
    const supabase = createClient();
    setPainel({ carregando: true });
    setProximas({ carregando: true });
    supabase.rpc('painel_contador').then(({ data, error }) => setPainel(error ? { carregando: false, erro: mensagemDeErro(error, 'Não foi possível carregar suas empresas.'), ausente: recursoAusente(error) } : { carregando: false, dados: (data ?? []) as LinhaPainel[] }));
    supabase.rpc('proximas_obrigacoes_contador', { p_limite: 8 }).then(({ data, error }) => setProximas(error ? { carregando: false, erro: mensagemDeErro(error, 'Não foi possível carregar as obrigações.') } : { carregando: false, dados: (data ?? []) as Proxima[] }));
  }, []);
  useEffect(() => { if (contador) carregar(); }, [contador, carregar]);

  const empresas = !painel.carregando && 'dados' in painel ? painel.dados : null;
  const visiveis = useMemo(() => (empresas ?? []).filter((e) => {
    const termo = busca.trim().toLowerCase();
    if (termo && !e.nome.toLowerCase().includes(termo) && !e.cnpj.replace(/\D/g, '').includes(termo.replace(/\D/g, '') || '§')) return false;
    if (filtro === 'pendencias') return pendenciasDe(e) > 0;
    if (filtro) return situacaoEmpresa(e).texto === { atrasada: 'Atrasada', avencer: 'A vencer', emdia: 'Em dia' }[filtro];
    return true;
  }), [empresas, busca, filtro]);

  if (!contador) return null;
  const total = (f: (e: LinhaPainel) => number) => (empresas ? String(empresas.reduce((s, e) => s + f(e), 0)) : painel.carregando ? '…' : 'Indisponível');

  return (
    <div className="space-y-5 min-w-0">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900">Painel do Contador</h1>
        <p className="text-gray-600 mt-1">Visão geral das empresas vinculadas.</p>
      </div>

      {'erro' in painel && painel.ausente && (
        <div role="status" data-testid="painel-indisponivel" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-3">
          <span>{painel.erro} Enquanto isso, a lista de empresas vinculadas continua disponível.</span>
          <Link href="/contador/empresas" className="min-h-11 px-3 inline-flex items-center font-semibold hover:underline">Ver minhas empresas</Link>
        </div>
      )}
      {'erro' in painel && !painel.ausente && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center justify-between gap-3">
          {painel.erro}
          <button type="button" onClick={carregar} className="min-h-11 px-3 inline-flex items-center gap-1 font-semibold hover:underline"><RefreshCw className="w-4 h-4" aria-hidden="true" />Tentar novamente</button>
        </div>
      )}

      <div className="grid gap-3 sm:gap-4 grid-cols-1 min-[360px]:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Empresas vinculadas" valor={empresas ? String(empresas.length) : painel.carregando ? '…' : 'Indisponível'} icone={Building2} cor="bg-blue-100 text-blue-600" />
        <Indicador titulo="Pendências" valor={total(pendenciasDe)} icone={FileClock} cor="bg-orange-100 text-orange-600" detalhe="documentos para analisar e prazos" />
        <Indicador titulo="A vencer (7 dias)" valor={total((e) => n(e.obrigacoes_7_dias))} icone={CalendarClock} cor="bg-red-100 text-red-600" />
        <Indicador titulo="Itens concluídos" valor={total((e) => n(e.itens_concluidos))} icone={CheckCircle2} cor="bg-green-100 text-green-600" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section aria-label="Lista de empresas vinculadas" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 min-w-0 space-y-3">
          <h2 className="font-bold text-gray-900">Empresas vinculadas</h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 min-w-0"><CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar empresa ou CNPJ..." /></div>
            <FiltroSelect valor={filtro} aoMudar={setFiltro}>
              <option value="">Todas as situações</option>
              <option value="pendencias">Com pendências</option>
              <option value="atrasada">Atrasada</option>
              <option value="avencer">A vencer</option>
              <option value="emdia">Em dia</option>
            </FiltroSelect>
          </div>
          {painel.carregando ? <div role="status" aria-label="Carregando" className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-xl bg-gray-50 animate-pulse" />)}</div>
            : !empresas ? null
            : visiveis.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">{empresas.length ? 'Nenhuma empresa com esses filtros.' : 'Nenhuma empresa vinculada ainda. As empresas convidam você pelo catálogo de contadores.'}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {visiveis.map((e) => {
                  const s = situacaoEmpresa(e);
                  const p = pendenciasDe(e);
                  return (
                    <li key={e.id_empresa}>
                      <Link href={`/contador/empresas/${e.id_empresa}`} className="flex items-center gap-3 py-3 hover:bg-gray-50 rounded-lg px-1" data-testid={`empresa-${e.nome}`}>
                        <span className="w-10 h-10 shrink-0 rounded-full bg-blue-50 text-blue-600 inline-flex items-center justify-center"><Building2 className="w-5 h-5" aria-hidden="true" /></span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold text-gray-900 truncate">{e.nome}</span>
                          <span className="block text-xs text-gray-500">CNPJ {formatarCnpj(e.cnpj)}</span>
                        </span>
                        <span className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                          {p > 0 && <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-xs font-semibold">{p} {p === 1 ? 'pendência' : 'pendências'}</span>}
                          <Selo tipo={s.tipo} texto={s.texto} />
                        </span>
                        <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" aria-hidden="true" />
                      </Link>
                      <span className="sm:hidden flex flex-wrap gap-1 pb-2 pl-14">
                        {p > 0 && <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-xs font-semibold">{p} {p === 1 ? 'pendência' : 'pendências'}</span>}
                        <Selo tipo={s.tipo} texto={s.texto} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
        </section>

        <section aria-label="Próximas obrigações" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-gray-900">Próximas obrigações</h2>
            <Link href="/contador/obrigacoes" className="min-h-11 inline-flex items-center text-sm font-semibold text-orange-600 hover:underline">Ver todas</Link>
          </div>
          {proximas.carregando ? <div role="status" aria-label="Carregando" className="h-40 rounded-xl bg-gray-50 animate-pulse" />
            : 'erro' in proximas ? <p role="alert" className="text-sm text-red-700">{proximas.erro}</p>
            : proximas.dados.length === 0 ? <p className="text-sm text-gray-500 text-center py-8">Nenhuma obrigação em aberto nas empresas que liberaram “Gerenciar obrigações”.</p>
            : (
              <ul className="divide-y divide-gray-100">
                {proximas.dados.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 py-2.5" data-testid={`proxima-${o.titulo}`}>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-gray-900 truncate">{o.titulo}</span>
                      <span className="block text-xs text-gray-500 truncate">{o.empresa_nome} · vence {formatarData(o.data_vencimento)}</span>
                    </span>
                    <Selo tipo={o.situacao === 'atrasada' ? 'perigo' : o.situacao === 'em_andamento' ? 'info' : 'alerta'} texto={o.situacao === 'atrasada' ? 'Atrasada' : o.situacao === 'em_andamento' ? 'Em andamento' : 'A vencer'} />
                    <Link href={`/contador/empresas/${o.id_empresa}#obrigacoes`} className="min-h-11 inline-flex items-center text-sm font-semibold text-orange-600 hover:underline" aria-label={`Ver ${o.titulo}`}>Ver</Link>
                  </li>
                ))}
              </ul>
            )}
        </section>
      </div>
    </div>
  );
}
