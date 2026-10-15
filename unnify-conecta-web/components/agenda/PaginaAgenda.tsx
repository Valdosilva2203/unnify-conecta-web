'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, Calendar, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, ExternalLink, FileText, List, MapPin, Pencil, Plus, RefreshCw, Share2, Trash2, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarMoeda } from '@/lib/financeiro';
import { recursoAusente } from '@/lib/erros-banco';
import { Selo } from '@/components/admin/tabela';
import { Modal, classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { ModalCompromisso } from '@/components/agenda/ModalCompromisso';
import {
  CATEGORIAS, DIAS_CURTOS, GRUPO_STATUS, ORIGENS, STATUS, diasDoEvento, estiloEvento, fimDoMes, gradeDoMes, hojeSP, horarioEvento,
  inicioDaSemana, inicioDoMes, rotuloDiaCurto, rotuloDiaLongo, rotuloMesAno, somarDias, somarMeses, type EventoAgenda, type Origem,
} from '@/lib/agenda';

type Visao = 'mes' | 'semana' | 'lista';
type Estado = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string; ausente: boolean } | { tipo: 'ok'; eventos: EventoAgenda[] };
const filtroSelect = 'min-h-11 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500';

interface Props {
  modo: 'empresa' | 'contador';
  usuarioId: string;
  empresa?: { id: string };                          // modo empresa: a empresa da agenda
  empresas?: { id: string; nome: string }[];          // modo contador: empresas vinculadas (filtro)
  empresasAgenda?: { id: string; nome: string }[];    // modo contador: empresas com "gerenciar_agenda" (compartilhar)
  idEmpresaFixa?: string;                             // modo contador dentro do espaço de UMA empresa
  embutida?: boolean;                                 // dentro de outra página (título h2, sem h1)
}

// Agenda única do sistema: o empresário (modo empresa) e o contador (modo contador) usam esta mesma tela e a mesma tabela.
export function PaginaAgenda({ modo, usuarioId, empresa, empresas = [], empresasAgenda = [], idEmpresaFixa, embutida = false }: Props) {
  const [hoje, setHoje] = useState('');
  const [visao, setVisao] = useState<Visao>('mes');
  const [referencia, setReferencia] = useState('');
  const [selecionado, setSelecionado] = useState('');
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [origem, setOrigem] = useState('');
  const [categoria, setCategoria] = useState('');
  const [status, setStatus] = useState('');
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [membros, setMembros] = useState<{ id_usuario: string; nome: string }[]>([]);
  const [modal, setModal] = useState<{ evento: EventoAgenda | null } | null>(null);
  const [excluindo, setExcluindo] = useState<EventoAgenda | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  // Data atual só no navegador (cacheComponents)
  useEffect(() => { const h = hojeSP(); setHoje(h); setReferencia(h); setSelecionado(h); }, []);

  // Período consultado: grade do mês (42 dias), semana (7) ou mês (lista)
  const periodo = useMemo(() => {
    if (!referencia) return null;
    if (visao === 'mes') { const g = gradeDoMes(referencia); return { ini: g[0], fim: g[41] }; }
    if (visao === 'semana') { const i = inicioDaSemana(referencia); return { ini: i, fim: somarDias(i, 6) }; }
    return { ini: inicioDoMes(referencia), fim: fimDoMes(referencia) };
  }, [referencia, visao]);

  const carregar = useCallback((silencioso = false) => {
    if (!periodo || (modo === 'empresa' && !empresa)) return;
    if (!silencioso) setEstado({ tipo: 'carregando' });
    const supabase = createClient();
    const chamada = modo === 'empresa'
      ? supabase.rpc('agenda_eventos', { p_id_empresa: empresa!.id, p_inicio: periodo.ini, p_fim: periodo.fim })
      : supabase.rpc('agenda_contador', { p_inicio: periodo.ini, p_fim: periodo.fim, p_id_empresa: idEmpresaFixa ?? null });
    chamada.then(({ data, error }) => {
      if (error) return setEstado({ tipo: 'erro', mensagem: mensagemDeErro(error, 'Não foi possível carregar a agenda.'), ausente: recursoAusente(error) });
      setEstado({ tipo: 'ok', eventos: (data ?? []) as EventoAgenda[] });
    });
  }, [empresa, modo, periodo, idEmpresaFixa]);
  useEffect(() => { carregar(); }, [carregar, versao]);
  useEffect(() => {
    const voltar = () => document.visibilityState === 'visible' && carregar(true);
    document.addEventListener('visibilitychange', voltar);
    return () => document.removeEventListener('visibilitychange', voltar);
  }, [carregar]);
  useEffect(() => {
    if (modo !== 'empresa' || !empresa) return;
    createClient().rpc('membros_agenda', { p_id_empresa: empresa.id }).then(({ data }) => setMembros((data ?? []) as { id_usuario: string; nome: string }[]));
  }, [empresa, modo]);

  const eventos = estado.tipo === 'ok' ? estado.eventos : [];
  const filtrados = useMemo(() => eventos.filter((e) => {
    if (origem && e.origem !== origem) return false;
    if (categoria && !(e.origem === 'compromisso' && e.categoria === categoria)) return false;
    if (status && !GRUPO_STATUS[status]?.includes(e.status)) return false;
    if (filtroEmpresa && (filtroEmpresa === 'pessoal' ? !!e.id_empresa : e.id_empresa !== filtroEmpresa)) return false;
    return true;
  }).sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : a.titulo.localeCompare(b.titulo))), [eventos, origem, categoria, status, filtroEmpresa]);
  const porDia = useMemo(() => {
    const m: Record<string, EventoAgenda[]> = {};
    for (const e of filtrados) for (const d of diasDoEvento(e)) (m[d] ??= []).push(e);
    return m;
  }, [filtrados]);

  if ((modo === 'empresa' && !empresa) || !referencia || !periodo) return null;

  const navegar = (n: number) => {
    const nova = visao === 'semana' ? somarDias(referencia, 7 * n) : somarMeses(referencia, n);
    setReferencia(nova);
    setSelecionado(visao === 'semana' ? nova : inicioDoMes(nova));
  };
  const irHoje = () => { setReferencia(hoje); setSelecionado(hoje); };
  const alterado = (m: string) => { setAviso(m); setModal(null); setExcluindo(null); setVersao((v) => v + 1); };

  // Sincroniza status pelas funções DO MÓDULO DE ORIGEM (sem cópia na agenda)
  const concluirNaOrigem = async (e: EventoAgenda) => {
    setErroAcao(null);
    const supabase = createClient();
    const { error } = e.origem === 'tarefa'
      ? await supabase.rpc('alterar_status_tarefa', { p_id: e.id, p_status: 'concluida' })
      : await supabase.rpc('alterar_situacao_obrigacao', { p_id: e.id, p_acao: 'concluir', p_motivo: null });
    if (error) return setErroAcao(mensagemDeErro(error, 'Não foi possível concluir.'));
    alterado(`${ORIGENS[e.origem]} concluída.`);
  };

  const titulo = visao === 'semana' ? `${rotuloDiaCurto(periodo.ini)} a ${rotuloDiaCurto(periodo.fim)} de ${periodo.fim.slice(0, 4)}` : rotuloMesAno(referencia);
  const doMes = filtrados.filter((e) => diasDoEvento(e).some((d) => d.slice(0, 7) === referencia.slice(0, 7)));
  const contar = (f: (e: EventoAgenda) => boolean) => (estado.tipo === 'ok' ? String(doMes.filter(f).length) : estado.tipo === 'carregando' ? '…' : '—');

  return (
    <div className="space-y-5 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-2xl bg-orange-100 text-orange-600 inline-flex items-center justify-center"><Calendar className="w-7 h-7" aria-hidden="true" /></span>
          <div className="min-w-0">
            {embutida ? <h2 className="text-xl font-black text-gray-900">Agenda</h2> : <h1 className="text-2xl sm:text-3xl font-black text-gray-900">Agenda</h1>}
            <p className="text-gray-600 mt-1 text-sm sm:text-base">{modo === 'empresa' ? 'Organize seus compromissos, tarefas, obrigações e vencimentos em um só lugar.' : 'Seus compromissos, os compartilhados com as empresas atendidas e as obrigações dos clientes.'}</p>
          </div>
        </div>
        <button type="button" className={`${classeBotaoPrimario} whitespace-nowrap shrink-0`} onClick={() => setModal({ evento: null })}><Plus className="w-4 h-4" aria-hidden="true" />Novo compromisso</button>
      </div>

      {aviso && (
        <div role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex justify-between gap-3">
          <span>{aviso}</span><button type="button" className="underline min-h-6" onClick={() => setAviso(null)}>Fechar</button>
        </div>
      )}
      {erroAcao && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erroAcao}</p>}

      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <section aria-label="Calendário" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 sm:p-4 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div role="tablist" aria-label="Visualização" className="flex gap-1">
              {([['mes', 'Mês', CalendarDays], ['semana', 'Semana', Calendar], ['lista', 'Lista', List]] as const).map(([v, r, Icone]) => (
                <button key={v} type="button" role="tab" aria-selected={visao === v} onClick={() => setVisao(v)}
                  className={`min-h-11 px-2.5 sm:px-4 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 ${visao === v ? 'bg-orange-600 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>
                  <Icone className="w-4 h-4" aria-hidden="true" />{r}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 w-full sm:w-auto sm:ml-auto min-w-0">
              <button type="button" onClick={() => navegar(-1)} aria-label="Período anterior" className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronLeft className="w-5 h-5" aria-hidden="true" /></button>
              <button type="button" onClick={() => navegar(1)} aria-label="Próximo período" className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronRight className="w-5 h-5" aria-hidden="true" /></button>
              <h2 className="px-1 sm:px-2 flex-1 sm:flex-none text-center font-bold text-gray-900 text-sm sm:text-base truncate min-w-0" aria-live="polite">{titulo}</h2>
              <button type="button" onClick={irHoje} className="min-h-11 px-3 rounded-lg border border-gray-200 text-sm font-semibold hover:bg-gray-50">Hoje</button>
            </div>
          </div>

          {estado.tipo === 'carregando' && <div role="status" aria-label="Carregando agenda" className="h-[28rem] rounded-xl bg-gray-50 animate-pulse" />}
          {estado.tipo === 'erro' && (
            estado.ausente
              ? <p role="status" data-testid="agenda-indisponivel" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{estado.mensagem}</p>
              : <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex flex-wrap items-center justify-between gap-3">
                  {estado.mensagem}
                  <button type="button" onClick={() => carregar()} className="min-h-11 px-3 inline-flex items-center gap-1 font-semibold hover:underline"><RefreshCw className="w-4 h-4" aria-hidden="true" />Tentar novamente</button>
                </div>
          )}

          {estado.tipo === 'ok' && visao === 'mes' && (
            <div className="grid grid-cols-7 border-t border-l border-gray-100" data-testid="grade-mes">
              {DIAS_CURTOS.map((d) => <div key={d} className="border-r border-b border-gray-100 py-2 text-center text-xs sm:text-sm font-semibold text-gray-600">{d}</div>)}
              {gradeDoMes(referencia).map((d) => {
                const doDia = porDia[d] ?? [];
                const fora = d.slice(0, 7) !== referencia.slice(0, 7);
                return (
                  <button key={d} type="button" onClick={() => setSelecionado(d)} aria-label={`${rotuloDiaLongo(d)}: ${doDia.length} ${doDia.length === 1 ? 'evento' : 'eventos'}`}
                    aria-pressed={selecionado === d} data-testid={`dia-${d}`}
                    className={`min-h-16 sm:min-h-24 border-r border-b border-gray-100 p-1 sm:p-1.5 text-left align-top flex flex-col gap-0.5 min-w-0 ${selecionado === d ? 'bg-orange-50 ring-2 ring-inset ring-orange-300' : 'hover:bg-gray-50'}`}>
                    <span className={`text-xs sm:text-sm self-center sm:self-start ${d === hoje ? 'w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-orange-600 text-white inline-flex items-center justify-center font-bold' : fora ? 'text-gray-300' : 'text-gray-800'}`}>{Number(d.slice(8))}</span>
                    {/* Celular: pontos coloridos; telas maiores: até 2 itens + contador */}
                    <span className="flex flex-wrap gap-0.5 justify-center sm:hidden">{doDia.slice(0, 4).map((e) => <span key={e.origem + e.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: estiloEvento(e).cor }} />)}</span>
                    <span className="hidden sm:flex flex-col gap-0.5 min-w-0">
                      {doDia.slice(0, 2).map((e) => (
                        <span key={e.origem + e.id} className="text-[11px] leading-tight rounded px-1 py-0.5 truncate font-medium" style={{ backgroundColor: `${estiloEvento(e).cor}1a`, color: estiloEvento(e).cor }}>
                          {e.titulo}
                        </span>
                      ))}
                      {doDia.length > 2 && <span className="text-[11px] text-gray-500 px-1">+{doDia.length - 2}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {estado.tipo === 'ok' && visao === 'semana' && (
            <div className="grid gap-2 sm:grid-cols-7" data-testid="grade-semana">
              {Array.from({ length: 7 }, (_, i) => somarDias(periodo.ini, i)).map((d, i) => (
                <div key={d} className={`rounded-xl border p-2 min-h-24 sm:min-h-64 min-w-0 ${d === hoje ? 'border-orange-300 bg-orange-50/40' : 'border-gray-100'}`}>
                  <button type="button" onClick={() => setSelecionado(d)} className="w-full text-left text-xs font-semibold text-gray-600 min-h-8">{DIAS_CURTOS[i]} {rotuloDiaCurto(d)}</button>
                  <ul className="space-y-1">{(porDia[d] ?? []).map((e) => <ItemCompacto key={e.origem + e.id} e={e} aoAbrir={() => setSelecionado(d)} />)}</ul>
                </div>
              ))}
            </div>
          )}

          {estado.tipo === 'ok' && visao === 'lista' && (
            filtrados.length === 0 ? <Vazio aoNovo={() => setModal({ evento: null })} /> : (
              <ul className="space-y-4" data-testid="lista-agenda">
                {Object.keys(porDia).filter((d) => d.slice(0, 7) === referencia.slice(0, 7)).sort().map((d) => (
                  <li key={d}>
                    <h3 className="text-sm font-bold text-gray-700 mb-2">{rotuloDiaLongo(d)}</h3>
                    <ul className="space-y-2">{porDia[d].map((e) => <CartaoEvento key={e.origem + e.id} e={e} mostrarEmpresa={modo === 'contador'} aoEditar={() => setModal({ evento: e })} aoExcluir={() => setExcluindo(e)} aoConcluir={() => concluirNaOrigem(e)} />)}</ul>
                  </li>
                ))}
              </ul>
            )
          )}
        </section>

        <aside aria-label="Compromissos do dia" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 sm:p-4 min-w-0 space-y-3">
          {modo === 'contador' && !idEmpresaFixa && (
            <select aria-label="Filtrar por empresa" value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)} className={`${filtroSelect} w-full`}>
              <option value="">Todas as empresas</option><option value="pessoal">Somente pessoais</option>
              {empresas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
          )}
          <div className="grid grid-cols-1 min-[420px]:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3 gap-2">
            <select aria-label="Filtrar por origem" value={origem} onChange={(e) => setOrigem(e.target.value)} className={filtroSelect}>
              <option value="">Todos</option>{Object.entries(ORIGENS).filter(([v]) => modo === 'empresa' || v === 'compromisso' || v === 'obrigacao').map(([v, r]) => <option key={v} value={v}>{v === 'financeiro' ? 'Vencimentos' : `${r}s`}</option>)}
            </select>
            <select aria-label="Filtrar por categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={filtroSelect}>
              <option value="">Categoria</option>{Object.entries(CATEGORIAS).map(([v, c]) => <option key={v} value={v}>{c.rotulo}</option>)}
            </select>
            <select aria-label="Filtrar por status" value={status} onChange={(e) => setStatus(e.target.value)} className={filtroSelect}>
              <option value="">Status</option><option value="abertos">Em aberto</option><option value="atrasado">Atrasados</option><option value="concluido">Concluídos</option><option value="cancelado">Cancelados</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <h2 className="flex-1 font-bold text-gray-900 text-sm sm:text-base">{rotuloDiaLongo(selecionado)}</h2>
            <button type="button" aria-label="Dia anterior" onClick={() => { const d = somarDias(selecionado, -1); setSelecionado(d); if (d < periodo.ini) navegar(-1); }} className="w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-gray-50"><ChevronLeft className="w-5 h-5" aria-hidden="true" /></button>
            <button type="button" aria-label="Próximo dia" onClick={() => { const d = somarDias(selecionado, 1); setSelecionado(d); if (d > periodo.fim) navegar(1); }} className="w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-gray-50"><ChevronRight className="w-5 h-5" aria-hidden="true" /></button>
          </div>
          {estado.tipo === 'ok' && (
            (porDia[selecionado] ?? []).length === 0
              ? <Vazio aoNovo={() => setModal({ evento: null })} curto />
              : (
                <>
                  <p className="text-xs text-gray-500 text-right">{(porDia[selecionado] ?? []).length} {(porDia[selecionado] ?? []).length === 1 ? 'item' : 'itens'}</p>
                  <ul className="space-y-2" data-testid="itens-do-dia">
                    {(porDia[selecionado] ?? []).map((e) => <CartaoEvento key={e.origem + e.id} e={e} mostrarEmpresa={modo === 'contador'} aoEditar={() => setModal({ evento: e })} aoExcluir={() => setExcluindo(e)} aoConcluir={() => concluirNaOrigem(e)} />)}
                  </ul>
                </>
              )
          )}
        </aside>
      </div>

      <div className="grid gap-3 grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4">
        {(modo === 'empresa' ? [
          { titulo: 'Compromissos este mês', valor: contar((e) => e.origem === 'compromisso' && e.status !== 'cancelado'), Icone: Calendar, cor: 'bg-blue-50 text-blue-600' },
          { titulo: 'Tarefas pendentes', valor: contar((e) => e.origem === 'tarefa' && ['pendente', 'em_andamento', 'atrasado'].includes(e.status)), Icone: CheckCircle2, cor: 'bg-green-50 text-green-600' },
          { titulo: 'Obrigações este mês', valor: contar((e) => e.origem === 'obrigacao' && e.status !== 'cancelado'), Icone: FileText, cor: 'bg-red-50 text-red-600' },
          { titulo: 'Vencimentos este mês', valor: contar((e) => e.origem === 'financeiro'), Icone: Clock, cor: 'bg-purple-50 text-purple-600' },
        ] : [
          { titulo: 'Compromissos este mês', valor: contar((e) => e.origem === 'compromisso' && e.status !== 'cancelado'), Icone: Calendar, cor: 'bg-blue-50 text-blue-600' },
          { titulo: 'Compartilhados com empresas', valor: contar((e) => e.origem === 'compromisso' && e.visibilidade === 'compartilhado' && e.status !== 'cancelado'), Icone: Share2, cor: 'bg-green-50 text-green-600' },
          { titulo: 'Pessoais este mês', valor: contar((e) => e.origem === 'compromisso' && !e.id_empresa && e.status !== 'cancelado'), Icone: User, cor: 'bg-purple-50 text-purple-600' },
          { titulo: 'Obrigações dos clientes', valor: contar((e) => e.origem === 'obrigacao' && e.status !== 'cancelado'), Icone: FileText, cor: 'bg-red-50 text-red-600' },
        ]).map(({ titulo: t, valor, Icone, cor }) => (
          <section key={t} aria-label={t} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <span className={`w-12 h-12 rounded-xl inline-flex items-center justify-center ${cor}`}><Icone className="w-6 h-6" aria-hidden="true" /></span>
            <div><p className="text-2xl font-black text-gray-900">{valor}</p><p className="text-sm text-gray-600">{t}</p></div>
          </section>
        ))}
      </div>

      <ModalCompromisso aberto={!!modal} aoFechar={() => setModal(null)} idEmpresa={empresa?.id ?? null} empresasContador={modo === 'contador' ? empresasAgenda : undefined} empresaPadrao={idEmpresaFixa} permitirPessoal={!idEmpresaFixa}
        diaPadrao={selecionado} evento={modal?.evento ?? null} membros={membros} idUsuario={usuarioId} aoSalvar={alterado} />
      <Modal aberto={!!excluindo} aoFechar={() => setExcluindo(null)} titulo="Excluir compromisso" descricao={excluindo?.titulo}
        rodape={<>
          <button type="button" className={classeBotaoSecundario} onClick={() => setExcluindo(null)}>Voltar</button>
          <button type="button" className={classeBotaoPerigo} onClick={async () => {
            const { error } = await createClient().rpc('excluir_compromisso', { p_id: excluindo!.id });
            if (error) { setErroAcao(mensagemDeErro(error, 'Não foi possível excluir.')); setExcluindo(null); return; }
            alterado('Compromisso excluído.');
          }}>Excluir</button>
        </>}>
        <p className="text-sm text-gray-700">O compromisso sai da agenda de todos.</p>
      </Modal>
    </div>
  );
}

function Vazio({ aoNovo, curto = false }: { aoNovo: () => void; curto?: boolean }) {
  return (
    <div className={`text-center ${curto ? 'py-6' : 'py-12'}`}>
      <p className="text-sm text-gray-500">Nenhum compromisso, tarefa, obrigação ou vencimento {curto ? 'neste dia' : 'neste período'}.</p>
      <button type="button" onClick={aoNovo} className="mt-2 min-h-11 text-sm font-semibold text-orange-600 hover:underline">+ Novo compromisso</button>
    </div>
  );
}

function ItemCompacto({ e, aoAbrir }: { e: EventoAgenda; aoAbrir: () => void }) {
  const s = estiloEvento(e);
  return (
    <li>
      <button type="button" onClick={aoAbrir} className="w-full text-left rounded-md px-1.5 py-1 text-xs min-h-8" style={{ backgroundColor: `${s.cor}1a`, color: s.cor }}>
        <span className="block font-semibold truncate">{e.titulo}</span>
        <span className="block opacity-80">{horarioEvento(e)}</span>
      </button>
    </li>
  );
}

function CartaoEvento({ e, mostrarEmpresa, aoEditar, aoExcluir, aoConcluir }: { e: EventoAgenda; mostrarEmpresa: boolean; aoEditar: () => void; aoExcluir: () => void; aoConcluir: () => void }) {
  const s = estiloEvento(e);
  const st = STATUS[e.status] ?? STATUS.pendente;
  const aberto = !['concluido', 'cancelado'].includes(e.status);
  return (
    <li className="rounded-xl border border-gray-100 p-3 flex gap-3 min-w-0" style={{ borderLeft: `4px solid ${s.cor}` }} data-testid={`evento-${e.origem}-${e.titulo}`}>
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-xs text-gray-500">{horarioEvento(e)} · <span style={{ color: s.cor }} className="font-semibold">{s.rotulo}</span></p>
        <p className="font-semibold text-gray-900 break-words">{e.titulo}</p>
        {e.valor !== null && <p className="text-sm font-semibold text-gray-800">{formatarMoeda(e.valor)}</p>}
        {e.local && <p className="text-xs text-gray-600 inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" aria-hidden="true" />{e.local}</p>}
        {e.responsavel_nome && <p className="text-xs text-gray-600 inline-flex items-center gap-1 ml-2"><User className="w-3.5 h-3.5" aria-hidden="true" />{e.responsavel_nome}</p>}
        {mostrarEmpresa && <p className="text-xs text-gray-600 inline-flex items-center gap-1 ml-2"><Building2 className="w-3.5 h-3.5" aria-hidden="true" />{e.empresa_nome ?? 'Pessoal'}</p>}
        {e.origem === 'compromisso' && e.visibilidade === 'privado' && <p className="text-[11px] text-gray-400">{e.id_empresa || !mostrarEmpresa ? 'Privado' : 'Pessoal (só você)'}</p>}
        {e.origem === 'compromisso' && e.visibilidade === 'compartilhado' && <p className="text-[11px] text-green-700 inline-flex items-center gap-1"><Share2 className="w-3 h-3" aria-hidden="true" />Compartilhado com a empresa e o contador</p>}
        <div className="flex flex-wrap items-center gap-1 pt-1">
          <Selo tipo={st.selo} texto={st.rotulo} />
          {e.origem === 'compromisso' && e.editavel && (
            <>
              <button type="button" onClick={aoEditar} className="min-h-9 px-2 inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:bg-orange-50 rounded-lg" aria-label={`Editar ${e.titulo}`}><Pencil className="w-3.5 h-3.5" aria-hidden="true" />Editar</button>
              <button type="button" onClick={aoExcluir} className="min-h-9 px-2 inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg" aria-label={`Excluir ${e.titulo}`}><Trash2 className="w-3.5 h-3.5" aria-hidden="true" />Excluir</button>
            </>
          )}
          {(e.origem === 'tarefa' || e.origem === 'obrigacao') && aberto && (
            <button type="button" onClick={aoConcluir} className="min-h-9 px-2 inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:bg-green-50 rounded-lg"><CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />Concluir</button>
          )}
          {e.origem !== 'compromisso' && (
            <Link href={e.link} className="min-h-9 px-2 inline-flex items-center gap-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-lg"><ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />Abrir {ORIGENS[e.origem as Origem].toLowerCase()}</Link>
          )}
        </div>
      </div>
    </li>
  );
}
