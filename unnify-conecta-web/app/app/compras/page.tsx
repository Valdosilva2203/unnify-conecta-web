'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Ban, Building2, CircleDollarSign, HandCoins, PackageCheck, Pencil, Plus, RefreshCw, RotateCcw, ShoppingCart, Truck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarData, formatarMoeda, hojeBrasil, valorParaMascara, type ContaFinanceira } from '@/lib/financeiro';
import { recursoAusente } from '@/lib/erros-banco';
import { variacao } from '@/lib/relatorios';
import { mascaraDocumento, mascaraTelefone } from '@/lib/clientes';
import { FORMAS_PAGAMENTO, formatarQuantidade, periodoVendas } from '@/lib/estoque-vendas';
import { SITUACAO_COMPRA, nomeFornecedor, type CompraLinha, type Fornecedor, type FornecedorCompleto, type ResumoCompras, type SituacaoCompra } from '@/lib/compras';
import { Paginacao, Selo } from '@/components/admin/tabela';
import { Indicador } from '@/components/financeiro/Indicador';
import { classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { ModalFornecedor, ModalMotivo, ModalNovaCompra, ModalPagarCompra, ModalReceberCompra, type ItemParaReceber, type RascunhoCompra } from '@/components/compras/Modais';
import { CabecalhoModulo, classePilula } from '@/components/navegacao/NavegacaoModulos';

type Lista<T> = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string; ausente: boolean } | { tipo: 'ok'; linhas: T[]; total: number };
type Periodo = 'mes' | 'anterior' | '90' | 'ano';
const filtro = 'min-h-11 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500';
const ROTULO_PERIODO: Record<Periodo, string> = { mes: 'Este mês', anterior: 'Mês anterior', '90': 'Últimos 90 dias', ano: 'Este ano' };
const numero = (n: number) => `#${String(n).padStart(6, '0')}`;
type Motivo = { tipo: 'cancelar' | 'estornar'; id: string; titulo: string; bloqueio?: string | null; aviso: string };

export default function ComprasPage() {
  const { empresa } = useEmpresaAtual();
  const [hoje, setHoje] = useState<string | null>(null);
  useEffect(() => setHoje(hojeBrasil()), []); // data de Brasília lida só no navegador
  const [aba, setAba] = useState<'compras' | 'fornecedores'>('compras');
  const [podeOperar, setPodeOperar] = useState(false);
  const [contas, setContas] = useState<ContaFinanceira[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [modalForn, setModalForn] = useState<{ f: FornecedorCompleto | null } | null>(null);

  useEffect(() => {
    if (!empresa) return;
    const supabase = createClient();
    supabase.rpc('pode_operar_comercial', { p_id_empresa: empresa.id }).then(({ data }) => setPodeOperar(!!data));
    supabase.from('contas_financeiras_saldo').select('id, nome, instituicao, tipo, saldo_inicial, data_saldo_inicial, principal, permite_saldo_negativo, arquivada_em, saldo, cor').eq('id_empresa', empresa.id).order('nome')
      .then(({ data }) => setContas((data ?? []) as ContaFinanceira[]));
  }, [empresa, versao]);

  if (!empresa || !hoje) return null;
  const alterado = (m: string) => { setAviso(m); setModalForn(null); setVersao((v) => v + 1); };

  return (
    <div className="space-y-5 min-w-0">
      <CabecalhoModulo icone={ShoppingCart} titulo="Compras" descricao="Gerencie suas compras, fornecedores e recebimentos." />
      <div role="tablist" aria-label="Seções de compras" className="flex flex-wrap gap-2">
        {([['compras', 'Compras'], ['fornecedores', 'Fornecedores']] as const).map(([v, r]) => (
          <button key={v} type="button" role="tab" aria-selected={aba === v} onClick={() => setAba(v)}
            className={classePilula(aba === v)}>{r}</button>
        ))}
      </div>
      {aviso && <div role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex justify-between gap-3"><span>{aviso}</span><button type="button" className="underline" onClick={() => setAviso(null)}>Fechar</button></div>}
      {aba === 'compras'
        ? <AbaCompras idEmpresa={empresa.id} hoje={hoje} podeOperar={podeOperar} contas={contas} versao={versao} aoAlterar={alterado} />
        : <AbaFornecedores idEmpresa={empresa.id} podeOperar={podeOperar} versao={versao} aoEditar={(f) => setModalForn({ f })} aoNovo={() => setModalForn({ f: null })} />}
      <ModalFornecedor aberto={!!modalForn} aoFechar={() => setModalForn(null)} idEmpresa={empresa.id} fornecedor={modalForn?.f ?? null} aoSalvar={(m) => alterado(m)} />
    </div>
  );
}

function Erros({ lista, testid, aoTentar }: { lista: Lista<unknown>; testid: string; aoTentar: () => void }) {
  if (lista.tipo !== 'erro') return null;
  return lista.ausente
    ? <p role="status" data-testid={testid} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{lista.mensagem}</p>
    : <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex flex-wrap justify-between gap-3">{lista.mensagem}
        <button type="button" onClick={aoTentar} className="min-h-11 px-3 inline-flex items-center gap-1 font-semibold hover:underline"><RefreshCw className="w-4 h-4" aria-hidden="true" />Tentar novamente</button></div>;
}

// ================= Compras =================
function AbaCompras({ idEmpresa, hoje, podeOperar, contas, versao: versaoExt, aoAlterar }: {
  idEmpresa: string; hoje: string; podeOperar: boolean; contas: ContaFinanceira[]; versao: number; aoAlterar: (m: string) => void;
}) {
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [resumo, setResumo] = useState<ResumoCompras | null | 'erro'>(null);
  const [lista, setLista] = useState<Lista<CompraLinha>>({ tipo: 'carregando' });
  const [situacao, setSituacao] = useState<'' | SituacaoCompra>('');
  const [busca, setBusca] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([]);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [nova, setNova] = useState<{ r: RascunhoCompra | null } | null>(null);
  const [receber, setReceber] = useState<{ compra: { id: string; numero: number; data_compra: string }; itens: ItemParaReceber[] } | null>(null);
  const [pagar, setPagar] = useState<{ id: string; descricao: string; valor: number; data_vencimento: string | null } | null>(null);
  const [motivo, setMotivo] = useState<Motivo | null>(null);
  const [versao, setVersao] = useState(0);
  const req = useRef(0);
  const { inicio, fim } = periodoVendas(periodo, hoje);

  const carregar = useCallback(() => {
    const atual = ++req.current;
    setLista((l) => (l.tipo === 'ok' ? l : { tipo: 'carregando' }));
    createClient().rpc('buscar_compras', { p_id_empresa: idEmpresa, p_busca: busca.trim() || null, p_situacao: situacao || null, p_id_fornecedor: fornecedor || null, p_inicio: inicio, p_fim: fim, p_limite: porPagina, p_deslocamento: (pagina - 1) * porPagina })
      .then(({ data, error }) => {
        if (atual !== req.current) return;
        if (error) return setLista({ tipo: 'erro', mensagem: mensagemDeErro(error, 'Não foi possível carregar as compras.'), ausente: recursoAusente(error) });
        const linhas = (data ?? []) as CompraLinha[];
        setLista({ tipo: 'ok', linhas, total: Number(linhas[0]?.total_linhas ?? 0) });
        setSelecionado((s) => (s && linhas.some((l) => l.id === s) ? s : linhas[0]?.id ?? null));
      });
  }, [idEmpresa, busca, situacao, fornecedor, inicio, fim, pagina, porPagina]);
  useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t); }, [carregar, versao, versaoExt]);
  useEffect(() => {
    const supabase = createClient();
    supabase.rpc('resumo_compras', { p_id_empresa: idEmpresa, p_inicio: inicio, p_fim: fim }).then(({ data, error }) => setResumo(error ? 'erro' : (data as ResumoCompras)));
    supabase.from('fornecedores').select('id, nome, nome_fantasia').eq('id_empresa', idEmpresa).order('nome').limit(1000)
      .then(({ data }) => setFornecedores((data ?? []).map((x) => ({ id: x.id as string, nome: nomeFornecedor(x as { nome: string; nome_fantasia: string | null }) }))));
  }, [idEmpresa, inicio, fim, versao, versaoExt]);

  const alterado = (m: string, id?: string) => { setNova(null); setReceber(null); setPagar(null); setMotivo(null); if (id) setSelecionado(id); setVersao((v) => v + 1); aoAlterar(m); };
  const r = resumo && resumo !== 'erro' ? resumo : null;
  const card = (v: string | undefined) => (r ? v ?? '—' : resumo === 'erro' ? 'Indisponível' : '…');
  const vari = r ? variacao(r.comprado, r.comprado_anterior) : null;
  const linhas = lista.tipo === 'ok' ? lista.linhas : [];
  const filtrando = !!(busca || situacao || fornecedor);
  const linhaSel = linhas.find((l) => l.id === selecionado) ?? null;

  return (
    <>
      <div className="flex flex-col min-[420px]:flex-row gap-2 sm:justify-end">
        <select aria-label="Período" value={periodo} onChange={(e) => { setPeriodo(e.target.value as Periodo); setPagina(1); }} className={filtro}>{Object.entries(ROTULO_PERIODO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        {podeOperar && <button type="button" className={`${classeBotaoPrimario} whitespace-nowrap`} onClick={() => setNova({ r: null })}><Plus className="w-4 h-4" aria-hidden="true" />Nova compra</button>}
      </div>
      <Erros lista={lista} testid="compras-indisponivel" aoTentar={() => setVersao((v) => v + 1)} />
      <div className="grid gap-3 sm:gap-4 grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Compras do período" valor={card(r ? formatarMoeda(r.comprado) : undefined)} icone={ShoppingCart} cor="bg-green-100 text-green-600"
          detalhe={r ? (vari === null ? `${r.quantidade} compras · sem base anterior` : `${r.quantidade} compras · ${vari > 0 ? '+' : ''}${String(vari).replace('.', ',')}% vs. período anterior`) : undefined} />
        <Indicador titulo="A pagar" valor={card(r ? formatarMoeda(r.a_pagar) : undefined)} icone={CircleDollarSign} cor="bg-blue-100 text-blue-600" detalhe={r ? (r.a_pagar_vencido ? `${formatarMoeda(r.a_pagar_vencido)} vencido` : `Pago no período: ${formatarMoeda(r.pago)}`) : undefined} />
        <Indicador titulo="Aguardando entrega" valor={card(r ? String(r.aguardando_entrega) : undefined)} icone={Truck} cor="bg-orange-100 text-orange-600" detalhe="Compras com itens pendentes" />
        <Indicador titulo="Recebidas" valor={card(r ? String(r.recebidas) : undefined)} icone={PackageCheck} cor="bg-purple-100 text-purple-600" detalhe="Completas no período" />
      </div>
      <p className="text-xs text-gray-500 -mt-2">Comprado = compras registradas de {formatarData(inicio)} a {formatarData(fim)}. Registrar ou receber não é pagar: o pagamento é lançado à parte.</p>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <section aria-label="Lista de compras" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 sm:p-4 min-w-0 space-y-3">
          <div role="tablist" aria-label="Situação da compra" className="flex flex-wrap gap-1">
            {([['', 'Todas'], ['rascunho', 'Rascunho'], ['solicitada', 'Solicitadas'], ['parcialmente_recebida', 'Parcialmente recebidas'], ['recebida', 'Recebidas'], ['cancelada', 'Canceladas']] as const).map(([v, rot]) => (
              <button key={v} type="button" role="tab" aria-selected={situacao === v} onClick={() => { setSituacao(v); setPagina(1); }}
                className={classePilula(situacao === v)}>{rot}</button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="search" aria-label="Buscar compras" placeholder="Buscar por número, fornecedor ou produto..." value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} className={`${filtro} flex-1 min-w-0`} />
            <select aria-label="Filtrar por fornecedor" value={fornecedor} onChange={(e) => { setFornecedor(e.target.value); setPagina(1); }} className={filtro}><option value="">Todos os fornecedores</option>{fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
          </div>
          {lista.tipo === 'carregando' && <div role="status" aria-label="Carregando compras" className="h-56 rounded-xl bg-gray-50 animate-pulse" />}
          {lista.tipo === 'ok' && (linhas.length === 0 ? (
            <div className="text-center py-12">
              <p className="font-semibold text-gray-900">{filtrando ? 'Nenhuma compra com esses filtros.' : `Nenhuma compra em: ${ROTULO_PERIODO[periodo].toLowerCase()}.`}</p>
              {!filtrando && podeOperar && <button type="button" className={`${classeBotaoPrimario} mt-4`} onClick={() => setNova({ r: null })}><Plus className="w-4 h-4" aria-hidden="true" />Registrar compra</button>}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-3 sm:mx-0">
                <table className="w-full text-sm min-w-[50rem]">
                  <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">{['Nº compra', 'Data', 'Fornecedor', 'Itens', 'Valor total', 'Pago', 'Situação'].map((h) => <th key={h} className="py-2 px-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {linhas.map((c) => (
                      <tr key={c.id} onClick={() => setSelecionado(c.id)} data-testid={`compra-${c.numero}`} className={`border-b border-gray-50 cursor-pointer ${selecionado === c.id ? 'bg-orange-50/60' : 'hover:bg-gray-50'}`}>
                        <td className="py-2.5 px-2"><button type="button" onClick={() => setSelecionado(c.id)} className="font-semibold text-orange-700 hover:underline">{numero(c.numero)}</button></td>
                        <td className="py-2.5 px-2 whitespace-nowrap">{formatarData(c.data_compra)}</td>
                        <td className="py-2.5 px-2 max-w-[12rem] truncate">{c.fornecedor ?? <span className="text-gray-400">Sem fornecedor</span>}</td>
                        <td className="py-2.5 px-2">{c.itens}</td>
                        <td className="py-2.5 px-2 whitespace-nowrap font-semibold">{formatarMoeda(c.total)}</td>
                        <td className="py-2.5 px-2 whitespace-nowrap">{c.situacao === 'rascunho' || c.situacao === 'cancelada' ? '—' : formatarMoeda(c.pago)}</td>
                        <td className="py-2.5 px-2"><Selo tipo={SITUACAO_COMPRA[c.situacao].selo} texto={SITUACAO_COMPRA[c.situacao].rotulo} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginacao pagina={pagina} aoMudarPagina={setPagina} porPagina={porPagina} aoMudarPorPagina={(n) => { setPorPagina(n); setPagina(1); }} total={lista.total} />
            </>
          ))}
        </section>
        <PainelCompra linha={linhaSel} versao={versao + versaoExt} podeOperar={podeOperar}
          aoContinuar={(rc) => setNova({ r: rc })} aoReceber={(compra, itens) => setReceber({ compra, itens })} aoPagar={setPagar} aoMotivo={setMotivo} />
      </div>

      <ModalNovaCompra aberto={!!nova} aoFechar={() => setNova(null)} idEmpresa={idEmpresa} contas={contas} rascunho={nova?.r ?? null} aoConcluir={alterado} />
      <ModalReceberCompra compra={receber?.compra ?? null} itens={receber?.itens ?? []} aoFechar={() => setReceber(null)} aoConcluir={(m) => alterado(m)} />
      <ModalPagarCompra conta={pagar} idEmpresa={idEmpresa} contas={contas} aoFechar={() => setPagar(null)} aoConcluir={(m) => alterado(m)} />
      <ModalMotivo alvo={motivo} aoFechar={() => setMotivo(null)} aoConcluir={(m) => alterado(m)} />
    </>
  );
}

interface Detalhe {
  id: string; numero: number; status: string; condicao: 'a_vista' | 'a_prazo'; forma_pagamento: keyof typeof FORMAS_PAGAMENTO; parcelas: number; primeiro_vencimento: string | null;
  previsao_entrega: string | null; subtotal: number; desconto: number; frete: number; total: number; data_compra: string; observacoes: string | null; id_fornecedor: string | null;
  motivo_cancelamento: string | null; criado_em: string; fornecedores: { nome: string; nome_fantasia: string | null } | null;
  itens_compra: { id: string; id_produto: string; tipo: 'produto' | 'servico'; descricao: string; quantidade: number; quantidade_recebida: number; preco_unitario: number; desconto: number; total: number; produtos: { unidade: string; estoque_atual: number } | null }[];
}
interface Lanc { id: string; descricao: string; valor: number; status: string; data_vencimento: string | null; data_pagamento: string | null }
interface Rec { id: string; data_recebimento: string; observacoes: string | null; estornado_em: string | null; motivo_estorno: string | null; itens_recebimento_compra: { quantidade: number; itens_compra: { descricao: string } | null }[] }
interface Hist { acao: string; dados: Record<string, unknown> | null; criado_em: string }
const ROTULO_HIST: Record<string, string> = { rascunho: 'Rascunho salvo', confirmada: 'Compra registrada', recebimento: 'Itens recebidos', recebimento_estornado: 'Recebimento estornado', pagamento: 'Pagamento registrado', cancelada: 'Compra cancelada' };

function PainelCompra({ linha, versao, podeOperar, aoContinuar, aoReceber, aoPagar, aoMotivo }: {
  linha: CompraLinha | null; versao: number; podeOperar: boolean; aoContinuar: (r: RascunhoCompra) => void;
  aoReceber: (c: { id: string; numero: number; data_compra: string }, itens: ItemParaReceber[]) => void;
  aoPagar: (l: { id: string; descricao: string; valor: number; data_vencimento: string | null }) => void; aoMotivo: (m: Motivo) => void;
}) {
  const [d, setD] = useState<Detalhe | null | 'erro'>(null);
  const [lancs, setLancs] = useState<Lanc[] | null>(null);
  const [recs, setRecs] = useState<Rec[] | null>(null);
  const [hist, setHist] = useState<Hist[] | null>(null);
  const [aba, setAba] = useState<'geral' | 'recebimentos' | 'pagamentos' | 'historico'>('geral');
  const id = linha?.id ?? null;

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    setD(null); setLancs(null); setRecs(null); setHist(null);
    supabase.from('compras').select('id, numero, status, condicao, forma_pagamento, parcelas, primeiro_vencimento, previsao_entrega, subtotal, desconto, frete, total, data_compra, observacoes, id_fornecedor, motivo_cancelamento, criado_em, fornecedores(nome, nome_fantasia), itens_compra(id, id_produto, tipo, descricao, quantidade, quantidade_recebida, preco_unitario, desconto, total, produtos(unidade, estoque_atual))')
      .eq('id', id).maybeSingle().then(({ data, error }) => setD(error || !data ? 'erro' : (data as unknown as Detalhe)));
    supabase.from('lancamentos_financeiros').select('id, descricao, valor, status, data_vencimento, data_pagamento').eq('id_compra', id).is('excluido_em', null).order('data_vencimento').then(({ data }) => setLancs((data ?? []) as Lanc[]));
    supabase.from('recebimentos_compra').select('id, data_recebimento, observacoes, estornado_em, motivo_estorno, itens_recebimento_compra(quantidade, itens_compra(descricao))').eq('id_compra', id).order('criado_em', { ascending: false }).then(({ data }) => setRecs((data ?? []) as unknown as Rec[]));
    supabase.from('historico_compras').select('acao, dados, criado_em').eq('id_compra', id).order('criado_em', { ascending: false }).limit(50).then(({ data }) => setHist((data ?? []) as Hist[]));
  }, [id, versao]);

  const caixa = 'bg-white rounded-2xl border border-gray-200 shadow-sm p-4 self-start min-w-0';
  if (!linha) return <aside aria-label="Detalhes da compra" className={`${caixa} text-sm text-gray-500`}>Selecione uma compra.</aside>;
  if (d === null) return <aside aria-label="Detalhes da compra" className={caixa}><div role="status" aria-label="Carregando compra" className="h-64 rounded-xl bg-gray-50 animate-pulse" /></aside>;
  if (d === 'erro') return <aside aria-label="Detalhes da compra" role="alert" className={`${caixa} text-sm text-red-700`}>Não foi possível carregar a compra.</aside>;

  const qTotal = d.itens_compra.reduce((s, i) => s + Number(i.quantidade), 0);
  const qRec = d.itens_compra.reduce((s, i) => s + Number(i.quantidade_recebida), 0);
  const pct = qTotal ? Math.round((qRec / qTotal) * 100) : 0;
  const pendentes = (lancs ?? []).filter((l) => l.status === 'pendente');
  const forn = d.fornecedores ? nomeFornecedor(d.fornecedores) : null;
  const itensReceber: ItemParaReceber[] = d.itens_compra.map((i) => ({ id: i.id, descricao: i.descricao, tipo: i.tipo, unidade: i.produtos?.unidade ?? 'un', quantidade: Number(i.quantidade), quantidade_recebida: Number(i.quantidade_recebida) }));
  const continuar = () => aoContinuar({
    id: d.id, id_fornecedor: d.id_fornecedor, condicao: d.condicao, forma_pagamento: d.forma_pagamento, parcelas: d.parcelas, primeiro_vencimento: d.primeiro_vencimento, previsao_entrega: d.previsao_entrega,
    desconto: Number(d.desconto), frete: Number(d.frete), observacoes: d.observacoes,
    itens: d.itens_compra.map((i) => ({ id_produto: i.id_produto, tipo: i.tipo, nome: i.descricao, unidade: i.produtos?.unidade ?? 'un', disponivel: Number(i.produtos?.estoque_atual ?? 0),
      quantidade: String(i.quantidade).replace('.', ','), preco: valorParaMascara(i.preco_unitario), desconto: Number(i.desconto) ? valorParaMascara(i.desconto) : '' })),
  });
  const cancelar = () => aoMotivo({
    tipo: 'cancelar', id: d.id, titulo: `${linha.situacao === 'rascunho' ? 'Descartar rascunho' : 'Cancelar compra'} ${numero(d.numero)}`,
    bloqueio: qRec > 0 ? 'Há itens recebidos nesta compra. Estorne os recebimentos (aba Recebimentos) antes de cancelar.' : linha.pago > 0 ? `Esta compra tem ${formatarMoeda(linha.pago)} pago. Estorne o pagamento no Financeiro (ou registre a devolução) antes de cancelar.` : null,
    aviso: linha.situacao === 'rascunho' ? 'O rascunho será descartado.' : 'As contas a pagar pendentes desta compra serão canceladas. Nada é apagado do histórico.',
  });

  return (
    <aside aria-label="Detalhes da compra" className={`${caixa} space-y-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="text-lg font-black text-gray-900">Compra {numero(d.numero)}</p>
          <p className="text-xs text-gray-500">Realizada em {formatarData(d.data_compra)}{d.previsao_entrega ? ` · entrega prevista ${formatarData(d.previsao_entrega)}` : ''}</p></div>
        <Selo tipo={SITUACAO_COMPRA[linha.situacao].selo} texto={SITUACAO_COMPRA[linha.situacao].rotulo} />
      </div>
      <div role="tablist" aria-label="Detalhes" className="grid grid-cols-4 gap-1">
        {([['geral', 'Visão geral'], ['recebimentos', 'Recebimentos'], ['pagamentos', 'Pagamentos'], ['historico', 'Histórico']] as const).map(([a, r]) => (
          <button key={a} type="button" role="tab" aria-selected={aba === a} onClick={() => setAba(a)} className={`min-h-11 rounded-lg text-[11px] sm:text-xs font-semibold px-1 ${aba === a ? 'bg-orange-600 text-white' : 'bg-gray-50 text-gray-700'}`}>{r}</button>
        ))}
      </div>
      {aba === 'geral' && (
        <>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-gray-100 p-2.5"><dt className="text-xs text-gray-500">Fornecedor</dt><dd className="font-semibold text-gray-900 break-words">{forn ?? 'Sem fornecedor'}</dd></div>
            <div className="rounded-xl border border-gray-100 p-2.5"><dt className="text-xs text-gray-500">Condição</dt><dd className="font-semibold text-gray-900">{d.condicao === 'a_vista' ? 'À vista' : `${d.parcelas}x a prazo`} · {FORMAS_PAGAMENTO[d.forma_pagamento]}</dd></div>
          </dl>
          <ul className="divide-y divide-gray-100 text-sm border-y border-gray-100" data-testid="itens-compra">
            {d.itens_compra.map((i) => (
              <li key={i.id} className="py-2 flex gap-2">
                <span className="flex-1 min-w-0"><span className="block font-medium text-gray-900 break-words">{i.descricao}</span>
                  <span className="block text-xs text-gray-500">{formatarQuantidade(i.quantidade)} {i.produtos?.unidade ?? ''} × {formatarMoeda(i.preco_unitario)}{Number(i.desconto) ? ` − ${formatarMoeda(i.desconto)}` : ''} · recebido {formatarQuantidade(i.quantidade_recebida)}{i.tipo === 'servico' ? ' · serviço' : ''}</span></span>
                <span className="font-semibold whitespace-nowrap">{formatarMoeda(i.total)}</span>
              </li>
            ))}
          </ul>
          {d.status === 'confirmada' && (
            <div>
              <div className="flex justify-between text-xs text-gray-600 mb-1"><span className="font-semibold text-gray-900">Recebimento</span><span data-testid="progresso-recebimento">{pct}% recebido</span></div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Percentual recebido"><div className="h-full bg-green-500" style={{ width: `${pct}%` }} /></div>
            </div>
          )}
          <dl className="text-sm space-y-1" data-testid="financeiro-compra">
            <div className="flex justify-between"><dt className="text-gray-500">Subtotal</dt><dd>{formatarMoeda(d.subtotal)}</dd></div>
            {Number(d.desconto) > 0 && <div className="flex justify-between"><dt className="text-gray-500">Desconto</dt><dd>− {formatarMoeda(d.desconto)}</dd></div>}
            {Number(d.frete) > 0 && <div className="flex justify-between"><dt className="text-gray-500">Frete</dt><dd>{formatarMoeda(d.frete)}</dd></div>}
            <div className="flex justify-between font-black text-base"><dt>Valor comprado</dt><dd>{formatarMoeda(d.total)}</dd></div>
            {d.status === 'confirmada' && <>
              <div className="flex justify-between"><dt className="text-gray-500">Recebido fisicamente</dt><dd>{formatarMoeda(linha.valor_recebido)}</dd></div>
              <div className="flex justify-between text-green-700"><dt>Pago</dt><dd data-testid="pago-compra">{formatarMoeda(linha.pago)}</dd></div>
              <div className="flex justify-between text-red-700"><dt>A pagar</dt><dd data-testid="a-pagar-compra">{formatarMoeda(linha.a_pagar)}</dd></div>
            </>}
          </dl>
          {d.observacoes && <p className="text-sm text-gray-700"><span className="text-gray-500">Obs.: </span>{d.observacoes}</p>}
          {d.status === 'cancelada' && d.motivo_cancelamento && <p className="text-sm rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">Motivo do cancelamento: {d.motivo_cancelamento}</p>}
        </>
      )}
      {aba === 'recebimentos' && (recs === null ? <div role="status" aria-label="Carregando recebimentos" className="h-20 rounded-lg bg-gray-50 animate-pulse" /> : recs.length === 0 ? <p className="text-sm text-gray-500">Nenhum recebimento registrado.</p> : (
        <ul className="divide-y divide-gray-100 text-sm" data-testid="recebimentos">
          {recs.map((x) => (
            <li key={x.id} className="py-2 flex gap-2">
              <span className="flex-1 min-w-0"><span className={`block font-medium ${x.estornado_em ? 'text-gray-400 line-through' : 'text-gray-900'}`}>Recebido em {formatarData(x.data_recebimento)}</span>
                <span className="block text-xs text-gray-500 break-words">{x.itens_recebimento_compra.map((i) => `${formatarQuantidade(i.quantidade)} ${i.itens_compra?.descricao ?? ''}`).join(' · ')}{x.observacoes ? ` · ${x.observacoes}` : ''}</span>
                {x.estornado_em && <span className="block text-xs text-red-700">Estornado: {x.motivo_estorno}</span>}</span>
              {podeOperar && !x.estornado_em && d.status === 'confirmada' && (
                <button type="button" onClick={() => aoMotivo({ tipo: 'estornar', id: x.id, titulo: 'Estornar recebimento', aviso: 'As quantidades deste recebimento saem do estoque e voltam a ficar pendentes na compra. O histórico é mantido.' })}
                  aria-label={`Estornar recebimento de ${formatarData(x.data_recebimento)}`} className="w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"><RotateCcw className="w-4 h-4" aria-hidden="true" /></button>
              )}
            </li>
          ))}
        </ul>
      ))}
      {aba === 'pagamentos' && (lancs === null ? <div role="status" aria-label="Carregando pagamentos" className="h-20 rounded-lg bg-gray-50 animate-pulse" /> : lancs.length === 0 ? <p className="text-sm text-gray-500">Sem contas a pagar (rascunho).</p> : (
        <div className="space-y-2">
          <ul className="divide-y divide-gray-100 text-sm" data-testid="contas-compra">
            {lancs.map((l) => (
              <li key={l.id} className="py-2 flex items-center gap-2">
                <span className="flex-1 min-w-0"><span className="block font-medium text-gray-900 truncate">{l.descricao}</span>
                  <span className="block text-xs text-gray-500">{l.status === 'pago' ? `Pago em ${formatarData(l.data_pagamento)}` : l.status === 'cancelado' ? 'Cancelado' : `Vence ${formatarData(l.data_vencimento)}`}</span></span>
                <span className="font-semibold whitespace-nowrap">{formatarMoeda(l.valor)}</span>
                {podeOperar && l.status === 'pago' && <Link href={`/app/recibos?lancamento=${l.id}`} aria-label={`Comprovante de ${l.descricao}`} className="min-h-11 px-2 inline-flex items-center text-xs font-semibold text-orange-600 hover:underline">Comprovante</Link>}
                {podeOperar && l.status === 'pendente' && d.status === 'confirmada' && <button type="button" onClick={() => aoPagar(l)} aria-label={`Pagar ${l.descricao}`} className="min-h-11 px-3 rounded-lg border border-gray-300 text-xs font-semibold hover:bg-gray-50">Pagar</button>}
              </li>
            ))}
          </ul>
          <Link href="/app/financeiro#pagar" className="inline-block text-xs font-semibold text-orange-600 hover:underline">Abrir contas a pagar</Link>
        </div>
      ))}
      {aba === 'historico' && (hist === null ? <div role="status" aria-label="Carregando histórico" className="h-16 rounded-lg bg-gray-50 animate-pulse" /> : (
        <ul className="text-sm space-y-1.5" data-testid="historico-compra">
          {hist.map((h, i) => (
            <li key={i}><span className="font-medium text-gray-900">{ROTULO_HIST[h.acao] ?? h.acao}</span>
              <span className="block text-xs text-gray-500">{new Date(h.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}
                {h.acao === 'pagamento' && h.dados?.valor ? ` · ${formatarMoeda(h.dados.valor as number)}` : ''}{h.dados?.motivo ? ` · ${h.dados.motivo}` : ''}</span></li>
          ))}
        </ul>
      ))}
      {podeOperar && (
        <div className="grid gap-2">
          {linha.situacao === 'rascunho' && <button type="button" onClick={continuar} className={classeBotaoPrimario}><Pencil className="w-4 h-4" aria-hidden="true" />Continuar rascunho</button>}
          {(linha.situacao === 'solicitada' || linha.situacao === 'parcialmente_recebida') && <button type="button" onClick={() => aoReceber({ id: d.id, numero: d.numero, data_compra: d.data_compra }, itensReceber)} className={classeBotaoPrimario}><PackageCheck className="w-4 h-4" aria-hidden="true" />Receber itens</button>}
          {d.status === 'confirmada' && pendentes.length > 0 && <button type="button" onClick={() => aoPagar(pendentes[0])} className={classeBotaoSecundario}><HandCoins className="w-4 h-4" aria-hidden="true" />Registrar pagamento</button>}
          {linha.situacao !== 'cancelada' && <button type="button" onClick={cancelar} className={classeBotaoSecundario}><Ban className="w-4 h-4" aria-hidden="true" />{linha.situacao === 'rascunho' ? 'Descartar rascunho' : 'Cancelar compra'}</button>}
        </div>
      )}
    </aside>
  );
}

// ================= Fornecedores =================
function AbaFornecedores({ idEmpresa, podeOperar, versao, aoEditar, aoNovo }: {
  idEmpresa: string; podeOperar: boolean; versao: number; aoEditar: (f: FornecedorCompleto) => void; aoNovo: () => void;
}) {
  const [lista, setLista] = useState<Lista<Fornecedor>>({ tipo: 'carregando' });
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('ativo');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [det, setDet] = useState<FornecedorCompleto | null | 'erro'>(null);
  const [tentar, setTentar] = useState(0);
  const req = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => {
      const atual = ++req.current;
      createClient().rpc('buscar_fornecedores', { p_id_empresa: idEmpresa, p_busca: busca.trim() || null, p_status: status || null, p_limite: porPagina, p_deslocamento: (pagina - 1) * porPagina })
        .then(({ data, error }) => {
          if (atual !== req.current) return;
          if (error) return setLista({ tipo: 'erro', mensagem: mensagemDeErro(error, 'Não foi possível carregar os fornecedores.'), ausente: recursoAusente(error) });
          const linhas = (data ?? []) as Fornecedor[];
          setLista({ tipo: 'ok', linhas, total: Number(linhas[0]?.total ?? 0) });
          setSelecionado((s) => (s && linhas.some((l) => l.id === s) ? s : linhas[0]?.id ?? null));
        });
    }, 250);
    return () => clearTimeout(t);
  }, [idEmpresa, busca, status, pagina, porPagina, versao, tentar]);
  useEffect(() => {
    if (!selecionado) return;
    setDet(null);
    createClient().from('fornecedores').select('id, tipo_pessoa, nome, nome_fantasia, documento, telefone, email, endereco, cidade, estado, observacoes, status').eq('id', selecionado).maybeSingle()
      .then(({ data, error }) => setDet(error || !data ? 'erro' : (data as FornecedorCompleto)));
  }, [selecionado, versao]);

  const linhas = lista.tipo === 'ok' ? lista.linhas : [];
  const sel = linhas.find((l) => l.id === selecionado);
  return (
    <>
      {podeOperar && <div className="flex sm:justify-end"><button type="button" className={`${classeBotaoPrimario} whitespace-nowrap`} onClick={aoNovo}><Plus className="w-4 h-4" aria-hidden="true" />Novo fornecedor</button></div>}
      <Erros lista={lista} testid="fornecedores-indisponivel" aoTentar={() => setTentar((v) => v + 1)} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <section aria-label="Lista de fornecedores" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 sm:p-4 min-w-0 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="search" aria-label="Buscar fornecedores" placeholder="Buscar por nome ou CPF/CNPJ..." value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} className={`${filtro} flex-1 min-w-0`} />
            <select aria-label="Filtrar fornecedores por situação" value={status} onChange={(e) => { setStatus(e.target.value); setPagina(1); }} className={filtro}><option value="ativo">Ativos</option><option value="inativo">Inativos</option><option value="">Todos</option></select>
          </div>
          {lista.tipo === 'carregando' && <div role="status" aria-label="Carregando fornecedores" className="h-40 rounded-xl bg-gray-50 animate-pulse" />}
          {lista.tipo === 'ok' && (linhas.length === 0 ? (
            <div className="text-center py-12">
              <p className="font-semibold text-gray-900">{busca || status !== 'ativo' ? 'Nenhum fornecedor com esses filtros.' : 'Nenhum fornecedor cadastrado ainda.'}</p>
              {!busca && status === 'ativo' && podeOperar && <button type="button" className={`${classeBotaoPrimario} mt-4`} onClick={aoNovo}><Plus className="w-4 h-4" aria-hidden="true" />Cadastrar fornecedor</button>}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-3 sm:mx-0">
                <table className="w-full text-sm min-w-[42rem]">
                  <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">{['Fornecedor', 'CPF/CNPJ', 'Telefone', 'Compras', 'Total comprado', 'A pagar'].map((h) => <th key={h} className="py-2 px-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {linhas.map((f) => (
                      <tr key={f.id} onClick={() => setSelecionado(f.id)} data-testid={`fornecedor-${nomeFornecedor(f)}`} className={`border-b border-gray-50 cursor-pointer ${selecionado === f.id ? 'bg-orange-50/60' : 'hover:bg-gray-50'}`}>
                        <td className="py-2.5 px-2"><button type="button" onClick={() => setSelecionado(f.id)} className="text-left"><span className="block font-semibold text-gray-900">{nomeFornecedor(f)}</span>{f.status === 'inativo' && <span className="text-xs text-gray-500">Inativo</span>}</button></td>
                        <td className="py-2.5 px-2 whitespace-nowrap">{f.documento ? mascaraDocumento(f.tipo_pessoa, f.documento) : '—'}</td>
                        <td className="py-2.5 px-2 whitespace-nowrap">{f.telefone ? mascaraTelefone(f.telefone) : '—'}</td>
                        <td className="py-2.5 px-2">{f.compras}</td>
                        <td className="py-2.5 px-2 whitespace-nowrap">{formatarMoeda(f.total_comprado)}</td>
                        <td className="py-2.5 px-2 whitespace-nowrap">{formatarMoeda(f.a_pagar)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginacao pagina={pagina} aoMudarPagina={setPagina} porPagina={porPagina} aoMudarPorPagina={(n) => { setPorPagina(n); setPagina(1); }} total={lista.total} />
            </>
          ))}
        </section>
        <aside aria-label="Detalhes do fornecedor" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 self-start min-w-0 space-y-3">
          {!selecionado ? <p className="text-sm text-gray-500">Selecione um fornecedor.</p> : det === null ? <div role="status" aria-label="Carregando fornecedor" className="h-48 rounded-xl bg-gray-50 animate-pulse" /> : det === 'erro' ? <p role="alert" className="text-sm text-red-700">Não foi possível carregar o fornecedor.</p> : (
            <>
              <div className="flex items-center gap-3">
                <span className="w-12 h-12 shrink-0 rounded-full bg-gray-100 text-gray-700 inline-flex items-center justify-center"><Building2 className="w-6 h-6" aria-hidden="true" /></span>
                <div className="flex-1 min-w-0"><p className="font-bold text-gray-900 break-words">{nomeFornecedor(det)}</p>{det.nome_fantasia && <p className="text-xs text-gray-500 break-words">{det.nome}</p>}</div>
                <Selo tipo={det.status === 'ativo' ? 'sucesso' : 'neutro'} texto={det.status === 'ativo' ? 'Ativo' : 'Inativo'} />
              </div>
              <dl className="text-sm space-y-2">
                {det.documento && <div className="flex gap-2"><dt className="w-20 shrink-0 text-gray-500">{det.tipo_pessoa === 'pj' ? 'CNPJ' : 'CPF'}</dt><dd>{mascaraDocumento(det.tipo_pessoa, det.documento)}</dd></div>}
                {det.telefone && <div className="flex gap-2"><dt className="w-20 shrink-0 text-gray-500">Telefone</dt><dd><a href={`tel:+55${det.telefone}`} className="hover:text-orange-600">{mascaraTelefone(det.telefone)}</a></dd></div>}
                {det.email && <div className="flex gap-2"><dt className="w-20 shrink-0 text-gray-500">E-mail</dt><dd className="break-all"><a href={`mailto:${det.email}`} className="hover:text-orange-600">{det.email}</a></dd></div>}
                {(det.endereco || det.cidade) && <div className="flex gap-2"><dt className="w-20 shrink-0 text-gray-500">Endereço</dt><dd>{[det.endereco, det.cidade && `${det.cidade}${det.estado ? `/${det.estado}` : ''}`].filter(Boolean).join(' - ')}</dd></div>}
                {det.observacoes && <div className="flex gap-2"><dt className="w-20 shrink-0 text-gray-500">Notas</dt><dd className="whitespace-pre-line">{det.observacoes}</dd></div>}
              </dl>
              {sel && <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl border border-gray-100 p-3"><p className="text-xs text-gray-500">Total comprado</p><p className="font-bold">{formatarMoeda(sel.total_comprado)}</p></div>
                <div className="rounded-xl border border-gray-100 p-3"><p className="text-xs text-gray-500">A pagar</p><p className="font-bold">{formatarMoeda(sel.a_pagar)}</p></div>
              </div>}
              {podeOperar && <button type="button" onClick={() => aoEditar(det)} className={`${classeBotaoSecundario} w-full`}><Pencil className="w-4 h-4" aria-hidden="true" />Editar fornecedor</button>}
            </>
          )}
        </aside>
      </div>
    </>
  );
}
