'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, FileText, MoreVertical, Pencil, Plus, RefreshCw, Search, Upload, Users, Wallet,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { recursoAusente } from '@/lib/erros-banco';
import { formatarData, formatarMoeda, hojeBrasil, inicioDoMes, somarMeses } from '@/lib/financeiro';
import {
  ETAPAS, ROTULO_CATEGORIA_DOC, ROTULO_ESTADO_ETAPA, SITUACAO_FUNCIONARIO, STATUS_COMPETENCIA, TIPOS_OCORRENCIA, abrirArquivoFolha, competenciaCurta, dataHora,
  etapasDoFluxo, matricula, pagamentoConcluido, resumoOcorrencia,
  type DocumentoFolha, type EstadoEtapa, type EventoFolha, type FuncionarioFolha, type Ocorrencia, type PainelFolha, type SituacaoFuncionario, type TipoOcorrencia, type ValorFolha,
} from '@/lib/folha-pagamento';
import { Avatar, Paginacao, Selo } from '@/components/admin/tabela';
import { Modal, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { CabecalhoModulo } from '@/components/navegacao/NavegacaoModulos';
import { PainelFuncionario } from '@/components/folha/PainelFuncionario';
import { DecisaoEmpresa, EnvioFolha, PagamentoFolha, ProcessamentoContador } from '@/components/folha/AcoesFolha';

type Aba = 'visao' | 'funcionarios' | 'ocorrencias' | 'documentos' | 'historico';
type Filtro = 'todos' | SituacaoFuncionario;
type Dados = { painel: PainelFolha; ocorrencias: Ocorrencia[]; documentos: DocumentoFolha[]; eventos: EventoFolha[]; valores: ValorFolha[];
  versoes: { id: string; versao: number; situacao: string; responsavel: string; enviado_em: string }[] };
type Estado = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string } | ({ tipo: 'ok' } & Dados);
const ABAS: [Aba, string][] = [['visao', 'Visão geral'], ['funcionarios', 'Funcionários'], ['ocorrencias', 'Ocorrências'], ['documentos', 'Documentos'], ['historico', 'Histórico']];
const EDITAVEIS = new Set([null, 'preparacao', 'correcao_solicitada']);

export function ModuloFolha({ idEmpresa, papel, nomeUsuario = '' }: { idEmpresa: string; papel: 'empresa' | 'contador'; nomeUsuario?: string }) {
  const [hoje, setHoje] = useState('');
  const [competencia, setCompetencia] = useState('');
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [aba, setAba] = useState<Aba>('visao');
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState<{ id: string; formulario: boolean } | null>(null);
  const [escolhendo, setEscolhendo] = useState(false);
  const [escolhido, setEscolhido] = useState('');
  const [menu, setMenu] = useState<string | null>(null);
  const [menuGeral, setMenuGeral] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [tipoFiltro, setTipoFiltro] = useState('');

  // Competência inicial: mês atual (empresa) ou a última recebida (contador)
  useEffect(() => {
    const h = hojeBrasil(); setHoje(h);
    if (papel === 'empresa') { setCompetencia(inicioDoMes(h)); return; }
    createClient().rpc('competencias_folha_empresa', { p_id_empresa: idEmpresa }).then(({ data }) => {
      const recebida = ((data ?? []) as { competencia: string; status: string }[]).find((c) => c.status !== 'preparacao');
      setCompetencia(recebida?.competencia ?? inicioDoMes(h));
    });
  }, [idEmpresa, papel]);

  const carregar = useCallback(async (silencioso = false) => {
    if (!competencia) return;
    if (!silencioso) setEstado({ tipo: 'carregando' });
    const supabase = createClient();
    const { data, error } = await supabase.rpc('painel_folha_pagamento', { p_id_empresa: idEmpresa, p_competencia: competencia });
    if (error) return setEstado({ tipo: 'erro', mensagem: recursoAusente(error) ? mensagemDeErro(error, '') : mensagemDeErro(error, 'Não foi possível carregar a folha.') });
    const painel = data as PainelFolha;
    const vazio = { ocorrencias: [], documentos: [], eventos: [], valores: [], versoes: [] };
    if (!painel.competencia) return setEstado({ tipo: 'ok', painel, ...vazio });
    const id = painel.competencia.id;
    const [oc, docs, ev, ver, val] = await Promise.all([
      supabase.from('ocorrencias_folha').select('id, id_funcionario, tipo, quantidade, valor, data_inicio, data_fim, situacao_justificativa, justificativa, observacoes, criado_em').eq('id_competencia', id).order('criado_em'),
      supabase.from('documentos_folha').select('id, categoria, id_funcionario, id_ocorrencia, id_devolucao, id_valor, caminho, nome_arquivo, tipo_mime, tamanho, enviado_em').eq('id_competencia', id).order('enviado_em'),
      supabase.from('eventos_folha').select('id, id_funcionario, tipo, descricao, versao, criado_em, id_usuario').eq('id_competencia', id).order('criado_em', { ascending: false }).limit(500),
      supabase.from('pacotes_folha').select('id, versao, situacao, responsavel, enviado_em').eq('id_competencia', id).order('versao', { ascending: false }),
      painel.devolucao ? supabase.from('valores_folha').select('id, id_devolucao, tipo, id_funcionario, descricao, valor, vencimento').eq('id_devolucao', painel.devolucao.id) : Promise.resolve({ data: [], error: null }),
    ]);
    const falha = oc.error || docs.error || ev.error || ver.error || val.error;
    if (falha) return setEstado({ tipo: 'erro', mensagem: mensagemDeErro(falha, 'Não foi possível carregar a folha.') });
    setEstado({ tipo: 'ok', painel, ocorrencias: (oc.data ?? []) as Ocorrencia[], documentos: (docs.data ?? []) as DocumentoFolha[], eventos: (ev.data ?? []) as EventoFolha[],
      versoes: ver.data ?? [], valores: (val.data ?? []) as ValorFolha[] });
  }, [idEmpresa, competencia]);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { setSelecionados(new Set()); setPagina(1); setAberto(null); }, [competencia]);

  const aoAlterar = useCallback(async (mensagem: string) => { setAviso(mensagem); setErroAcao(null); await carregar(true); }, [carregar]);

  useEffect(() => {
    if (!menu && !menuGeral) return;
    const fora = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-menu]')) { setMenu(null); setMenuGeral(false); } };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setMenu(null); setMenuGeral(false); } };
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [menu, menuGeral]);

  const dados = estado.tipo === 'ok' ? estado : null;
  const painel = dados?.painel ?? null;
  const status = painel?.competencia?.status ?? null;
  const editavel = !!painel?.pode_preparar && EDITAVEIS.has(status);
  const lista = useMemo(() => painel?.funcionarios ?? [], [painel]);
  const ocPorFunc = useMemo(() => {
    const m = new Map<string, Ocorrencia[]>();
    for (const o of dados?.ocorrencias ?? []) m.set(o.id_funcionario, [...(m.get(o.id_funcionario) ?? []), o]);
    return m;
  }, [dados]);
  const contagem = { todos: lista.length, apto: lista.filter((f) => f.situacao === 'apto').length, a_conferir: lista.filter((f) => f.situacao === 'a_conferir').length, pendente: lista.filter((f) => f.situacao === 'pendente').length };
  const progresso = lista.length ? Math.round((contagem.apto / lista.length) * 100) : 0;
  const termo = busca.trim().toLowerCase();
  const filtrados = lista.filter((f) => (filtro === 'todos' || f.situacao === filtro)
    && (!termo || f.nome.toLowerCase().includes(termo) || (f.cargo ?? '').toLowerCase().includes(termo) || matricula(f.matricula).includes(termo)));
  const paginaAtual = Math.min(pagina, Math.max(1, Math.ceil(filtrados.length / porPagina)));
  const visiveis = filtrados.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina);
  const maxCompetencia = hoje ? somarMeses(inicioDoMes(hoje), 1) : '';

  const confirmar = async (f: FuncionarioFolha) => {
    setOcupado(true); setErroAcao(null);
    const sem = (ocPorFunc.get(f.id) ?? []).length === 0;
    const { error } = await createClient().rpc('confirmar_conferencia_folha', { p_id_empresa: idEmpresa, p_competencia: competencia, p_id_funcionario: f.id, p_sem_ocorrencias: sem });
    setOcupado(false); setMenu(null);
    if (error) return setErroAcao(mensagemDeErro(error, 'Não foi possível confirmar.'));
    await aoAlterar(sem ? `${f.nome}: confirmado sem ocorrências.` : `${f.nome}: conferência confirmada.`);
  };
  const desfazer = async (f: FuncionarioFolha) => {
    setOcupado(true); setErroAcao(null);
    const { error } = await createClient().rpc('desfazer_conferencia_folha', { p_id_empresa: idEmpresa, p_competencia: competencia, p_id_funcionario: f.id });
    setOcupado(false); setMenu(null);
    if (error) return setErroAcao(mensagemDeErro(error, 'Não foi possível desfazer.'));
    await aoAlterar(`${f.nome}: conferência desfeita.`);
  };
  // Confirmação em lote: só quem não tem ocorrências nem pendências (cada um registrado individualmente no banco)
  const confirmarSelecionados = async () => {
    setMenuGeral(false);
    const alvo = lista.filter((f) => selecionados.has(f.id) && f.situacao === 'a_conferir' && (ocPorFunc.get(f.id) ?? []).length === 0);
    const ignorados = selecionados.size - alvo.length;
    if (alvo.length === 0) return setErroAcao('Nenhum selecionado pode ser confirmado sem ocorrências (só quem está “A conferir” e não tem ocorrências).');
    setOcupado(true); setErroAcao(null);
    let ok = 0; let erro: string | null = null;
    for (const f of alvo) {
      const { error } = await createClient().rpc('confirmar_conferencia_folha', { p_id_empresa: idEmpresa, p_competencia: competencia, p_id_funcionario: f.id, p_sem_ocorrencias: true });
      if (error) erro = mensagemDeErro(error, 'Falha ao confirmar.'); else ok++;
    }
    setOcupado(false); setSelecionados(new Set());
    if (erro) setErroAcao(erro);
    await aoAlterar(`${ok} confirmado(s) sem ocorrências.${ignorados ? ` ${ignorados} ignorado(s) por terem ocorrências, pendências ou já estarem aptos.` : ''}`);
  };

  const seletor = (
    <div className="flex flex-wrap items-center gap-2" data-testid="seletor-competencia">
      <div className="inline-flex items-center rounded-xl border border-gray-200 bg-white">
        <button type="button" aria-label="Competência anterior" className="w-11 h-11 inline-flex items-center justify-center text-gray-600 hover:bg-gray-50 rounded-l-xl" onClick={() => setCompetencia(somarMeses(competencia, -1))} disabled={!competencia}>
          <ChevronLeft className="w-5 h-5" aria-hidden="true" /></button>
        <span className="px-2 min-w-[150px] text-center text-sm font-semibold text-gray-900" aria-live="polite">Competência: {competencia ? competenciaCurta(competencia) : '—'}</span>
        <button type="button" aria-label="Próxima competência" className="w-11 h-11 inline-flex items-center justify-center text-gray-600 hover:bg-gray-50 rounded-r-xl disabled:text-gray-300" onClick={() => setCompetencia(somarMeses(competencia, 1))} disabled={!competencia || competencia >= maxCompetencia}>
          <ChevronRight className="w-5 h-5" aria-hidden="true" /></button>
      </div>
      {estado.tipo === 'ok' && (
        <span className={`inline-flex items-center min-h-9 px-3 rounded-full text-sm font-semibold ${STATUS_COMPETENCIA[status ?? 'nao_iniciada'].cor}`} data-testid="status-competencia">
          {status === 'aprovada' && pagamentoConcluido(painel!.pagamento) ? 'Paga' : STATUS_COMPETENCIA[status ?? 'nao_iniciada'].rotulo}
          {painel?.competencia?.versao_atual ? ` · v${painel.competencia.versao_atual}` : ''}
        </span>
      )}
    </div>
  );

  const funcAberto = aberto ? lista.find((f) => f.id === aberto.id) : null;

  return (
    <div className="space-y-5 min-w-0">
      {papel === 'empresa' ? (
        <CabecalhoModulo icone={Wallet} titulo="Folha de Pagamento" descricao="Gerencie as informações da folha e envie ao contador de forma simples e organizada." acoes={seletor} />
      ) : (
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div><h2 className="text-xl font-bold text-gray-900">Folha de Pagamento</h2><p className="text-sm text-gray-600">Receba, confira e devolva a folha processada.</p></div>
          {seletor}
        </div>
      )}

      <div role="tablist" aria-label="Seções da folha" className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto border-b border-gray-200">
        <div className="flex gap-1 min-w-max">
          {ABAS.map(([id, r]) => (
            <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
              className={`min-h-11 px-4 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${aba === id ? 'border-orange-600 text-orange-700' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>{r}</button>
          ))}
        </div>
      </div>

      {aviso && <p role="status" className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex justify-between gap-2">{aviso}<button type="button" className="font-semibold" onClick={() => setAviso(null)} aria-label="Fechar aviso">×</button></p>}
      {erroAcao && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erroAcao}</p>}

      {estado.tipo === 'carregando' && <div role="status" aria-label="Carregando folha" className="h-64 rounded-2xl bg-white border border-gray-200 animate-pulse" />}
      {estado.tipo === 'erro' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-3" role="alert">
          <p className="text-gray-800">{estado.mensagem}</p>
          <button type="button" className={classeBotaoSecundario} onClick={() => carregar()}><RefreshCw className="w-4 h-4" aria-hidden="true" />Tentar novamente</button>
        </div>
      )}

      {dados && painel && (
        <>
          {(aba === 'visao' || aba === 'funcionarios') && (
            <>
              {aba === 'visao' && (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" data-testid="indicadores">
                  <Cartao icone={Users} cor="bg-blue-100 text-blue-700" rotulo="Funcionários" valor={contagem.todos} />
                  <Cartao icone={CheckCircle2} cor="bg-green-100 text-green-700" rotulo="Aptos" valor={contagem.apto} />
                  <Cartao icone={Clock} cor="bg-amber-100 text-amber-700" rotulo="A conferir" valor={contagem.a_conferir} />
                  <Cartao icone={AlertTriangle} cor="bg-red-100 text-red-700" rotulo="Pendentes" valor={contagem.pendente} />
                  <div className="col-span-2 lg:col-span-1 bg-white rounded-2xl border border-gray-200 p-4" data-testid="progresso">
                    <p className="text-sm text-gray-600">Progresso da conferência</p>
                    <p className="text-2xl font-black text-gray-900">{progresso}%</p>
                    <div className="h-2 rounded-full bg-gray-100 mt-2 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso} aria-label="Progresso da conferência">
                      <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progresso}%` }} />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{contagem.apto} de {contagem.todos} aptos</p>
                  </div>
                </div>
              )}

              <section className="bg-white rounded-2xl border border-gray-200" aria-label="Funcionários da competência">
                <div className="p-4 flex flex-col xl:flex-row xl:items-center gap-3 border-b border-gray-100">
                  <div className="relative flex-1 min-w-0">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                    <label htmlFor="busca-folha" className="sr-only">Buscar funcionário</label>
                    <input id="busca-folha" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} placeholder="Buscar por nome, cargo ou matrícula"
                      className="w-full h-11 pl-9 pr-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Filtrar por situação">
                    {([['todos', 'Todos'], ['apto', 'Aptos'], ['a_conferir', 'A conferir'], ['pendente', 'Pendentes']] as [Filtro, string][]).map(([id, r]) => (
                      <button key={id} type="button" aria-pressed={filtro === id} onClick={() => { setFiltro(id); setPagina(1); }}
                        className={`min-h-10 px-3 rounded-full text-sm font-semibold whitespace-nowrap border ${filtro === id ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>{r} ({contagem[id]})</button>
                    ))}
                  </div>
                  {papel === 'empresa' && (
                    <div className="flex gap-2 flex-wrap">
                      <button type="button" disabled aria-describedby="ponto-indisponivel" className={`${classeBotaoSecundario} relative`} title="Importação de ponto ainda não disponível">
                        <Upload className="w-4 h-4" aria-hidden="true" />Importar ponto<span className="ml-1 text-[10px] uppercase font-bold bg-gray-200 text-gray-700 rounded px-1">Em breve</span>
                      </button>
                      <span id="ponto-indisponivel" className="sr-only">Importação de ponto indisponível: nenhum formato de arquivo de ponto é suportado ainda.</span>
                      <button type="button" className={classeBotaoPrimario} disabled={!editavel || lista.length === 0} onClick={() => { setEscolhido(''); setEscolhendo(true); }}>
                        <Plus className="w-4 h-4" aria-hidden="true" />Registrar ocorrência</button>
                      <div className="relative" data-menu>
                        <button type="button" aria-label="Mais opções" aria-haspopup="menu" aria-expanded={menuGeral} className="w-11 h-11 inline-flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50" onClick={() => setMenuGeral((v) => !v)}>
                          <MoreVertical className="w-5 h-5" aria-hidden="true" /></button>
                        {menuGeral && (
                          <div role="menu" className="absolute right-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1">
                            <button type="button" role="menuitem" className="w-full text-left px-4 min-h-11 text-sm hover:bg-gray-50 disabled:text-gray-400" disabled={!editavel || selecionados.size === 0 || ocupado} onClick={confirmarSelecionados}>
                              Confirmar selecionados sem ocorrências ({selecionados.size})</button>
                            <button type="button" role="menuitem" className="w-full text-left px-4 min-h-11 text-sm hover:bg-gray-50" onClick={() => { setMenuGeral(false); void carregar(); }}>Atualizar dados</button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {lista.length === 0 ? (
                  <p className="p-8 text-center text-sm text-gray-600">Nenhum funcionário ativo nesta competência. Cadastre em Funcionários.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-left text-gray-600">
                        <tr>
                          <th scope="col" className="w-12 px-4 py-3">
                            <input type="checkbox" aria-label="Selecionar todos desta página" className="w-4 h-4 accent-orange-600"
                              checked={visiveis.length > 0 && visiveis.every((f) => selecionados.has(f.id))}
                              onChange={(e) => { const s = new Set(selecionados); visiveis.forEach((f) => (e.target.checked ? s.add(f.id) : s.delete(f.id))); setSelecionados(s); }} />
                          </th>
                          <th scope="col" className="px-3 py-3 font-semibold">Funcionário</th>
                          <th scope="col" className="px-3 py-3 font-semibold">Cargo</th>
                          <th scope="col" className="px-3 py-3 font-semibold">Salário base</th>
                          <th scope="col" className="px-3 py-3 font-semibold">Ocorrências do mês</th>
                          {aba === 'funcionarios' && <th scope="col" className="px-3 py-3 font-semibold">Conferência</th>}
                          <th scope="col" className="px-3 py-3 font-semibold">Situação</th>
                          <th scope="col" className="px-3 py-3 font-semibold text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {visiveis.map((f, i) => {
                          const ocs = ocPorFunc.get(f.id) ?? [];
                          const s = SITUACAO_FUNCIONARIO[f.situacao];
                          return (
                            <tr key={f.id} className="hover:bg-gray-50" data-testid="linha-funcionario">
                              <td className="px-4 py-3"><input type="checkbox" aria-label={`Selecionar ${f.nome}`} className="w-4 h-4 accent-orange-600" checked={selecionados.has(f.id)}
                                onChange={(e) => { const n = new Set(selecionados); if (e.target.checked) n.add(f.id); else n.delete(f.id); setSelecionados(n); }} /></td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-3 min-w-[200px]">
                                  <Avatar nome={f.nome} indice={i} />
                                  <div className="min-w-0"><p className="font-semibold text-gray-900 truncate">{f.nome}</p><p className="text-xs text-gray-500">Matrícula {matricula(f.matricula)}</p></div>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{f.cargo || '—'}</td>
                              <td className="px-3 py-3 text-gray-900 whitespace-nowrap">{formatarMoeda(f.salario_base)}</td>
                              <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{ocs.length === 0 ? 'Nenhuma' : ocs.length === 1 ? `${resumoOcorrencia(ocs[0], formatarMoeda)} · ${TIPOS_OCORRENCIA[ocs[0].tipo].rotulo.toLowerCase()}` : `${ocs.length} ocorrências`}</td>
                              {aba === 'funcionarios' && <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">{f.conferencia ? `${f.conferencia.confirmado_por ?? '—'} · ${dataHora(f.conferencia.confirmado_em)}` : '—'}</td>}
                              <td className="px-3 py-3"><Selo tipo={s.selo} texto={s.rotulo} /></td>
                              <td className="px-3 py-3">
                                <div className="flex items-center justify-end gap-1">
                                  <button type="button" className="min-h-10 px-3 inline-flex items-center gap-1 rounded-lg border border-gray-200 text-sm font-semibold text-gray-800 hover:bg-white"
                                    onClick={() => setAberto({ id: f.id, formulario: false })} aria-label={`${editavel ? 'Editar' : 'Ver'} ${f.nome}`}>
                                    <Pencil className="w-4 h-4" aria-hidden="true" />{editavel ? 'Editar' : 'Ver'}</button>
                                  {editavel && (
                                    <div className="relative" data-menu>
                                      <button type="button" aria-label={`Mais ações para ${f.nome}`} aria-haspopup="menu" aria-expanded={menu === f.id}
                                        className="w-10 h-10 inline-flex items-center justify-center rounded-lg hover:bg-gray-100" onClick={() => setMenu(menu === f.id ? null : f.id)}>
                                        <MoreVertical className="w-4 h-4" aria-hidden="true" /></button>
                                      {menu === f.id && (
                                        <div role="menu" className="absolute right-0 mt-1 w-60 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 text-left">
                                          <button type="button" role="menuitem" className="w-full text-left px-4 min-h-11 text-sm hover:bg-gray-50" onClick={() => { setMenu(null); setAberto({ id: f.id, formulario: true }); }}>Registrar ocorrência</button>
                                          {f.situacao === 'apto' ? (
                                            <button type="button" role="menuitem" className="w-full text-left px-4 min-h-11 text-sm hover:bg-gray-50" disabled={ocupado} onClick={() => desfazer(f)}>Desfazer conferência</button>
                                          ) : (
                                            <button type="button" role="menuitem" className="w-full text-left px-4 min-h-11 text-sm hover:bg-gray-50 disabled:text-gray-400" disabled={ocupado || f.situacao === 'pendente'} onClick={() => confirmar(f)}>
                                              {ocs.length === 0 ? 'Confirmar sem ocorrências' : 'Confirmar conferência'}</button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {visiveis.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-gray-600">Nenhum funcionário encontrado com esses filtros.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}
                {filtrados.length > 0 && <div className="px-4 pb-4"><Paginacao pagina={paginaAtual} aoMudarPagina={setPagina} porPagina={porPagina} aoMudarPorPagina={setPorPagina} total={filtrados.length} /></div>}
              </section>

              {aba === 'visao' && (
                <>
                  {papel === 'empresa' && painel.pode_preparar && EDITAVEIS.has(status) && (
                    <EnvioFolha painel={painel} ocorrencias={dados.ocorrencias} idEmpresa={idEmpresa} competencia={competencia} nomeUsuario={nomeUsuario} aoAlterar={aoAlterar} />
                  )}
                  {papel === 'empresa' && status === 'correcao_solicitada' && (
                    <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl p-3">O contador solicitou correção. Veja as pendências nos funcionários marcados como Pendentes e no Histórico.</p>
                  )}
                  {papel === 'empresa' && (status === 'enviada' || status === 'em_processamento' || status === 'revisao_solicitada') && painel.pacote && (
                    <section className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 text-sm text-gray-700">
                      <h2 className="text-base font-bold text-gray-900">Com o contador</h2>
                      <p>Versão {painel.pacote.versao} enviada por {painel.pacote.responsavel} em {dataHora(painel.pacote.enviado_em)}. {status === 'em_processamento' ? 'O contador está processando.' : 'Aguardando o contador.'}</p>
                    </section>
                  )}
                  {papel === 'empresa' && status === 'devolvida' && painel.devolucao && painel.pode_preparar && (
                    <DecisaoEmpresa painel={painel} documentos={dados.documentos.filter((d) => d.id_devolucao === painel.devolucao!.id)} valores={dados.valores} aoAlterar={aoAlterar} />
                  )}
                  {papel === 'empresa' && status === 'aprovada' && painel.pagamento && painel.pode_preparar && (
                    <PagamentoFolha painel={painel} documentos={dados.documentos.filter((d) => d.id_devolucao === painel.devolucao?.id)} valores={dados.valores} idEmpresa={idEmpresa} hoje={hoje} aoAlterar={aoAlterar} />
                  )}
                  {papel === 'contador' && painel.competencia && status !== 'preparacao' && status !== 'correcao_solicitada' && (
                    <ProcessamentoContador painel={painel} documentos={dados.documentos} valores={dados.valores} idEmpresa={idEmpresa} aoAlterar={aoAlterar} />
                  )}
                  {papel === 'contador' && (!painel.competencia || status === 'preparacao' || status === 'correcao_solicitada') && (
                    <p className="text-sm text-gray-700 bg-white border border-gray-200 rounded-2xl p-4">
                      {status === 'correcao_solicitada' ? 'Correção solicitada: aguardando a empresa reenviar.' : 'A empresa ainda não enviou a folha desta competência.'}</p>
                  )}
                  <Fluxo estados={etapasDoFluxo(status, pagamentoConcluido(painel.pagamento))} />
                </>
              )}
            </>
          )}

          {aba === 'ocorrencias' && (
            <section className="bg-white rounded-2xl border border-gray-200" aria-label="Ocorrências da competência">
              <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 border-b border-gray-100">
                <label htmlFor="filtro-tipo" className="text-sm font-semibold text-gray-800">Tipo</label>
                <select id="filtro-tipo" value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)} className="h-11 px-3 rounded-lg border border-gray-200 text-sm">
                  <option value="">Todos</option>
                  {(Object.keys(TIPOS_OCORRENCIA) as TipoOcorrencia[]).map((k) => <option key={k} value={k}>{TIPOS_OCORRENCIA[k].rotulo}</option>)}
                </select>
              </div>
              <ListaOcorrencias ocorrencias={dados.ocorrencias.filter((o) => !tipoFiltro || o.tipo === tipoFiltro)} painel={painel} documentos={dados.documentos}
                aoAbrir={(id) => setAberto({ id, formulario: false })} />
            </section>
          )}

          {aba === 'documentos' && <ListaDocumentos documentos={dados.documentos} painel={painel} ocorrencias={dados.ocorrencias} aoErro={setErroAcao} />}

          {aba === 'historico' && (
            <div className="grid lg:grid-cols-3 gap-4">
              <section className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5" aria-labelledby="titulo-versoes">
                <h2 id="titulo-versoes" className="text-base font-bold text-gray-900 mb-2">Versões enviadas</h2>
                {dados.versoes.length === 0 ? <p className="text-sm text-gray-600">Nenhum envio nesta competência.</p> : (
                  <ul className="space-y-2 text-sm">
                    {dados.versoes.map((v) => (
                      <li key={v.id} className="flex items-center justify-between gap-2 border border-gray-100 rounded-xl px-3 py-2">
                        <div><p className="font-semibold text-gray-900">Versão {v.versao}</p><p className="text-xs text-gray-500">{v.responsavel} · {dataHora(v.enviado_em)}</p></div>
                        <Selo tipo={v.situacao === 'vigente' ? 'sucesso' : 'neutro'} texto={v.situacao === 'vigente' ? 'Vigente' : 'Substituída'} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-4 sm:p-5" aria-labelledby="titulo-eventos">
                <h2 id="titulo-eventos" className="text-base font-bold text-gray-900 mb-2">Histórico da competência</h2>
                {dados.eventos.length === 0 ? <p className="text-sm text-gray-600">Sem registros ainda.</p> : (
                  <ol className="space-y-3" data-testid="historico-folha">
                    {dados.eventos.map((e) => {
                      const nome = e.id_funcionario ? lista.find((f) => f.id === e.id_funcionario)?.nome : null;
                      return (
                        <li key={e.id} className="text-sm border-l-2 border-orange-200 pl-3">
                          <p className="text-gray-900 break-words">{nome ? <span className="font-semibold">{nome}: </span> : null}{e.descricao}</p>
                          <p className="text-xs text-gray-500">{dataHora(e.criado_em)}{e.versao ? ` · versão ${e.versao}` : ''}</p>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </div>
          )}

          {funcAberto && (
            <PainelFuncionario key={`${funcAberto.id}-${aberto!.formulario}`} funcionario={funcAberto} ocorrencias={ocPorFunc.get(funcAberto.id) ?? []}
              documentos={dados.documentos.filter((d) => d.id_funcionario === funcAberto.id && d.categoria === 'anexo_ocorrencia')}
              pendencias={painel.pendencias.filter((p) => p.id_funcionario === funcAberto.id)}
              eventos={dados.eventos.filter((e) => e.id_funcionario === funcAberto.id)} editavel={editavel} mostrarSalario idEmpresa={idEmpresa} competencia={competencia}
              abrirFormulario={aberto!.formulario} aoFechar={() => setAberto(null)} aoAlterar={aoAlterar} />
          )}

          <Modal aberto={escolhendo} aoFechar={() => setEscolhendo(false)} titulo="Registrar ocorrência" descricao="Escolha o funcionário."
            rodape={<><button type="button" className={classeBotaoSecundario} onClick={() => setEscolhendo(false)}>Cancelar</button>
              <button type="button" className={classeBotaoPrimario} disabled={!escolhido} onClick={() => { setEscolhendo(false); setAberto({ id: escolhido, formulario: true }); }}>Continuar</button></>}>
            <label htmlFor="escolher-func" className="block text-sm font-semibold text-gray-900 mb-1.5">Funcionário</label>
            <select id="escolher-func" value={escolhido} onChange={(e) => setEscolhido(e.target.value)} className="w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm">
              <option value="">Selecione</option>
              {lista.map((f) => <option key={f.id} value={f.id}>{f.nome} ({matricula(f.matricula)})</option>)}
            </select>
          </Modal>
        </>
      )}
    </div>
  );
}

function Cartao({ icone: Icone, cor, rotulo, valor }: { icone: typeof Users; cor: string; rotulo: string; valor: number }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-3" data-testid={`cartao-${rotulo}`}>
      <span className={`w-11 h-11 rounded-xl inline-flex items-center justify-center shrink-0 ${cor}`}><Icone className="w-5 h-5" aria-hidden="true" /></span>
      <div><p className="text-sm text-gray-600">{rotulo}</p><p className="text-2xl font-black text-gray-900" data-testid="valor">{valor}</p></div>
    </div>
  );
}

const COR_ETAPA: Record<EstadoEtapa, { circulo: string; selo: string }> = {
  concluido: { circulo: 'bg-green-600 text-white border-green-600', selo: 'text-green-700' },
  em_andamento: { circulo: 'bg-orange-600 text-white border-orange-600', selo: 'text-orange-700' },
  aguardando: { circulo: 'bg-white text-gray-500 border-gray-300', selo: 'text-gray-500' },
  correcao: { circulo: 'bg-red-600 text-white border-red-600', selo: 'text-red-700' },
};
function Fluxo({ estados }: { estados: EstadoEtapa[] }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5" aria-labelledby="titulo-fluxo">
      <h2 id="titulo-fluxo" className="text-base font-bold text-gray-900 mb-3">Fluxo da folha</h2>
      <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="fluxo-folha">
        {ETAPAS.map((nome, i) => {
          const e = estados[i];
          return (
            <li key={nome} className="flex items-center gap-2 min-w-0" data-estado={e}>
              <span className={`w-9 h-9 shrink-0 rounded-full border-2 inline-flex items-center justify-center text-sm font-bold ${COR_ETAPA[e].circulo}`}>{e === 'concluido' ? <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> : i + 1}</span>
              <div className="min-w-0"><p className="text-sm font-semibold text-gray-900 truncate">{nome}</p><p className={`text-xs font-semibold ${COR_ETAPA[e].selo}`}>{ROTULO_ESTADO_ETAPA[e]}</p></div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ListaOcorrencias({ ocorrencias, painel, documentos, aoAbrir }: { ocorrencias: Ocorrencia[]; painel: PainelFolha; documentos: DocumentoFolha[]; aoAbrir: (idFuncionario: string) => void }) {
  if (ocorrencias.length === 0) return <p className="p-8 text-center text-sm text-gray-600">Nenhuma ocorrência registrada nesta competência.</p>;
  const nome = (id: string) => painel.funcionarios.find((f) => f.id === id)?.nome ?? '—';
  return (
    <ul className="divide-y divide-gray-100">
      {ocorrencias.map((o) => {
        const pend = painel.pendencias.find((p) => p.origem === 'ocorrencia' && p.id === o.id);
        const docs = documentos.filter((d) => d.id_ocorrencia === o.id).length;
        return (
          <li key={o.id}>
            <button type="button" className="w-full text-left px-4 py-3 hover:bg-gray-50 flex flex-wrap items-center gap-x-4 gap-y-1" onClick={() => aoAbrir(o.id_funcionario)}>
              <span className="font-semibold text-gray-900 min-w-[160px]">{nome(o.id_funcionario)}</span>
              <span className="text-gray-700 min-w-[140px]">{TIPOS_OCORRENCIA[o.tipo].rotulo}</span>
              <span className="text-gray-700">{resumoOcorrencia(o, formatarMoeda)}</span>
              <span className="text-gray-500 text-sm">{o.data_inicio ? `${formatarData(o.data_inicio)}${o.data_fim ? ` a ${formatarData(o.data_fim)}` : ''}` : ''}</span>
              {docs > 0 && <span className="text-xs text-gray-500 inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5" aria-hidden="true" />{docs}</span>}
              <span className="ml-auto">{pend ? <Selo tipo="perigo" texto={pend.descricao} /> : <Selo tipo="sucesso" texto="Completa" />}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ListaDocumentos({ documentos, painel, ocorrencias, aoErro }: { documentos: DocumentoFolha[]; painel: PainelFolha; ocorrencias: Ocorrencia[]; aoErro: (e: string) => void }) {
  if (documentos.length === 0) return <p className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-600">Nenhum documento nesta competência.</p>;
  const nome = (id: string | null) => painel.funcionarios.find((f) => f.id === id)?.nome ?? '';
  const ordem: DocumentoFolha['categoria'][] = ['holerite', 'resumo', 'liquidos', 'guia', 'outro', 'anexo_ocorrencia', 'comprovante'];
  return (
    <div className="space-y-4">
      {ordem.map((cat) => {
        const docs = documentos.filter((d) => d.categoria === cat);
        if (docs.length === 0) return null;
        return (
          <section key={cat} className="bg-white rounded-2xl border border-gray-200 p-4" aria-label={ROTULO_CATEGORIA_DOC[cat]}>
            <h2 className="text-base font-bold text-gray-900 mb-2">{ROTULO_CATEGORIA_DOC[cat]} <span className="text-gray-500 font-normal">({docs.length})</span></h2>
            <ul className="divide-y divide-gray-100">
              {docs.map((d) => {
                const oc = d.id_ocorrencia ? ocorrencias.find((o) => o.id === d.id_ocorrencia) : null;
                return (
                  <li key={d.id} className="py-2 flex items-center gap-3 text-sm min-w-0">
                    <FileText className="w-4 h-4 text-gray-500 shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <button type="button" className="font-semibold text-gray-900 underline truncate block max-w-full text-left" onClick={async () => { const e = await abrirArquivoFolha(d.caminho, d.nome_arquivo); if (e) aoErro(e); }}>{d.nome_arquivo}</button>
                      <p className="text-xs text-gray-500">{[nome(d.id_funcionario), oc ? TIPOS_OCORRENCIA[oc.tipo].rotulo : null, dataHora(d.enviado_em)].filter(Boolean).join(' · ')}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
