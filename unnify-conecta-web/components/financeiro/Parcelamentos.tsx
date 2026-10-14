'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CalendarClock, CheckCircle2, ChevronRight, Download, FileText, Landmark, Paperclip, Pencil, Plus, RotateCcw, Tag, Trash2, Wallet, XCircle, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { ARQUIVOS_COMPROVANTE, TAMANHO_MAXIMO_COMPROVANTE, formatarData, formatarMoeda, hojeBrasil, type Categoria, type ContaFinanceira, type Lancamento } from '@/lib/financeiro';
import { ROTULO_SITUACAO_CONTRATO, SELO_SITUACAO_CONTRATO, TIPOS_CONTRATO, ehFinanciamento, type ContratoResumo, type SituacaoContrato, type TipoContrato } from '@/lib/parcelamentos';
import { BarraFiltros, BotaoIcone, BotaoLimparFiltros, CampoBusca, FiltroSelect, Paginacao, Selo } from '@/components/admin/tabela';
import { Modal, classeBotaoPerigo, classeBotaoSecundario } from '@/components/ui/Modal';
import { IconeCategoria } from './IconeCategoria';
import { ModalBaixa, type LancamentoParaBaixa } from './ModalBaixa';
import { FormContrato } from './FormContrato';
import { ModalEditarContrato } from './ModalEditarContrato';
import { Indicador } from './Indicador';

interface ResumoParcelamentos {
  contratos_ativos: number;
  saldo_devedor_total: number;
  parcelas_pagas: number;
  parcelas_em_atraso: number;
}

function Progresso({ percentual }: { percentual: number }) {
  return (
    <div className="h-2 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuenow={Number(percentual)} aria-valuemin={0} aria-valuemax={100} aria-label="Percentual quitado">
      <div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.min(100, Number(percentual))}%` }} />
    </div>
  );
}

const diasAte = (iso: string, hoje: string) => Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86400000);

interface Props {
  idEmpresa: string;
  categorias: Categoria[];
  contas: ContaFinanceira[];
  versao: number;
  aoAlterar: (mensagem: string) => void;
  aoIrParaContas: () => void;
}

export function Parcelamentos({ idEmpresa, categorias, contas, versao, aoAlterar, aoIrParaContas }: Props) {
  const [hoje, setHoje] = useState('');
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [tipo, setTipo] = useState('');
  const [categoria, setCategoria] = useState('');
  const [situacao, setSituacao] = useState('');
  const [vencimento, setVencimento] = useState('');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [contratos, setContratos] = useState<ContratoResumo[]>([]);
  const [total, setTotal] = useState(0);
  const [resumo, setResumo] = useState<ResumoParcelamentos | null>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const detalheRef = useRef<HTMLDivElement>(null);

  useEffect(() => setHoje(hojeBrasil()), []);
  useEffect(() => {
    const t = setTimeout(() => { setBuscaAplicada(busca.trim()); setPagina(1); }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    if (!hoje) return;
    let ativo = true;
    const supabase = createClient();
    let q = supabase.from('contratos_parcelados_resumo').select('*', { count: 'exact' }).eq('id_empresa', idEmpresa);
    if (tipo) q = q.eq('tipo', tipo);
    if (categoria) q = q.eq('id_categoria', categoria);
    if (situacao) q = q.eq('situacao', situacao);
    if (vencimento === 'atrasados') q = q.gt('qtd_atrasadas', 0);
    if (vencimento === '30dias') q = q.gte('proximo_vencimento', hoje).lte('proximo_vencimento', new Date(Date.parse(`${hoje}T12:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10));
    if (buscaAplicada) {
      const termo = buscaAplicada.replace(/[%,()]/g, ' ');
      q = q.or(`nome.ilike.%${termo}%,contraparte.ilike.%${termo}%`);
    }
    const inicio = (pagina - 1) * porPagina;
    setCarregando(true);
    Promise.all([
      q.order('criado_em', { ascending: false }).range(inicio, inicio + porPagina - 1),
      supabase.rpc('resumo_parcelamentos', { p_id_empresa: idEmpresa, p_tipo: tipo || null, p_id_categoria: categoria || null }),
    ]).then(([lista, res]) => {
      if (!ativo) return;
      if (lista.error || res.error) setErro(mensagemDeErro(lista.error ?? res.error, 'Não foi possível carregar os parcelamentos.'));
      else {
        setErro(null);
        const itens = (lista.data ?? []) as ContratoResumo[];
        setContratos(itens);
        setTotal(lista.count ?? 0);
        setResumo(res.data as ResumoParcelamentos);
        setSelecionado((atual) => (atual && itens.some((c) => c.id === atual) ? atual : itens[0]?.id ?? null));
      }
      setCarregando(false);
    });
    return () => { ativo = false; };
  }, [idEmpresa, tipo, categoria, situacao, vencimento, buscaAplicada, pagina, porPagina, hoje, versao]);

  const escolher = (id: string) => {
    setSelecionado(id);
    if (window.matchMedia('(max-width: 1279px)').matches) setTimeout(() => detalheRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const filtros = busca || tipo || categoria || situacao || vencimento;
  const contrato = contratos.find((c) => c.id === selecionado) ?? null;
  if (!hoje) return null;

  return (
    <div className="space-y-5 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900">Parcelamentos</h2>
          <p className="text-sm text-gray-600">Gerencie seus contratos parcelados, com controle de parcelas, saldo devedor e quitação.</p>
        </div>
        <button type="button" onClick={() => setNovo(true)} className="min-h-11 px-5 inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold">
          <Plus className="w-4 h-4" aria-hidden="true" />Novo contrato
        </button>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-1 min-[360px]:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Contratos ativos" valor={String(resumo?.contratos_ativos ?? 0)} icone={FileText} cor="bg-blue-100 text-blue-600" />
        <Indicador titulo="Saldo devedor total" valor={formatarMoeda(resumo?.saldo_devedor_total ?? 0)} icone={Wallet} cor="bg-orange-100 text-orange-600" />
        <Indicador titulo="Parcelas pagas" valor={String(resumo?.parcelas_pagas ?? 0)} icone={CheckCircle2} cor="bg-green-100 text-green-600" />
        <Indicador titulo="Parcelas em atraso" valor={String(resumo?.parcelas_em_atraso ?? 0)} icone={AlertCircle} cor="bg-red-100 text-red-600" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 sm:p-4 space-y-4 min-w-0" aria-label="Lista de contratos">
          <BarraFiltros>
            <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar contratos" />
            <FiltroSelect icone={FileText} valor={tipo} aoMudar={(v) => { setTipo(v); setPagina(1); }}>
              <option value="">Todos os tipos</option>
              {(Object.keys(TIPOS_CONTRATO) as TipoContrato[]).map((t) => <option key={t} value={t}>{TIPOS_CONTRATO[t]}</option>)}
            </FiltroSelect>
            <FiltroSelect icone={Tag} valor={categoria} aoMudar={(v) => { setCategoria(v); setPagina(1); }}>
              <option value="">Todas as categorias</option>
              {categorias.filter((c) => c.tipo === 'despesa').map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </FiltroSelect>
            <FiltroSelect valor={situacao} aoMudar={(v) => { setSituacao(v); setPagina(1); }}>
              <option value="">Todos os status</option>
              {(Object.keys(ROTULO_SITUACAO_CONTRATO) as SituacaoContrato[]).map((s) => <option key={s} value={s}>{ROTULO_SITUACAO_CONTRATO[s]}</option>)}
            </FiltroSelect>
            <FiltroSelect icone={CalendarClock} valor={vencimento} aoMudar={(v) => { setVencimento(v); setPagina(1); }}>
              <option value="">Qualquer vencimento</option>
              <option value="atrasados">Com parcela atrasada</option>
              <option value="30dias">Vence em 30 dias</option>
            </FiltroSelect>
            {filtros && <BotaoLimparFiltros aoClicar={() => { setBusca(''); setTipo(''); setCategoria(''); setSituacao(''); setVencimento(''); setPagina(1); }} />}
          </BarraFiltros>
          <div>
            <h3 className="font-bold text-gray-900">Lista de contratos</h3>
            <p className="text-xs text-gray-500">{total} {total === 1 ? 'contrato' : 'contratos'}</p>
          </div>
          {erro ? (
            <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{erro}</div>
          ) : carregando ? (
            <div role="status" aria-label="Carregando" className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-xl bg-gray-50 animate-pulse" />)}</div>
          ) : contratos.length === 0 ? (
            <div className="text-center py-12">
              <Landmark className="w-10 h-10 text-gray-300 mx-auto mb-2" aria-hidden="true" />
              <p className="font-semibold text-gray-900">{filtros ? 'Nenhum contrato encontrado com esses filtros.' : 'Nenhum contrato parcelado ainda.'}</p>
              {!filtros && <p className="text-sm text-gray-600 mt-1">Cadastre compras parceladas, boletos, financiamentos e empréstimos em “Novo contrato”.</p>}
            </div>
          ) : (
            <ul className="space-y-2">
              {contratos.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => escolher(c.id)} aria-pressed={selecionado === c.id} data-testid={`contrato-${c.nome}`}
                    className={`w-full text-left rounded-xl border p-3 flex gap-3 transition ${selecionado === c.id ? 'border-orange-400 bg-orange-50/40 ring-1 ring-orange-200' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <IconeCategoria icone={c.categoria_icone} cor={c.categoria_cor} tamanho="lg" className="hidden sm:inline-flex" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 break-words">{c.nome}</p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700">{TIPOS_CONTRATO[c.tipo]}</span>
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">{c.categoria_nome}</span>
                            <Selo tipo={SELO_SITUACAO_CONTRATO[c.situacao]} texto={ROTULO_SITUACAO_CONTRATO[c.situacao]} />
                          </div>
                          <p className="mt-1.5 text-xs text-gray-500">
                            {[c.contraparte, `${c.qtd_parcelas} parcelas`, `Início: ${formatarData(c.data_contratacao)}`].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <div className="md:w-56 shrink-0">
                          <p className="font-bold text-gray-900">{formatarMoeda(c.saldo_devedor)}</p>
                          <p className="text-xs text-gray-500">Saldo devedor de {formatarMoeda(c.valor_total)}</p>
                          <div className="mt-1.5"><Progresso percentual={c.percentual_quitado} /></div>
                          <p className="mt-1 text-xs text-gray-500">{c.qtd_pagas} pagas{c.tem_entrada ? ' (com entrada)' : ''} · {Number(c.percentual_quitado).toLocaleString('pt-BR')}%</p>
                          {c.proximo_vencimento && <p className={`text-xs ${c.qtd_atrasadas > 0 ? 'text-red-700 font-semibold' : 'text-gray-500'}`}>{c.qtd_atrasadas > 0 ? `${c.qtd_atrasadas} em atraso · ` : ''}Próximo: {formatarData(c.proximo_vencimento)}</p>}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 self-center hidden md:block" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!erro && !carregando && total > 0 && <Paginacao pagina={pagina} aoMudarPagina={setPagina} porPagina={porPagina} aoMudarPorPagina={setPorPagina} total={total} />}
        </section>

        <div ref={detalheRef} className="min-w-0 scroll-mt-20">
          {contrato ? (
            <DetalheContrato contrato={contrato} idEmpresa={idEmpresa} categorias={categorias} contas={contas} hoje={hoje} versao={versao} aoAlterar={aoAlterar} aoIrParaContas={aoIrParaContas} />
          ) : (
            !carregando && contratos.length > 0 && <p className="text-sm text-gray-500">Selecione um contrato para ver os detalhes.</p>
          )}
        </div>
      </div>

      <FormContrato aberto={novo} aoFechar={() => setNovo(false)} idEmpresa={idEmpresa} categorias={categorias} contas={contas}
        aoCriar={(m, id) => { setNovo(false); setSelecionado(id); aoAlterar(m); }} />
    </div>
  );
}

type AbaDetalhe = 'resumo' | 'parcelas' | 'informacoes' | 'anexos';

function DetalheContrato({ contrato: c, idEmpresa, categorias, contas, hoje, versao, aoAlterar, aoIrParaContas }: {
  contrato: ContratoResumo; idEmpresa: string; categorias: Categoria[]; contas: ContaFinanceira[]; hoje: string; versao: number; aoAlterar: (m: string) => void; aoIrParaContas: () => void;
}) {
  const [aba, setAba] = useState<AbaDetalhe>('resumo');
  const [parcelas, setParcelas] = useState<Lancamento[]>([]);
  const [anexos, setAnexos] = useState<{ id: string; caminho: string; nome_arquivo: string }[]>([]);
  const [historico, setHistorico] = useState<{ acao: string; criado_em: string }[]>([]);
  const [pagando, setPagando] = useState<LancamentoParaBaixa | null>(null);
  const [estornando, setEstornando] = useState<Lancamento | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [editando, setEditando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const supabase = createClient();
    const [p, a, h] = await Promise.all([
      supabase.from('lancamentos_financeiros_situacao').select('*').eq('id_contrato', c.id).order('numero_parcela'),
      supabase.from('anexos_contratos').select('id, caminho, nome_arquivo').eq('id_contrato', c.id).order('criado_em'),
      supabase.from('historico_contratos').select('acao, criado_em').eq('id_contrato', c.id).order('criado_em', { ascending: false }),
    ]);
    setParcelas((p.data ?? []) as Lancamento[]);
    setAnexos(a.data ?? []);
    setHistorico(h.data ?? []);
  }, [c.id]);

  useEffect(() => {
    setErro(null);
    carregar();
  }, [carregar, versao]);

  const executar = async (fn: () => PromiseLike<{ error: { message?: string } | null }>, msg: string) => {
    setOcupado(true);
    setErro(null);
    const { error } = await fn();
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível concluir a ação.'));
    setCancelando(false);
    setExcluindo(false);
    setEstornando(null);
    aoAlterar(msg);
  };

  const anexar = async (arquivo: File) => {
    if (!ARQUIVOS_COMPROVANTE.includes(arquivo.type) || arquivo.size > TAMANHO_MAXIMO_COMPROVANTE) return setErro('Anexo: PDF, JPG, PNG ou WebP até 10 MB.');
    const supabase = createClient();
    const extensao = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[arquivo.type];
    const caminho = `${idEmpresa}/contratos/${c.id}/${crypto.randomUUID()}.${extensao}`;
    const envio = await supabase.storage.from('comprovantes-financeiros').upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
    if (envio.error) return setErro('Não foi possível enviar o anexo.');
    const { error } = await supabase.rpc('registrar_anexo_contrato', { p_id_contrato: c.id, p_caminho: caminho, p_nome_arquivo: arquivo.name });
    if (error) {
      await supabase.storage.from('comprovantes-financeiros').remove([caminho]);
      return setErro('Não foi possível registrar o anexo.');
    }
    aoAlterar('Anexo adicionado ao contrato.');
  };

  const baixar = async (a: { caminho: string; nome_arquivo: string }) => {
    const { data, error } = await createClient().storage.from('comprovantes-financeiros').createSignedUrl(a.caminho, 60, { download: a.nome_arquivo });
    if (error || !data) return setErro('Você não tem acesso a este anexo.');
    window.location.assign(data.signedUrl);
  };

  const removerAnexo = async (id: string) => {
    const supabase = createClient();
    const { data: caminho, error } = await supabase.rpc('remover_anexo_contrato', { p_id: id });
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível remover.'));
    await supabase.storage.from('comprovantes-financeiros').remove([caminho as string]);
    aoAlterar('Anexo removido.');
  };

  const pendentes = parcelas.filter((p) => p.status === 'pendente');
  const dias = c.proximo_vencimento ? diasAte(c.proximo_vencimento, hoje) : null;
  const pagar = (p: Lancamento) => setPagando({ id: p.id, tipo: 'despesa', descricao: p.descricao, valor: p.valor });

  const LinhaParcela = ({ p }: { p: Lancamento }) => (
    <li className="flex flex-wrap items-center gap-2 py-2.5" data-testid={`parcela-${p.numero_parcela}`}>
      <span className="w-8 h-8 rounded-full bg-gray-100 text-gray-700 text-xs font-bold inline-flex items-center justify-center shrink-0">{p.numero_parcela === 0 ? 'E' : p.numero_parcela}</span>
      <div className="flex-1 min-w-[8rem]">
        <p className="text-sm font-semibold text-gray-900">{formatarMoeda(p.valor)}</p>
        <p className="text-xs text-gray-500">{p.numero_parcela === 0 ? 'Entrada · ' : ''}Vence {formatarData(p.data_vencimento)}{p.data_pagamento ? ` · pago ${formatarData(p.data_pagamento)}` : ''}</p>
      </div>
      <Selo tipo={p.situacao === 'pago' ? 'sucesso' : p.situacao === 'vencido' ? 'perigo' : p.situacao === 'cancelado' ? 'neutro' : 'info'}
        texto={p.situacao === 'pago' ? 'Paga' : p.situacao === 'vencido' ? 'Atrasada' : p.situacao === 'cancelado' ? 'Cancelada' : 'Pendente'} />
      {(p.situacao === 'pendente' || p.situacao === 'vencido') && !c.cancelado_em && (
        <button type="button" onClick={() => pagar(p)} className="min-h-11 px-4 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold" aria-label={`Pagar parcela ${p.numero_parcela === 0 ? 'de entrada' : p.numero_parcela}`}>Pagar</button>
      )}
      {p.status === 'pago' && <BotaoIcone icone={RotateCcw} titulo={`Estornar parcela ${p.numero_parcela}`} aoClicar={() => setEstornando(p)} />}
    </li>
  );

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5 space-y-4" aria-label={`Detalhes de ${c.nome}`}>
      <div className="flex items-start gap-3">
        <IconeCategoria icone={c.categoria_icone} cor={c.categoria_cor} tamanho="lg" />
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-gray-900 break-words">{c.nome}</h3>
          <p className="text-sm text-gray-500">{c.contraparte ?? TIPOS_CONTRATO[c.tipo]}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Selo tipo={SELO_SITUACAO_CONTRATO[c.situacao]} texto={ROTULO_SITUACAO_CONTRATO[c.situacao]} />
          {!c.cancelado_em && (
            <button type="button" onClick={() => setEditando(true)} className="min-h-11 px-3 inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-orange-600 hover:bg-orange-50">
              <Pencil className="w-4 h-4" aria-hidden="true" />Editar
            </button>
          )}
        </div>
      </div>

      <nav aria-label="Seções do contrato" className="flex border-b border-gray-200 overflow-x-auto">
        {(['resumo', 'parcelas', 'informacoes', 'anexos'] as AbaDetalhe[]).map((a) => (
          <button key={a} type="button" onClick={() => setAba(a)} aria-current={aba === a ? 'page' : undefined}
            className={`flex-1 min-h-11 px-3 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${aba === a ? 'border-orange-600 text-orange-600' : 'border-transparent text-gray-600'}`}>
            {a === 'resumo' ? 'Resumo' : a === 'parcelas' ? 'Parcelas' : a === 'informacoes' ? 'Informações' : 'Anexos'}
          </button>
        ))}
      </nav>

      {aba === 'resumo' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">Valor do contrato</p><p className="font-bold text-gray-900">{formatarMoeda(c.valor_total)}</p></div>
            <div className="rounded-xl bg-orange-50 p-3" data-testid="saldo-devedor"><p className="text-xs text-gray-500">Saldo devedor</p><p className="font-bold text-orange-700">{formatarMoeda(c.saldo_devedor)}</p></div>
            <div className="rounded-xl border border-gray-200 p-3"><p className="text-xs text-gray-500">Próxima parcela</p><p className="font-bold text-gray-900">{c.valor_proxima ? formatarMoeda(c.valor_proxima) : '—'}</p></div>
            <div className="rounded-xl border border-gray-200 p-3">
              <p className="text-xs text-gray-500">Parcelas pagas</p>
              <p className="font-bold text-gray-900">{c.qtd_pagas} de {c.qtd_parcelas + (c.tem_entrada ? 1 : 0)}</p>
              <div className="mt-1"><Progresso percentual={c.percentual_quitado} /></div>
              <p className="text-xs text-gray-500 mt-0.5">{Number(c.percentual_quitado).toLocaleString('pt-BR')}% quitado</p>
            </div>
            <div className="col-span-2 rounded-xl border border-gray-200 p-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" aria-hidden="true" />
              <p className="text-sm text-gray-700">
                Próximo vencimento: <strong>{c.proximo_vencimento ? formatarData(c.proximo_vencimento) : '—'}</strong>
                {dias !== null && <span className={`ml-2 text-xs font-semibold ${dias < 0 ? 'text-red-700' : 'text-orange-700'}`}>{dias < 0 ? `atrasada há ${-dias} dia${dias === -1 ? '' : 's'}` : dias === 0 ? 'vence hoje' : `em ${dias} dia${dias === 1 ? '' : 's'}`}</span>}
              </p>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <h4 className="font-bold text-gray-900">Próximas parcelas</h4>
              <button type="button" onClick={() => setAba('parcelas')} className="min-h-11 text-sm font-semibold text-orange-600">Ver todas</button>
            </div>
            {pendentes.length === 0 ? <p className="text-sm text-gray-500">{c.situacao === 'quitado' ? 'Contrato quitado. 🎉' : 'Nenhuma parcela pendente.'}</p> : (
              <ul className="divide-y divide-gray-100">{pendentes.slice(0, 5).map((p) => <LinhaParcela key={p.id} p={p} />)}</ul>
            )}
          </div>
        </div>
      )}

      {aba === 'parcelas' && (
        <ul className="divide-y divide-gray-100" aria-label="Todas as parcelas">{parcelas.map((p) => <LinhaParcela key={p.id} p={p} />)}</ul>
      )}

      {aba === 'informacoes' && (
        <div className="space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div><dt className="text-gray-500">Tipo</dt><dd className="text-gray-900">{TIPOS_CONTRATO[c.tipo]}</dd></div>
            <div><dt className="text-gray-500">Categoria</dt><dd className="text-gray-900 flex items-center gap-1.5"><IconeCategoria icone={c.categoria_icone} cor={c.categoria_cor} tamanho="sm" />{c.categoria_nome}</dd></div>
            <div><dt className="text-gray-500">{ehFinanciamento(c.tipo) ? 'Instituição' : 'Fornecedor'}</dt><dd className="text-gray-900 break-words">{c.contraparte ?? '—'}</dd></div>
            <div><dt className="text-gray-500">Contratação</dt><dd className="text-gray-900">{formatarData(c.data_contratacao)}</dd></div>
            <div><dt className="text-gray-500">Valor principal</dt><dd className="text-gray-900">{formatarMoeda(c.valor_principal)}</dd></div>
            <div><dt className="text-gray-500">Modalidade</dt><dd className="text-gray-900">{c.modalidade === 'fixas' ? 'Parcelas fixas' : 'Personalizadas'}</dd></div>
            {c.taxa_juros_mensal !== null && <div><dt className="text-gray-500">Taxa de juros (a.m.)</dt><dd className="text-gray-900">{Number(c.taxa_juros_mensal).toLocaleString('pt-BR')}%</dd></div>}
            {Number(c.juros_previstos) > 0 && <div><dt className="text-gray-500">Juros informados</dt><dd className="text-gray-900">{formatarMoeda(c.juros_previstos)}</dd></div>}
            <div><dt className="text-gray-500">Conta de pagamento</dt><dd className="text-gray-900">{c.conta_nome ?? '—'}</dd></div>
          </dl>
          {ehFinanciamento(c.tipo) && <p className="text-xs text-gray-600 rounded-lg bg-blue-50 border border-blue-100 p-2.5">Parcelas deste contrato não contam como despesa operacional no Financeiro; aparecem como pagamentos de empréstimos/financiamentos, com os juros informados à parte.</p>}
          {c.descricao && <p className="text-gray-700 whitespace-pre-line break-words">{c.descricao}</p>}
          {c.cancelado_em && <p className="text-gray-700">Cancelado em {new Date(c.cancelado_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}: {c.motivo_cancelamento}</p>}
          {historico.length > 0 && (
            <ul className="text-xs text-gray-500 space-y-1">
              {historico.map((h, i) => <li key={i}>{{ criado: 'Contrato criado', editado: 'Contrato editado', cancelado: 'Contrato cancelado', excluido: 'Contrato excluído', anexo_adicionado: 'Anexo adicionado', anexo_removido: 'Anexo removido' }[h.acao] ?? h.acao} · {new Date(h.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</li>)}
            </ul>
          )}
          {!c.cancelado_em && (
            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => { setMotivo(''); setErro(null); setCancelando(true); }} className={classeBotaoSecundario}><XCircle className="w-4 h-4" aria-hidden="true" />Cancelar contrato</button>
              {c.qtd_pagas === 0 && <button type="button" onClick={() => { setErro(null); setExcluindo(true); }} className={`${classeBotaoSecundario} text-red-700`}><Trash2 className="w-4 h-4" aria-hidden="true" />Excluir contrato</button>}
            </div>
          )}
        </div>
      )}

      {aba === 'anexos' && (
        <div className="space-y-3 text-sm">
          {anexos.length === 0 ? <p className="text-gray-500">Nenhum anexo.</p> : (
            <ul className="space-y-2">
              {anexos.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-lg border border-gray-200 p-2">
                  <FileText className="w-5 h-5 text-orange-600 shrink-0" aria-hidden="true" />
                  <span className="flex-1 min-w-0 truncate">{a.nome_arquivo}</span>
                  <BotaoIcone icone={Download} titulo={`Baixar ${a.nome_arquivo}`} aoClicar={() => baixar(a)} />
                  <BotaoIcone icone={Trash2} titulo={`Remover ${a.nome_arquivo}`} aoClicar={() => removerAnexo(a.id)} />
                </li>
              ))}
            </ul>
          )}
          <label htmlFor="anexo-contrato" className={`${classeBotaoSecundario} cursor-pointer`}><Paperclip className="w-4 h-4" aria-hidden="true" />Anexar arquivo</label>
          <input id="anexo-contrato" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) anexar(f); }} />
        </div>
      )}

      {erro && !cancelando && !excluindo && !estornando && <p role="alert" className="text-sm text-red-700">{erro}</p>}

      <ModalEditarContrato contrato={c} aberto={editando} aoFechar={() => setEditando(false)} categorias={categorias} contas={contas}
        aoSalvar={(m) => { setEditando(false); aoAlterar(m); }} />

      <ModalBaixa lancamento={pagando} idEmpresa={idEmpresa} contas={contas} aoFechar={() => setPagando(null)}
        aoConcluir={(m) => { setPagando(null); aoAlterar(m); }} aoIrParaContas={aoIrParaContas} />

      <Modal aberto={!!estornando} aoFechar={() => setEstornando(null)} titulo="Estornar pagamento da parcela"
        descricao={estornando ? `${estornando.descricao} · ${formatarMoeda(estornando.valor)}` : undefined}
        rodape={<>
          <button type="button" className={classeBotaoSecundario} onClick={() => setEstornando(null)}>Voltar</button>
          <button type="button" className={classeBotaoPerigo} disabled={ocupado} onClick={() => executar(() => createClient().rpc('estornar_baixa_lancamento', { p_id: estornando!.id }), 'Pagamento estornado. A parcela voltou a ficar pendente.')}>Estornar</button>
        </>}>
        <p className="text-sm text-gray-700">O valor volta para a conta e a parcela volta a contar no saldo devedor. O histórico é mantido.</p>
        {erro && <p role="alert" className="text-sm text-red-700 mt-2">{erro}</p>}
      </Modal>

      <Modal aberto={cancelando} aoFechar={() => setCancelando(false)} titulo="Cancelar contrato"
        descricao="As parcelas já pagas são mantidas; as pendentes serão canceladas."
        rodape={<>
          <button type="button" className={classeBotaoSecundario} onClick={() => setCancelando(false)}>Voltar</button>
          <button type="button" className={classeBotaoPerigo} disabled={ocupado} onClick={() => motivo.trim().length < 3 ? setErro('Informe o motivo do cancelamento.') : executar(() => createClient().rpc('cancelar_contrato_parcelado', { p_id: c.id, p_motivo: motivo }), 'Contrato cancelado.')}>Cancelar contrato</button>
        </>}>
        <label htmlFor="motivo-cancelamento" className="block text-sm font-semibold text-gray-900 mb-1.5">Motivo</label>
        <textarea id="motivo-cancelamento" rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
        {erro && <p role="alert" className="text-sm text-red-700 mt-2">{erro}</p>}
      </Modal>

      <Modal aberto={excluindo} aoFechar={() => setExcluindo(false)} titulo="Excluir contrato"
        descricao="O contrato e suas parcelas saem das listas. Só é possível sem pagamentos registrados."
        rodape={<>
          <button type="button" className={classeBotaoSecundario} onClick={() => setExcluindo(false)}>Voltar</button>
          <button type="button" className={classeBotaoPerigo} disabled={ocupado} onClick={() => executar(() => createClient().rpc('excluir_contrato_parcelado', { p_id: c.id }), 'Contrato excluído.')}>Excluir</button>
        </>}>
        <p className="text-sm text-gray-700">O registro fica guardado no histórico.</p>
        {erro && <p role="alert" className="text-sm text-red-700 mt-2">{erro}</p>}
      </Modal>
    </section>
  );
}
