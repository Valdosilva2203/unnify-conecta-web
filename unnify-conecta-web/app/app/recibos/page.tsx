'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, CalendarDays, Copy, FileCheck2, FileText, FileX2, Link2, Mail, MessageCircle, Plus, Printer, RefreshCw, Share2, Wallet } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarData, formatarMoeda, hojeBrasil } from '@/lib/financeiro';
import { recursoAusente } from '@/lib/erros-banco';
import { variacao } from '@/lib/relatorios';
import { periodoVendas } from '@/lib/estoque-vendas';
import { FORMAS_RECIBO, TIPO_RECIBO, declaracao, htmlRecibo, mascaraDocumentoLivre, mensagemCompartilhar, numeroRecibo, type Recibo, type ReciboLinha, type ResumoRecibos } from '@/lib/recibos';
import { Paginacao, Selo } from '@/components/admin/tabela';
import { Indicador } from '@/components/financeiro/Indicador';
import { classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { ModalCancelarRecibo, ModalConciliar, ModalNovoRecibo } from '@/components/recibos/Modais';

type Lista = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string; ausente: boolean } | { tipo: 'ok'; linhas: ReciboLinha[]; total: number };
type Periodo = 'mes' | 'anterior' | '90' | 'ano';
const filtro = 'min-h-11 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500';
const ROTULO_PERIODO: Record<Periodo, string> = { mes: 'Este mês', anterior: 'Mês anterior', '90': 'Últimos 90 dias', ano: 'Este ano' };
const comp = (a: number, b: number) => { const x = variacao(a, b); return x === null ? 'Sem base no período anterior' : `${x > 0 ? '+' : ''}${String(x).replace('.', ',')}% vs. período anterior`; };

export default function RecibosPage() {
  const { empresa } = useEmpresaAtual();
  const [hoje, setHoje] = useState<string | null>(null);
  const [lancInicial, setLancInicial] = useState<string | null>(null);
  useEffect(() => {
    setHoje(hojeBrasil()); // data de Brasília lida só no navegador
    const l = new URLSearchParams(window.location.search).get('lancamento');
    if (l && /^[0-9a-f-]{36}$/i.test(l)) setLancInicial(l);
  }, []);
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [resumo, setResumo] = useState<ResumoRecibos | null | 'erro'>(null);
  const [lista, setLista] = useState<Lista>({ tipo: 'carregando' });
  const [situacao, setSituacao] = useState('');
  const [tipo, setTipo] = useState('');
  const [cliente, setCliente] = useState('');
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [podeOperar, setPodeOperar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [conciliar, setConciliar] = useState<{ id: string; numero: number; valor: number } | null>(null);
  const [cancelar, setCancelar] = useState<{ id: string; numero: number } | null>(null);
  const [versao, setVersao] = useState(0);
  const req = useRef(0);
  const { inicio, fim } = hoje ? periodoVendas(periodo, hoje) : { inicio: '', fim: '' };

  useEffect(() => { if (lancInicial && podeOperar) setNovo(true); }, [lancInicial, podeOperar]);
  const carregar = useCallback(() => {
    if (!empresa || !inicio) return;
    const atual = ++req.current;
    setLista((l) => (l.tipo === 'ok' ? l : { tipo: 'carregando' }));
    createClient().rpc('buscar_recibos', { p_id_empresa: empresa.id, p_busca: busca.trim() || null, p_tipo: tipo || null, p_situacao: situacao || null, p_id_cliente: cliente || null,
      p_inicio: inicio, p_fim: fim, p_limite: porPagina, p_deslocamento: (pagina - 1) * porPagina })
      .then(({ data, error }) => {
        if (atual !== req.current) return;
        if (error) return setLista({ tipo: 'erro', mensagem: mensagemDeErro(error, 'Não foi possível carregar os recibos.'), ausente: recursoAusente(error) });
        const linhas = (data ?? []) as ReciboLinha[];
        setLista({ tipo: 'ok', linhas, total: Number(linhas[0]?.total ?? 0) });
        setSelecionado((s) => (s && linhas.some((l) => l.id === s) ? s : linhas[0]?.id ?? null));
      });
  }, [empresa, busca, tipo, situacao, cliente, inicio, fim, pagina, porPagina]);
  useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t); }, [carregar, versao]);
  useEffect(() => {
    if (!empresa || !inicio) return;
    createClient().rpc('resumo_recibos', { p_id_empresa: empresa.id, p_inicio: inicio, p_fim: fim }).then(({ data, error }) => setResumo(error ? 'erro' : (data as ResumoRecibos)));
  }, [empresa, inicio, fim, versao]);
  useEffect(() => {
    if (!empresa) return;
    const supabase = createClient();
    supabase.rpc('pode_operar_comercial', { p_id_empresa: empresa.id }).then(({ data }) => setPodeOperar(!!data));
    supabase.from('clientes').select('id, nome, nome_fantasia').eq('id_empresa', empresa.id).order('nome').limit(1000)
      .then(({ data }) => setClientes((data ?? []).map((c) => ({ id: c.id as string, nome: (c.nome_fantasia as string) || (c.nome as string) }))));
  }, [empresa]);

  if (!empresa || !hoje) return null;
  const alterado = (m: string, id?: string) => {
    setAviso(m); setNovo(false); setConciliar(null); setCancelar(null); if (id) setSelecionado(id); setVersao((v) => v + 1);
    if (lancInicial) { setLancInicial(null); window.history.replaceState(null, '', '/app/recibos'); }
  };
  const r = resumo && resumo !== 'erro' ? resumo : null;
  const card = (v: string | undefined) => (r ? v ?? '—' : resumo === 'erro' ? 'Indisponível' : '…');
  const linhas = lista.tipo === 'ok' ? lista.linhas : [];
  const filtrando = !!(busca || tipo || situacao || cliente);

  return (
    <div className="space-y-5 min-w-0">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-2xl bg-orange-100 text-orange-600 inline-flex items-center justify-center"><FileText className="w-7 h-7" aria-hidden="true" /></span>
          <div className="min-w-0"><h1 className="text-2xl sm:text-3xl font-black text-gray-900">Recibos</h1>
            <p className="text-gray-600 mt-1 text-sm sm:text-base">Emita e gerencie os comprovantes de pagamentos recebidos ou realizados.</p></div>
        </div>
        <div className="flex flex-col min-[420px]:flex-row gap-2 self-stretch xl:self-auto">
          <select aria-label="Período" value={periodo} onChange={(e) => { setPeriodo(e.target.value as Periodo); setPagina(1); }} className={filtro}>{Object.entries(ROTULO_PERIODO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          {podeOperar && <button type="button" className={`${classeBotaoPrimario} whitespace-nowrap`} onClick={() => setNovo(true)}><Plus className="w-4 h-4" aria-hidden="true" />Novo recibo</button>}
        </div>
      </div>

      {aviso && <div role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex justify-between gap-3"><span>{aviso}</span><button type="button" className="underline" onClick={() => setAviso(null)}>Fechar</button></div>}
      {lista.tipo === 'erro' && (lista.ausente
        ? <p role="status" data-testid="recibos-indisponivel" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{lista.mensagem}</p>
        : <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex flex-wrap justify-between gap-3">{lista.mensagem}
            <button type="button" onClick={() => setVersao((v) => v + 1)} className="min-h-11 px-3 inline-flex items-center gap-1 font-semibold hover:underline"><RefreshCw className="w-4 h-4" aria-hidden="true" />Tentar novamente</button></div>)}

      <div className="grid gap-3 sm:gap-4 grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Recibos emitidos" valor={card(r ? String(r.emitidos) : undefined)} icone={FileCheck2} cor="bg-green-100 text-green-600" detalhe={r ? comp(r.emitidos, r.emitidos_anterior) : undefined} />
        <Indicador titulo="Valor recebido documentado" valor={card(r ? formatarMoeda(r.valor_recebido) : undefined)} icone={Wallet} cor="bg-blue-100 text-blue-600" detalhe={r ? (r.valor_pago ? `Pagamentos comprovados: ${formatarMoeda(r.valor_pago)}` : comp(r.valor_recebido, r.valor_recebido_anterior)) : undefined} />
        <Indicador titulo="Cancelados" valor={card(r ? String(r.cancelados) : undefined)} icone={FileX2} cor="bg-orange-100 text-orange-600" detalhe={r ? (r.nao_conciliados ? `${r.nao_conciliados} manuais não conciliados` : 'Fora dos valores válidos') : undefined} />
        <Indicador titulo="Este mês" valor={card(r ? formatarMoeda(r.mes_valor) : undefined)} icone={CalendarDays} cor="bg-purple-100 text-purple-600" detalhe={r ? `${r.mes_quantidade} recibos emitidos no mês` : undefined} />
      </div>
      <p className="text-xs text-gray-500 -mt-2">Período pela data do pagamento ({formatarData(inicio)} a {formatarData(fim)}). Recibos cancelados nunca entram nos valores. Recibo comprova pagamento e não substitui nota fiscal.</p>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <section aria-label="Lista de recibos" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 sm:p-4 min-w-0 space-y-3">
          <div role="tablist" aria-label="Situação do recibo" className="flex flex-wrap gap-1">
            {([['', 'Todos'], ['emitido', 'Emitidos'], ['cancelado', 'Cancelados']] as const).map(([v, rot]) => (
              <button key={v} type="button" role="tab" aria-selected={situacao === v} onClick={() => { setSituacao(v); setPagina(1); }}
                className={`min-h-11 px-3 sm:px-4 rounded-lg text-sm font-semibold ${situacao === v ? 'bg-orange-600 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>{rot}</button>
            ))}
          </div>
          <div className="flex flex-col lg:flex-row gap-2">
            <input type="search" aria-label="Buscar recibos" placeholder="Buscar por número, pessoa, descrição ou valor..." value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} className={`${filtro} flex-1 min-w-0`} />
            <select aria-label="Filtrar por cliente" value={cliente} onChange={(e) => { setCliente(e.target.value); setPagina(1); }} className={filtro}><option value="">Todos os clientes</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
            <select aria-label="Filtrar por tipo" value={tipo} onChange={(e) => { setTipo(e.target.value); setPagina(1); }} className={filtro}><option value="">Todos os tipos</option><option value="recebimento">Recebimento</option><option value="pagamento">Pagamento</option></select>
          </div>
          {lista.tipo === 'carregando' && <div role="status" aria-label="Carregando recibos" className="h-56 rounded-xl bg-gray-50 animate-pulse" />}
          {lista.tipo === 'ok' && (linhas.length === 0 ? (
            <div className="text-center py-12">
              <p className="font-semibold text-gray-900">{filtrando ? 'Nenhum recibo com esses filtros.' : `Nenhum recibo em: ${ROTULO_PERIODO[periodo].toLowerCase()}.`}</p>
              {!filtrando && podeOperar && <button type="button" className={`${classeBotaoPrimario} mt-4`} onClick={() => setNovo(true)}><Plus className="w-4 h-4" aria-hidden="true" />Emitir recibo</button>}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-3 sm:mx-0">
                <table className="w-full text-sm min-w-[52rem]">
                  <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">{['Nº recibo', 'Data', 'Cliente / fornecedor', 'Descrição', 'Valor', 'Tipo', 'Situação'].map((h) => <th key={h} className="py-2 px-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {linhas.map((x) => (
                      <tr key={x.id} onClick={() => setSelecionado(x.id)} data-testid={`recibo-${x.numero}`} className={`border-b border-gray-50 cursor-pointer ${selecionado === x.id ? 'bg-orange-50/60' : 'hover:bg-gray-50'}`}>
                        <td className="py-2.5 px-2"><button type="button" onClick={() => setSelecionado(x.id)} className="font-semibold text-orange-700 hover:underline">#{numeroRecibo(x.numero)}</button></td>
                        <td className="py-2.5 px-2 whitespace-nowrap">{formatarData(x.data_pagamento)}</td>
                        <td className="py-2.5 px-2 max-w-[11rem] truncate">{x.pessoa_nome}</td>
                        <td className="py-2.5 px-2 max-w-[12rem] truncate">{x.descricao}{x.parcial && <span className="ml-1 text-xs text-amber-700">(parcial)</span>}</td>
                        <td className="py-2.5 px-2 whitespace-nowrap font-semibold">{formatarMoeda(x.valor)}</td>
                        <td className="py-2.5 px-2"><Selo tipo={TIPO_RECIBO[x.tipo].selo} texto={TIPO_RECIBO[x.tipo].rotulo} /></td>
                        <td className="py-2.5 px-2"><span className="flex flex-col items-start gap-1"><Selo tipo={x.situacao === 'emitido' ? 'sucesso' : 'perigo'} texto={x.situacao === 'emitido' ? 'Emitido' : 'Cancelado'} />
                          {x.situacao === 'emitido' && !x.conciliado && <span className="text-[11px] text-amber-700 font-semibold">Não conciliado</span>}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginacao pagina={pagina} aoMudarPagina={setPagina} porPagina={porPagina} aoMudarPorPagina={(n) => { setPorPagina(n); setPagina(1); }} total={lista.total} />
            </>
          ))}
        </section>
        <PainelRecibo id={selecionado} versao={versao} podeOperar={podeOperar} aoConciliar={setConciliar} aoCancelar={setCancelar} aoAviso={setAviso} />
      </div>

      <ModalNovoRecibo aberto={novo} aoFechar={() => { setNovo(false); if (lancInicial) { setLancInicial(null); window.history.replaceState(null, '', '/app/recibos'); } }} idEmpresa={empresa.id} idLancamentoInicial={lancInicial} aoConcluir={alterado} />
      <ModalConciliar recibo={conciliar} idEmpresa={empresa.id} aoFechar={() => setConciliar(null)} aoConcluir={(m) => alterado(m)} />
      <ModalCancelarRecibo recibo={cancelar} aoFechar={() => setCancelar(null)} aoConcluir={(m) => alterado(m)} />
    </div>
  );
}

interface Hist { acao: string; dados: Record<string, unknown> | null; criado_em: string }
const ROTULO_HIST: Record<string, string> = { emitido: 'Recibo emitido', conciliado: 'Vinculado ao Financeiro', segunda_via: 'Segunda via gerada', download: 'PDF gerado', compartilhado: 'Compartilhado', cancelado: 'Recibo cancelado' };
const COLUNAS = 'id, numero, tipo, situacao, origem, conciliado, pessoa_nome, pessoa_documento, descricao, valor, valor_extenso, data_pagamento, forma_pagamento, parcial, valor_total_operacao, id_cliente, emitido_em, emitente_nome, emitente_documento, emitente_cidade, emitente_contato, observacoes, motivo_cancelamento, cancelado_em, id_lancamento, id_venda, id_compra';

function PainelRecibo({ id, versao, podeOperar, aoConciliar, aoCancelar, aoAviso }: {
  id: string | null; versao: number; podeOperar: boolean; aoConciliar: (r: { id: string; numero: number; valor: number }) => void; aoCancelar: (r: { id: string; numero: number }) => void; aoAviso: (m: string) => void;
}) {
  const [r, setR] = useState<Recibo | null | 'erro'>(null);
  const [hist, setHist] = useState<Hist[] | null>(null);
  const [podeCompartilhar, setPodeCompartilhar] = useState(false);
  const [versaoLocal, setVersaoLocal] = useState(0);
  useEffect(() => { setPodeCompartilhar(typeof navigator !== 'undefined' && typeof navigator.share === 'function'); }, []);
  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    setR(null); setHist(null);
    supabase.from('recibos').select(COLUNAS).eq('id', id).maybeSingle().then(({ data, error }) => setR(error || !data ? 'erro' : (data as unknown as Recibo)));
    supabase.from('historico_recibos').select('acao, dados, criado_em').eq('id_recibo', id).order('criado_em', { ascending: false }).limit(50).then(({ data }) => setHist((data ?? []) as Hist[]));
  }, [id, versao, versaoLocal]);

  const caixa = 'bg-white rounded-2xl border border-gray-200 shadow-sm p-4 self-start min-w-0';
  if (!id) return <aside aria-label="Visualizar recibo" className={`${caixa} text-sm text-gray-500`}>Selecione um recibo.</aside>;
  if (r === null) return <aside aria-label="Visualizar recibo" className={caixa}><div role="status" aria-label="Carregando recibo" className="h-72 rounded-xl bg-gray-50 animate-pulse" /></aside>;
  if (r === 'erro') return <aside aria-label="Visualizar recibo" role="alert" className={`${caixa} text-sm text-red-700`}>Não foi possível carregar o recibo.</aside>;

  const registrar = (acao: 'segunda_via' | 'download' | 'compartilhado') => {
    createClient().rpc('registrar_evento_recibo', { p_id_recibo: r.id, p_acao: acao }).then(() => setVersaoLocal((v) => v + 1));
  };
  const imprimir = (segundaVia: boolean) => {
    const janela = window.open('', '_blank'); // aberta no clique (evita bloqueio de pop-up)
    if (!janela) return aoAviso('Permita pop-ups para gerar o PDF.');
    janela.document.open(); janela.document.write(htmlRecibo(r, segundaVia)); janela.document.close();
    registrar(segundaVia ? 'segunda_via' : 'download');
  };
  const texto = mensagemCompartilhar(r);
  const compartilhar = async () => {
    try { await navigator.share({ title: `Recibo nº ${numeroRecibo(r.numero)}`, text: texto }); registrar('compartilhado'); } catch { /* cancelado pelo usuário */ }
  };
  const cancelado = r.situacao === 'cancelado';
  return (
    <aside aria-label="Visualizar recibo" className={`${caixa} space-y-3`}>
      <div className={`rounded-xl border p-4 space-y-3 relative overflow-hidden ${cancelado ? 'border-red-200' : 'border-gray-200'}`} data-testid="documento-recibo">
        {cancelado && <span className="absolute right-3 top-3 px-2 py-0.5 rounded bg-red-600 text-white text-xs font-bold">CANCELADO</span>}
        <div className="flex justify-between gap-2 border-b border-orange-500 pb-2">
          <div className="min-w-0"><p className="font-black text-orange-600 text-sm break-words">{r.emitente_nome}</p>{r.emitente_documento && <p className="text-xs text-gray-500">CNPJ {mascaraDocumentoLivre(r.emitente_documento)}</p>}</div>
          <div className="text-right shrink-0"><p className="font-black text-gray-900 text-sm">{TIPO_RECIBO[r.tipo].titulo}</p><p className="text-xs text-gray-500">Nº {numeroRecibo(r.numero)}</p></div>
        </div>
        <div className="text-sm"><p className="text-[11px] font-semibold text-gray-500">{r.tipo === 'recebimento' ? 'PAGADOR' : 'BENEFICIÁRIO'}</p><p className="font-semibold text-gray-900">{r.pessoa_nome}</p>
          {r.pessoa_documento && <p className="text-xs text-gray-600">{r.pessoa_documento.length === 14 ? 'CNPJ' : 'CPF'}: {mascaraDocumentoLivre(r.pessoa_documento)}</p>}</div>
        <div className="rounded-lg bg-gray-50 p-3 text-center"><p className="text-[11px] font-semibold text-gray-500">{r.tipo === 'recebimento' ? 'VALOR RECEBIDO' : 'VALOR PAGO'}</p>
          <p className="text-2xl font-black text-gray-900" data-testid="valor-recibo">{formatarMoeda(r.valor)}</p><p className="text-xs text-gray-600" data-testid="extenso-recibo">{r.valor_extenso}</p></div>
        {r.parcial && <p className="text-xs font-semibold rounded bg-amber-50 border border-amber-200 text-amber-900 px-2 py-1">Pagamento parcial{r.valor_total_operacao ? ` de ${formatarMoeda(r.valor_total_operacao)}` : ''}: sem quitação integral.</p>}
        <p className="text-xs text-gray-700">Forma: {FORMAS_RECIBO[r.forma_pagamento]} · Data do pagamento: {formatarData(r.data_pagamento)}</p>
        <p className="text-xs text-gray-700">{declaracao(r)}</p>
        <p className="text-[11px] text-gray-500">{r.origem === 'manual' ? (r.conciliado ? 'Recibo manual vinculado ao Financeiro.' : 'Recibo manual: ainda não conciliado com o Financeiro.') : 'Vinculado a um pagamento confirmado no Financeiro.'}{r.tipo === 'pagamento' ? ' Não substitui o recibo de quitação de quem recebeu.' : ''}</p>
        {cancelado && r.motivo_cancelamento && <p className="text-xs text-red-700">Cancelado: {r.motivo_cancelamento}</p>}
      </div>
      <div className="grid gap-2">
        <button type="button" onClick={() => imprimir(false)} className={classeBotaoPrimario}><Printer className="w-4 h-4" aria-hidden="true" />Baixar PDF / imprimir</button>
        <div className="grid grid-cols-2 gap-2">
          <a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer" onClick={() => registrar('compartilhado')} className={`${classeBotaoSecundario} !px-2`}><MessageCircle className="w-4 h-4 text-green-600" aria-hidden="true" />WhatsApp</a>
          <a href={`mailto:?subject=${encodeURIComponent(`Recibo nº ${numeroRecibo(r.numero)} — ${r.emitente_nome}`)}&body=${encodeURIComponent(texto)}`} onClick={() => registrar('compartilhado')} className={`${classeBotaoSecundario} !px-2`}><Mail className="w-4 h-4" aria-hidden="true" />E-mail</a>
          <button type="button" onClick={() => imprimir(true)} className={`${classeBotaoSecundario} !px-2`}><Copy className="w-4 h-4" aria-hidden="true" />Segunda via</button>
          {podeCompartilhar && <button type="button" onClick={compartilhar} className={`${classeBotaoSecundario} !px-2`}><Share2 className="w-4 h-4" aria-hidden="true" />Compartilhar</button>}
        </div>
        <p className="text-[11px] text-gray-500">WhatsApp e e-mail abrem com a mensagem pronta (sem CPF/CNPJ); o envio é feito por você. Anexe o PDF se quiser.</p>
        {podeOperar && !cancelado && r.origem === 'manual' && !r.conciliado && <button type="button" onClick={() => aoConciliar({ id: r.id, numero: r.numero, valor: Number(r.valor) })} className={classeBotaoSecundario}><Link2 className="w-4 h-4" aria-hidden="true" />Vincular a recebimento</button>}
        {podeOperar && !cancelado && <button type="button" onClick={() => aoCancelar({ id: r.id, numero: r.numero })} className={`${classeBotaoSecundario} !border-red-300 !text-red-700`}><Ban className="w-4 h-4" aria-hidden="true" />Cancelar recibo</button>}
      </div>
      <div>
        <h2 className="text-sm font-bold text-gray-900 mb-1">Histórico</h2>
        {hist === null ? <div role="status" aria-label="Carregando histórico" className="h-12 rounded-lg bg-gray-50 animate-pulse" /> : (
          <ul className="text-sm space-y-1" data-testid="historico-recibo">
            {hist.map((h, i) => <li key={i}><span className="font-medium text-gray-900">{ROTULO_HIST[h.acao] ?? h.acao}</span>
              <span className="block text-xs text-gray-500">{new Date(h.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}{h.dados?.motivo ? ` · ${h.dados.motivo}` : ''}</span></li>)}
          </ul>
        )}
      </div>
    </aside>
  );
}
