'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Calendar, CheckCircle2, ChevronLeft, ChevronRight, Clock, ListChecks, MessageSquare, Paperclip, PlayCircle, Plus, Tag, User, Flag, CalendarRange, Eye, Pencil } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarData, hojeBrasil, inicioDoMes, rotuloMes, somarMeses } from '@/lib/financeiro';
import {
  ROTULO_PRIORIDADE, SELO_PRIORIDADE, VISOES, iniciais,
  type CategoriaTarefa, type ContextoTarefas, type Membro, type ResumoTarefas, type Tarefa, type VisaoTarefas,
} from '@/lib/tarefas';
import { BarraFiltros, BotaoIcone, BotaoLimparFiltros, CampoBusca, FiltroSelect, Paginacao, Selo } from '@/components/admin/tabela';
import { Aviso } from '@/components/conta/Aviso';
import { IconeCategoria } from '@/components/financeiro/IconeCategoria';
import { CategoriasTarefas, FormTarefa } from './FormulariosTarefa';
import { DetalheTarefa } from './DetalheTarefa';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function Indicador({ titulo, valor, icone: Icone, cor }: { titulo: string; valor: number; icone: typeof Clock; cor: string }) {
  return (
    <section aria-label={titulo} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
      <span className={`w-11 h-11 shrink-0 rounded-full inline-flex items-center justify-center ${cor}`}><Icone className="w-5 h-5" aria-hidden="true" /></span>
      <div>
        <p className="text-sm text-gray-600">{titulo}</p>
        <p className="text-2xl font-bold text-gray-900">{valor}</p>
      </div>
    </section>
  );
}

function Calendario({ mes, hoje, diasComTarefas, diaSelecionado, aoMudarMes, aoEscolherDia }: {
  mes: string; hoje: string; diasComTarefas: string[]; diaSelecionado: string | null; aoMudarMes: (m: string) => void; aoEscolherDia: (d: string | null) => void;
}) {
  const [ano, m] = mes.split('-').map(Number);
  const primeiroDiaSemana = new Date(Date.UTC(ano, m - 1, 1)).getUTCDay();
  const totalDias = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  const celulas: (string | null)[] = [...Array(primeiroDiaSemana).fill(null), ...Array.from({ length: totalDias }, (_, i) => `${mes.slice(0, 8)}${String(i + 1).padStart(2, '0')}`)];
  return (
    <section aria-label="Calendário" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-gray-900">{rotuloMes(mes)}</h2>
        <div className="flex gap-1">
          <button type="button" aria-label="Mês anterior" onClick={() => aoMudarMes(somarMeses(mes, -1))} className="w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-gray-100"><ChevronLeft className="w-4 h-4" aria-hidden="true" /></button>
          <button type="button" aria-label="Próximo mês" onClick={() => aoMudarMes(somarMeses(mes, 1))} className="w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-gray-100"><ChevronRight className="w-4 h-4" aria-hidden="true" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-gray-500 mb-1">{DIAS_SEMANA.map((d) => <span key={d}>{d}</span>)}</div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
        {celulas.map((dia, i) => dia === null ? <span key={`v${i}`} /> : (
          <button
            key={dia}
            type="button"
            onClick={() => aoEscolherDia(diaSelecionado === dia ? null : dia)}
            aria-label={`${formatarData(dia)}${diasComTarefas.includes(dia) ? ', com tarefas' : ''}`}
            aria-pressed={diaSelecionado === dia}
            className={`relative mx-auto w-9 h-9 rounded-full inline-flex items-center justify-center transition ${dia === hoje ? 'bg-orange-600 text-white font-bold' : diaSelecionado === dia ? 'ring-2 ring-orange-500 text-gray-900' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            {Number(dia.slice(8))}
            {diasComTarefas.includes(dia) && <span className={`absolute bottom-1 w-1 h-1 rounded-full ${dia === hoje ? 'bg-white' : 'bg-orange-500'}`} aria-hidden="true" />}
          </button>
        ))}
      </div>
      {diaSelecionado && (
        <button type="button" onClick={() => aoEscolherDia(null)} className="mt-2 min-h-11 text-xs font-semibold text-orange-600">
          Mostrando {formatarData(diaSelecionado)} · limpar
        </button>
      )}
    </section>
  );
}

interface Props {
  contexto: ContextoTarefas;
  idEmpresa: string | null;
}

// Módulo Tarefas — o MESMO componente para empresas, escritórios e administração da plataforma.
export function ModuloTarefas({ contexto, idEmpresa }: Props) {
  const [hoje, setHoje] = useState('');
  const [mesCalendario, setMesCalendario] = useState('');
  const [visao, setVisao] = useState<VisaoTarefas>('todas');
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [categoria, setCategoria] = useState('');
  const [prioridade, setPrioridade] = useState('');
  const [prazo, setPrazo] = useState('');
  const [dia, setDia] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [itens, setItens] = useState<Tarefa[]>([]);
  const [total, setTotal] = useState(0);
  const [doDia, setDoDia] = useState<Tarefa[]>([]);
  const [resumo, setResumo] = useState<ResumoTarefas | null>(null);
  const [categorias, setCategorias] = useState<CategoriaTarefa[]>([]);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [form, setForm] = useState<{ tarefa: Tarefa | null } | null>(null);
  const [detalhe, setDetalhe] = useState<Tarefa | null>(null);
  const [gerenciarCategorias, setGerenciarCategorias] = useState<false | 'lista' | 'nova'>(false);
  const [criandoSugestoes, setCriandoSugestoes] = useState(false);

  // Data atual só no navegador (cacheComponents não aceita new Date() na renderização)
  useEffect(() => {
    const h = hojeBrasil();
    setHoje(h);
    setMesCalendario(inicioDoMes(h));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setBuscaAplicada(busca.trim()); setPagina(1); }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  const base = { p_contexto: contexto, p_id_empresa: idEmpresa };

  const carregarApoio = useCallback(async () => {
    const supabase = createClient();
    let q = supabase.from('categorias_tarefas').select('id, nome, cor, icone, ativa').eq('contexto', contexto).order('nome');
    q = idEmpresa ? q.eq('id_empresa', idEmpresa) : q.is('id_empresa', null);
    const [{ data: cats }, { data: mem }] = await Promise.all([q, supabase.rpc('membros_contexto_tarefas', { p_contexto: contexto, p_id_empresa: idEmpresa })]);
    setCategorias((cats ?? []) as CategoriaTarefa[]);
    setMembros((mem ?? []) as Membro[]);
  }, [contexto, idEmpresa]);

  useEffect(() => {
    carregarApoio();
  }, [carregarApoio]);

  useEffect(() => {
    if (!mesCalendario || !hoje) return;
    let ativo = true;
    const supabase = createClient();
    setCarregando(true);
    Promise.all([
      supabase.rpc('listar_tarefas', {
        ...base, p_visao: visao, p_busca: buscaAplicada || null, p_id_responsavel: responsavel || null, p_id_categoria: categoria || null,
        p_prioridade: prioridade || null, p_prazo: prazo || null, p_dia: dia, p_limite: porPagina, p_deslocamento: (pagina - 1) * porPagina,
      }),
      supabase.rpc('resumo_tarefas', { ...base, p_mes: mesCalendario }),
      supabase.rpc('listar_tarefas', { ...base, p_visao: 'todas', p_dia: hoje, p_limite: 5 }),
    ]).then(([lista, res, hojeLista]) => {
      if (!ativo) return;
      if (lista.error || res.error) {
        setErro(mensagemDeErro(lista.error ?? res.error, 'Não foi possível carregar as tarefas.'));
      } else {
        setErro(null);
        const linhas = (lista.data ?? []) as Tarefa[];
        setItens(linhas);
        setTotal(linhas[0]?.total ?? 0);
        setResumo(res.data as ResumoTarefas);
        setDoDia((hojeLista.data ?? []) as Tarefa[]);
      }
      setCarregando(false);
    });
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `base` deriva de contexto/idEmpresa
  }, [contexto, idEmpresa, visao, buscaAplicada, responsavel, categoria, prioridade, prazo, dia, pagina, porPagina, mesCalendario, hoje, versao]);

  const alterado = (mensagem: string) => {
    setAviso(mensagem);
    setVersao((v) => v + 1);
    carregarApoio();
  };

  // Categorias sugeridas (criadas de uma vez; nomes já existentes são ignorados pelo banco)
  const usarSugestoes = async () => {
    setCriandoSugestoes(true);
    const supabase = createClient();
    for (const [nome, cor, icone] of [['Contabilidade', '#3b82f6', 'calculator'], ['Financeiro', '#16a34a', 'banknote'], ['Administrativo', '#f59e0b', 'building'], ['Fiscal', '#8b5cf6', 'file-text'], ['Reunião', '#ef4444', 'users'], ['Marketing', '#ec4899', 'megaphone']]) {
      await supabase.rpc('salvar_categoria_tarefa', { p_id: null, ...base, p_nome: nome, p_cor: cor, p_icone: icone });
    }
    setCriandoSugestoes(false);
    alterado('Categorias sugeridas criadas.');
  };

  const alternarConclusao = async (t: Tarefa) => {
    const concluir = t.status !== 'concluida';
    const { error } = await createClient().rpc('alterar_status_tarefa', { p_id: t.id, p_status: concluir ? 'concluida' : 'pendente' });
    alterado(error ? mensagemDeErro(error, 'Não foi possível alterar a tarefa.') : concluir ? 'Tarefa concluída.' : 'Tarefa reaberta.');
  };

  const filtrosAtivos = busca || responsavel || categoria || prioridade || prazo || dia;
  if (!hoje) return null;

  return (
    <div className="space-y-5 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900">Tarefas</h1>
          <p className="text-gray-600 mt-1">Organize suas atividades e acompanhe os prazos.</p>
        </div>
        <button type="button" onClick={() => setForm({ tarefa: null })} className="min-h-11 px-5 inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold">
          <Plus className="w-4 h-4" aria-hidden="true" />Nova tarefa
        </button>
      </div>

      {aviso && (
        <div className="flex items-start gap-2">
          <div className="flex-1"><Aviso tipo="sucesso">{aviso}</Aviso></div>
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso" className="min-h-11 px-3 text-sm text-gray-500 hover:text-gray-800">✕</button>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5 min-w-0">
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <Indicador titulo="Pendentes" valor={resumo?.pendentes ?? 0} icone={Clock} cor="bg-orange-100 text-orange-600" />
            <Indicador titulo="Em andamento" valor={resumo?.em_andamento ?? 0} icone={PlayCircle} cor="bg-blue-100 text-blue-600" />
            <Indicador titulo="Concluídas" valor={resumo?.concluidas ?? 0} icone={CheckCircle2} cor="bg-green-100 text-green-600" />
            <Indicador titulo="Atrasadas" valor={resumo?.atrasadas ?? 0} icone={AlertTriangle} cor="bg-red-100 text-red-600" />
          </div>

          <nav aria-label="Visões de tarefas" className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
            <div className="flex gap-2 min-w-max">
              {VISOES.map((v) => (
                <button key={v.id} type="button" onClick={() => { setVisao(v.id); setPagina(1); }} aria-current={visao === v.id ? 'page' : undefined}
                  className={`min-h-11 px-4 rounded-full text-sm font-semibold whitespace-nowrap border ${visao === v.id ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
                  {v.titulo}
                </button>
              ))}
            </div>
          </nav>

          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 sm:p-4 space-y-4">
            <BarraFiltros>
              <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar tarefas" />
              <FiltroSelect icone={User} valor={responsavel} aoMudar={(v) => { setResponsavel(v); setPagina(1); }}>
                <option value="">Todos os responsáveis</option>
                {membros.map((m) => <option key={m.id_usuario} value={m.id_usuario}>{m.nome}</option>)}
              </FiltroSelect>
              <FiltroSelect icone={Tag} valor={categoria} aoMudar={(v) => { setCategoria(v); setPagina(1); }}>
                <option value="">Todas as categorias</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </FiltroSelect>
              <FiltroSelect icone={Flag} valor={prioridade} aoMudar={(v) => { setPrioridade(v); setPagina(1); }}>
                <option value="">Todas as prioridades</option>
                <option value="alta">Alta</option>
                <option value="media">Média</option>
                <option value="baixa">Baixa</option>
              </FiltroSelect>
              <FiltroSelect icone={CalendarRange} valor={prazo} aoMudar={(v) => { setPrazo(v); setPagina(1); }}>
                <option value="">Qualquer prazo</option>
                <option value="atrasadas">Atrasadas</option>
                <option value="hoje">Para hoje</option>
                <option value="semana">Próximos 7 dias</option>
                <option value="sem_prazo">Sem prazo</option>
              </FiltroSelect>
              {filtrosAtivos && <BotaoLimparFiltros aoClicar={() => { setBusca(''); setResponsavel(''); setCategoria(''); setPrioridade(''); setPrazo(''); setDia(null); setPagina(1); }} />}
            </BarraFiltros>

            {erro ? (
              <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{erro}</div>
            ) : carregando ? (
              <div role="status" aria-label="Carregando" className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-xl bg-gray-50 animate-pulse" />)}</div>
            ) : itens.length === 0 ? (
              <div className="text-center py-12">
                <ListChecks className="w-10 h-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
                <p className="font-semibold text-gray-900">{filtrosAtivos ? 'Nenhuma tarefa encontrada com esses filtros.' : 'Nenhuma tarefa por aqui.'}</p>
                {!filtrosAtivos && visao === 'todas' && <p className="text-sm text-gray-600 mt-1">Crie a primeira tarefa em “Nova tarefa”.</p>}
              </div>
            ) : (
              <ul className="divide-y divide-gray-100" aria-label="Lista de tarefas">
                {itens.map((t) => (
                  <li key={t.id} data-testid={`tarefa-${t.titulo}`} className="py-3 flex items-start gap-3">
                    <button type="button" role="checkbox" aria-checked={t.status === 'concluida'} disabled={t.arquivada || t.status === 'cancelada'}
                      aria-label={`${t.status === 'concluida' ? 'Reabrir' : 'Concluir'} ${t.titulo}`} onClick={() => alternarConclusao(t)}
                      className={`mt-1 w-11 h-11 -m-2.5 shrink-0 inline-flex items-center justify-center disabled:opacity-40`}>
                      <span className={`w-5 h-5 rounded border-2 inline-flex items-center justify-center ${t.status === 'concluida' ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300'}`}>
                        {t.status === 'concluida' && <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />}
                      </span>
                    </button>
                    {t.categoria_nome
                      ? <IconeCategoria icone={t.categoria_icone} cor={t.categoria_cor ?? '#9ca3af'} tamanho="lg" className="hidden sm:inline-flex" />
                      : <span className="hidden sm:inline-flex w-12 h-12 rounded-full bg-gray-100 text-gray-400 items-center justify-center"><ListChecks className="w-6 h-6" aria-hidden="true" /></span>}
                    <div className="flex-1 min-w-0">
                      <button type="button" onClick={() => setDetalhe(t)} className={`text-left font-semibold break-words hover:text-orange-600 ${t.status === 'concluida' || t.status === 'cancelada' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {t.titulo}
                      </button>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Selo tipo={SELO_PRIORIDADE[t.prioridade]} texto={ROTULO_PRIORIDADE[t.prioridade]} />
                        {t.categoria_nome && <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: `${t.categoria_cor}22`, color: '#374151' }}>{t.categoria_nome}</span>}
                        {t.status === 'em_andamento' && <Selo tipo="info" texto="Em andamento" />}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        {t.prazo && <span className={`inline-flex items-center gap-1 ${t.atrasada ? 'text-red-700 font-semibold' : ''}`}><Calendar className="w-3.5 h-3.5" aria-hidden="true" />{formatarData(t.prazo)}{t.hora ? ` · ${t.hora.slice(0, 5)}` : ''}{t.atrasada ? ' · atrasada' : ''}</span>}
                        <span className="inline-flex items-center gap-1" title="Comentários"><MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />{t.qtd_comentarios}</span>
                        <span className="inline-flex items-center gap-1" title="Anexos"><Paperclip className="w-3.5 h-3.5" aria-hidden="true" />{t.qtd_anexos}</span>
                        {t.checklist_total > 0 && <span className="inline-flex items-center gap-1" title="Checklist"><ListChecks className="w-3.5 h-3.5" aria-hidden="true" />{t.checklist_feitos}/{t.checklist_total}</span>}
                        {t.responsavel_nome && <span className="sm:hidden">· {t.responsavel_nome}</span>}
                      </div>
                    </div>
                    {t.responsavel_nome && (
                      <div className="hidden sm:flex items-center gap-2 w-40 shrink-0">
                        <span className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 text-xs font-bold inline-flex items-center justify-center" aria-hidden="true">{iniciais(t.responsavel_nome)}</span>
                        <div className="min-w-0"><p className="text-[11px] text-gray-500">Responsável</p><p className="text-sm text-gray-900 truncate">{t.responsavel_nome}</p></div>
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row gap-1">
                      <BotaoIcone icone={Eye} titulo={`Detalhes de ${t.titulo}`} aoClicar={() => setDetalhe(t)} />
                      {!t.arquivada && <BotaoIcone icone={Pencil} titulo={`Editar ${t.titulo}`} aoClicar={() => setForm({ tarefa: t })} />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {!erro && !carregando && total > 0 && <Paginacao pagina={pagina} aoMudarPagina={setPagina} porPagina={porPagina} aoMudarPorPagina={setPorPagina} total={total} />}
          </section>
        </div>

        <aside className="space-y-5 min-w-0" aria-label="Resumo das tarefas">
          <Calendario mes={mesCalendario} hoje={hoje} diasComTarefas={resumo?.dias_com_tarefas ?? []} diaSelecionado={dia}
            aoMudarMes={setMesCalendario} aoEscolherDia={(d) => { setDia(d); setPagina(1); }} />

          <section aria-label="Tarefas do dia" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-gray-900">Tarefas do dia</h2>
              <button type="button" onClick={() => { setDia(hoje); setPagina(1); }} className="min-h-11 text-sm font-semibold text-orange-600">Ver todas</button>
            </div>
            {doDia.length === 0 ? <p className="text-sm text-gray-500 py-3">Nada para hoje.</p> : (
              <ul className="divide-y divide-gray-100">
                {doDia.map((t) => (
                  <li key={t.id} className="py-2 flex items-start gap-2">
                    <button type="button" onClick={() => setDetalhe(t)} className="flex-1 min-w-0 text-left min-h-11">
                      <p className="text-sm text-gray-900 break-words">{t.titulo}</p>
                      <Selo tipo={SELO_PRIORIDADE[t.prioridade]} texto={ROTULO_PRIORIDADE[t.prioridade]} />
                    </button>
                    {t.hora && <span className="text-xs text-gray-500">{t.hora.slice(0, 5)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Categorias" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-gray-900">Categorias</h2>
              <button type="button" onClick={() => setGerenciarCategorias('lista')} className="min-h-11 text-sm font-semibold text-orange-600">Gerenciar</button>
            </div>
            {(resumo?.categorias ?? []).length === 0 ? (
              <div className="py-2 space-y-2">
                <p className="text-sm text-gray-500">Nenhuma categoria criada.</p>
                <button type="button" onClick={() => setGerenciarCategorias('nova')} className="w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold">
                  <Plus className="w-4 h-4" aria-hidden="true" />Criar categoria
                </button>
                <button type="button" onClick={usarSugestoes} disabled={criandoSugestoes} className="w-full min-h-11 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  {criandoSugestoes ? 'Criando...' : 'Usar sugestões'}
                </button>
                <p className="text-xs text-gray-500">Sugestões: Contabilidade, Financeiro, Administrativo, Fiscal, Reunião e Marketing.</p>
              </div>
            ) : (
              <ul className="space-y-1">
                {resumo!.categorias.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => { setCategoria(categoria === c.id ? '' : c.id); setPagina(1); }} aria-pressed={categoria === c.id}
                      className={`w-full min-h-11 flex items-center gap-2 rounded-lg px-1 text-left text-sm ${categoria === c.id ? 'bg-orange-50' : 'hover:bg-gray-50'}`}>
                      <IconeCategoria icone={c.icone} cor={c.cor} tamanho="sm" />
                      <span className="flex-1 min-w-0 truncate text-gray-800">{c.nome}</span>
                      <span className="text-gray-500">{c.qtd}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <FormTarefa aberto={!!form} aoFechar={() => setForm(null)} contexto={contexto} idEmpresa={idEmpresa} tarefa={form?.tarefa ?? null}
        categorias={categorias} membros={membros} aoSalvar={(m) => { setForm(null); alterado(m); }} aoCriarCategoria={carregarApoio} />
      <DetalheTarefa tarefa={detalhe} idEmpresa={idEmpresa} aoFechar={() => setDetalhe(null)} aoEditar={(t) => setForm({ tarefa: t })} aoAlterar={alterado} />
      <CategoriasTarefas aberto={!!gerenciarCategorias} iniciarNova={gerenciarCategorias === 'nova'} aoFechar={() => setGerenciarCategorias(false)} contexto={contexto} idEmpresa={idEmpresa}
        categorias={categorias} aoAlterar={alterado} />
    </div>
  );
}
