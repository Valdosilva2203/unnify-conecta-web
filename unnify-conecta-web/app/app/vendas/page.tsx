'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Ban, CircleDollarSign, HandCoins, Pencil, Plus, Receipt, RefreshCw, ShoppingBag, TrendingUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarData, formatarMoeda, hojeBrasil, valorParaMascara, type ContaFinanceira } from '@/lib/financeiro';
import { recursoAusente } from '@/lib/erros-banco';
import { variacao } from '@/lib/relatorios';
import { FORMAS_PAGAMENTO, SITUACAO_VENDA, formatarQuantidade, numeroVenda, periodoVendas, type ResumoVendas, type SituacaoVenda, type VendaLinha } from '@/lib/estoque-vendas';
import { Paginacao, Selo } from '@/components/admin/tabela';
import { Indicador } from '@/components/financeiro/Indicador';
import { classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { ModalCancelarVenda, ModalNovaVenda, ModalRecebimento, type RascunhoVenda } from '@/components/vendas/Modais';
import { CabecalhoModulo, classePilula } from '@/components/navegacao/NavegacaoModulos';

type Lista = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string; ausente: boolean } | { tipo: 'ok'; linhas: VendaLinha[]; total: number };
type Periodo = 'mes' | 'anterior' | '90' | 'ano';
const filtro = 'min-h-11 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500';
const ROTULO_PERIODO: Record<Periodo, string> = { mes: 'Este mês', anterior: 'Mês anterior', '90': 'Últimos 90 dias', ano: 'Este ano' };

export default function VendasPage() {
  const { empresa } = useEmpresaAtual();
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [resumo, setResumo] = useState<ResumoVendas | null | 'erro'>(null);
  const [lista, setLista] = useState<Lista>({ tipo: 'carregando' });
  const [aba, setAba] = useState<'' | SituacaoVenda>('');
  const [busca, setBusca] = useState('');
  const [condicao, setCondicao] = useState('');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [podeOperar, setPodeOperar] = useState(false);
  const [contas, setContas] = useState<ContaFinanceira[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nova, setNova] = useState<{ r: RascunhoVenda | null } | null>(null);
  const [receber, setReceber] = useState<VendaLinha | null>(null);
  const [cancelar, setCancelar] = useState<VendaLinha | null>(null);
  const [versao, setVersao] = useState(0);
  const req = useRef(0);
  const [hoje, setHoje] = useState<string | null>(null);
  useEffect(() => setHoje(hojeBrasil()), []); // data de Brasília lida só no navegador (não na pré-renderização)
  const { inicio, fim } = hoje ? periodoVendas(periodo, hoje) : { inicio: '', fim: '' };

  const carregarLista = useCallback(() => {
    if (!empresa || !inicio) return;
    const atual = ++req.current;
    setLista((l) => (l.tipo === 'ok' ? l : { tipo: 'carregando' }));
    createClient().rpc('buscar_vendas', { p_id_empresa: empresa.id, p_busca: busca.trim() || null, p_situacao: aba || null, p_condicao: condicao || null, p_inicio: inicio, p_fim: fim, p_limite: porPagina, p_deslocamento: (pagina - 1) * porPagina })
      .then(({ data, error }) => {
        if (atual !== req.current) return;
        if (error) return setLista({ tipo: 'erro', mensagem: mensagemDeErro(error, 'Não foi possível carregar as vendas.'), ausente: recursoAusente(error) });
        const linhas = (data ?? []) as VendaLinha[];
        setLista({ tipo: 'ok', linhas, total: Number(linhas[0]?.total_linhas ?? 0) });
        setSelecionado((s) => (s && linhas.some((l) => l.id === s) ? s : linhas[0]?.id ?? null));
      });
  }, [empresa, busca, aba, condicao, inicio, fim, pagina, porPagina]);
  useEffect(() => { const t = setTimeout(carregarLista, 250); return () => clearTimeout(t); }, [carregarLista, versao]);
  useEffect(() => {
    if (!empresa || !inicio) return;
    const supabase = createClient();
    supabase.rpc('resumo_vendas', { p_id_empresa: empresa.id, p_inicio: inicio, p_fim: fim }).then(({ data, error }) => setResumo(error ? 'erro' : (data as ResumoVendas)));
  }, [empresa, inicio, fim, versao]);
  useEffect(() => {
    if (!empresa) return;
    const supabase = createClient();
    supabase.rpc('pode_operar_comercial', { p_id_empresa: empresa.id }).then(({ data }) => setPodeOperar(!!data));
    supabase.from('contas_financeiras_saldo').select('id, nome, instituicao, tipo, saldo_inicial, data_saldo_inicial, principal, permite_saldo_negativo, arquivada_em, saldo, cor').eq('id_empresa', empresa.id).order('nome')
      .then(({ data }) => setContas((data ?? []) as ContaFinanceira[]));
  }, [empresa, versao]);

  if (!empresa || !hoje) return null;
  const alterado = (m: string, id?: string) => { setAviso(m); setNova(null); setReceber(null); setCancelar(null); if (id) setSelecionado(id); setVersao((v) => v + 1); };
  const r = resumo && resumo !== 'erro' ? resumo : null;
  const card = (v: string | undefined) => (r ? v ?? '—' : resumo === 'erro' ? 'Indisponível' : '…');
  const comp = (a: number, b: number) => { const x = variacao(a, b); return x === null ? 'Sem base no período anterior' : `${x > 0 ? '+' : ''}${String(x).replace('.', ',')}% vs. período anterior`; };
  const linhas = lista.tipo === 'ok' ? lista.linhas : [];
  const filtrando = !!(busca || aba || condicao);
  const linhaSel = linhas.find((l) => l.id === selecionado) ?? null;

  return (
    <div className="space-y-5 min-w-0">
      <CabecalhoModulo icone={ShoppingBag} titulo="Vendas" descricao="Registre vendas de produtos e serviços, integradas ao estoque e ao financeiro."
        acoes={<>
        <div className="flex flex-col min-[420px]:flex-row gap-2 self-stretch xl:self-auto">
          <select aria-label="Período" value={periodo} onChange={(e) => { setPeriodo(e.target.value as Periodo); setPagina(1); }} className={filtro}>{Object.entries(ROTULO_PERIODO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          {podeOperar && <button type="button" className={`${classeBotaoPrimario} whitespace-nowrap`} onClick={() => setNova({ r: null })}><Plus className="w-4 h-4" aria-hidden="true" />Nova venda</button>}
        </div>
        </>} />

      {aviso && <div role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex justify-between gap-3"><span>{aviso}</span><button type="button" className="underline" onClick={() => setAviso(null)}>Fechar</button></div>}
      {lista.tipo === 'erro' && (lista.ausente
        ? <p role="status" data-testid="vendas-indisponivel" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{lista.mensagem}</p>
        : <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex flex-wrap justify-between gap-3">{lista.mensagem}
            <button type="button" onClick={() => setVersao((v) => v + 1)} className="min-h-11 px-3 inline-flex items-center gap-1 font-semibold hover:underline"><RefreshCw className="w-4 h-4" aria-hidden="true" />Tentar novamente</button></div>)}

      <div className="grid gap-3 sm:gap-4 grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Total vendido" valor={card(r ? formatarMoeda(r.vendido) : undefined)} icone={TrendingUp} cor="bg-green-100 text-green-600" detalhe={r ? comp(r.vendido, r.vendido_anterior) : undefined} />
        <Indicador titulo="Vendas realizadas" valor={card(r ? String(r.quantidade) : undefined)} icone={Receipt} cor="bg-blue-100 text-blue-600" detalhe={r ? (r.quantidade ? `Ticket médio ${formatarMoeda(r.vendido / r.quantidade)}` : 'Nenhuma venda no período') : undefined} />
        <Indicador titulo="A receber" valor={card(r ? formatarMoeda(r.a_receber) : undefined)} icone={CircleDollarSign} cor="bg-orange-100 text-orange-600" detalhe={r ? (r.a_receber_vencido ? `${formatarMoeda(r.a_receber_vencido)} vencido` : 'Pendente hoje, todas as vendas') : undefined} />
        <Indicador titulo="Recebido" valor={card(r ? formatarMoeda(r.recebido) : undefined)} icone={HandCoins} cor="bg-purple-100 text-purple-600" detalhe={r ? 'Entradas de vendas no período (caixa)' : undefined} />
      </div>
      <p className="text-xs text-gray-500 -mt-2">Total vendido considera vendas confirmadas no período ({formatarData(inicio)} a {formatarData(fim)}); recebido considera o dinheiro que entrou. Vender não é o mesmo que receber.</p>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-label="Histórico de vendas" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 sm:p-4 min-w-0 space-y-3">
          <div role="tablist" aria-label="Situação da venda" className="flex flex-wrap gap-1">
            {([['', 'Todas'], ['aguardando_pagamento', 'Aguardando pagamento'], ['concluida', 'Concluídas'], ['rascunho', 'Rascunhos'], ['cancelada', 'Canceladas']] as const).map(([v, rot]) => (
              <button key={v} type="button" role="tab" aria-selected={aba === v} onClick={() => { setAba(v); setPagina(1); }}
                className={classePilula(aba === v)}>{rot}</button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="search" aria-label="Buscar vendas" placeholder="Buscar por número da venda ou cliente..." value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} className={`${filtro} flex-1 min-w-0`} />
            <select aria-label="Filtrar por condição" value={condicao} onChange={(e) => { setCondicao(e.target.value); setPagina(1); }} className={filtro}><option value="">À vista e a prazo</option><option value="a_vista">À vista</option><option value="a_prazo">A prazo</option></select>
          </div>
          {lista.tipo === 'carregando' && <div role="status" aria-label="Carregando vendas" className="h-56 rounded-xl bg-gray-50 animate-pulse" />}
          {lista.tipo === 'ok' && (linhas.length === 0 ? (
            <div className="text-center py-12">
              <p className="font-semibold text-gray-900">{filtrando ? 'Nenhuma venda com esses filtros.' : `Nenhuma venda em: ${ROTULO_PERIODO[periodo].toLowerCase()}.`}</p>
              {!filtrando && podeOperar && <button type="button" className={`${classeBotaoPrimario} mt-4`} onClick={() => setNova({ r: null })}><Plus className="w-4 h-4" aria-hidden="true" />Registrar venda</button>}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-3 sm:mx-0">
                <table className="w-full text-sm min-w-[52rem]">
                  <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">{['Venda', 'Cliente', 'Itens', 'Pagamento', 'Total', 'Recebido', 'Situação'].map((h) => <th key={h} className="py-2 px-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {linhas.map((v) => (
                      <tr key={v.id} onClick={() => setSelecionado(v.id)} data-testid={`venda-${v.numero}`} className={`border-b border-gray-50 cursor-pointer ${selecionado === v.id ? 'bg-orange-50/60' : 'hover:bg-gray-50'}`}>
                        <td className="py-2.5 px-2"><button type="button" onClick={() => setSelecionado(v.id)} className="text-left"><span className="block font-semibold text-gray-900">{numeroVenda(v.numero)}</span><span className="block text-xs text-gray-500">{formatarData(v.data_venda)}</span></button></td>
                        <td className="py-2.5 px-2 max-w-[12rem] truncate">{v.cliente ?? <span className="text-gray-400">Não identificado</span>}</td>
                        <td className="py-2.5 px-2 whitespace-nowrap">{v.itens} {v.itens === 1 ? 'item' : 'itens'}<span className="block text-xs text-gray-500">{v.tipos === 'produto,servico' ? 'Produtos e serviços' : v.tipos === 'servico' ? 'Serviços' : 'Produtos'}</span></td>
                        <td className="py-2.5 px-2 whitespace-nowrap">{v.condicao === 'a_vista' ? 'À vista' : 'A prazo'}<span className="block text-xs text-gray-500">{FORMAS_PAGAMENTO[v.forma_pagamento]}</span></td>
                        <td className="py-2.5 px-2 whitespace-nowrap font-semibold">{formatarMoeda(v.total)}</td>
                        <td className="py-2.5 px-2 whitespace-nowrap">{v.situacao === 'rascunho' || v.situacao === 'cancelada' ? '—' : formatarMoeda(v.recebido)}</td>
                        <td className="py-2.5 px-2"><Selo tipo={SITUACAO_VENDA[v.situacao].selo} texto={SITUACAO_VENDA[v.situacao].rotulo} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginacao pagina={pagina} aoMudarPagina={setPagina} porPagina={porPagina} aoMudarPorPagina={(n) => { setPorPagina(n); setPagina(1); }} total={lista.total} />
            </>
          ))}
        </section>

        <PainelVenda linha={linhaSel} versao={versao} podeOperar={podeOperar} aoReceber={setReceber} aoCancelar={setCancelar} aoContinuar={(rv) => setNova({ r: rv })} />
      </div>

      <ModalNovaVenda aberto={!!nova} aoFechar={() => setNova(null)} idEmpresa={empresa.id} contas={contas} rascunho={nova?.r ?? null} aoConcluir={alterado} />
      <ModalRecebimento venda={receber} contas={contas} aoFechar={() => setReceber(null)} aoConcluir={(m) => alterado(m)} />
      <ModalCancelarVenda venda={cancelar} aoFechar={() => setCancelar(null)} aoConcluir={(m) => alterado(m)} />
    </div>
  );
}

interface Detalhe {
  id: string; numero: number; status: string; condicao: 'a_vista' | 'a_prazo'; forma_pagamento: keyof typeof FORMAS_PAGAMENTO; subtotal: number; desconto: number; total: number;
  data_venda: string; vencimento: string | null; observacoes: string | null; id_cliente: string | null; motivo_cancelamento: string | null;
  clientes: { nome: string; nome_fantasia: string | null } | null;
  itens_venda: { id_produto: string; tipo: 'produto' | 'servico'; descricao: string; quantidade: number; preco_unitario: number; desconto: number; total: number; produtos: { unidade: string; estoque_atual: number } | null }[];
}
interface Lanc { id: string; descricao: string; valor: number; status: string; data_vencimento: string | null; data_pagamento: string | null }
interface Hist { acao: string; dados: Record<string, unknown> | null; criado_em: string }
const ROTULO_HIST: Record<string, string> = { rascunho: 'Rascunho salvo', confirmada: 'Venda confirmada', recebimento: 'Recebimento registrado', cancelada: 'Venda cancelada' };

function PainelVenda({ linha, versao, podeOperar, aoReceber, aoCancelar, aoContinuar }: {
  linha: VendaLinha | null; versao: number; podeOperar: boolean; aoReceber: (v: VendaLinha) => void; aoCancelar: (v: VendaLinha) => void; aoContinuar: (r: RascunhoVenda) => void;
}) {
  const [d, setD] = useState<Detalhe | null | 'erro'>(null);
  const [lancs, setLancs] = useState<Lanc[] | null>(null);
  const [hist, setHist] = useState<Hist[] | null>(null);
  const id = linha?.id ?? null;

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    setD(null); setLancs(null); setHist(null);
    supabase.from('vendas').select('id, numero, status, condicao, forma_pagamento, subtotal, desconto, total, data_venda, vencimento, observacoes, id_cliente, motivo_cancelamento, clientes(nome, nome_fantasia), itens_venda(id_produto, tipo, descricao, quantidade, preco_unitario, desconto, total, produtos(unidade, estoque_atual))')
      .eq('id', id).maybeSingle().then(({ data, error }) => setD(error || !data ? 'erro' : (data as unknown as Detalhe)));
    supabase.from('lancamentos_financeiros').select('id, descricao, valor, status, data_vencimento, data_pagamento').eq('id_venda', id).is('excluido_em', null).order('criado_em')
      .then(({ data }) => setLancs((data ?? []) as Lanc[]));
    supabase.from('historico_vendas').select('acao, dados, criado_em').eq('id_venda', id).order('criado_em', { ascending: false }).limit(50).then(({ data }) => setHist((data ?? []) as Hist[]));
  }, [id, versao]);

  const caixa = 'bg-white rounded-2xl border border-gray-200 shadow-sm p-4 self-start min-w-0';
  if (!linha) return <aside aria-label="Detalhes da venda" className={`${caixa} text-sm text-gray-500`}>Selecione uma venda.</aside>;
  if (d === null) return <aside aria-label="Detalhes da venda" className={caixa}><div role="status" aria-label="Carregando venda" className="h-64 rounded-xl bg-gray-50 animate-pulse" /></aside>;
  if (d === 'erro') return <aside aria-label="Detalhes da venda" role="alert" className={`${caixa} text-sm text-red-700`}>Não foi possível carregar a venda.</aside>;

  const continuar = () => aoContinuar({
    id: d.id, id_cliente: d.id_cliente, condicao: d.condicao, forma_pagamento: d.forma_pagamento, vencimento: d.vencimento, desconto: Number(d.desconto), observacoes: d.observacoes,
    itens: d.itens_venda.map((i) => ({ id_produto: i.id_produto, tipo: i.tipo, nome: i.descricao, unidade: i.produtos?.unidade ?? 'un', disponivel: Number(i.produtos?.estoque_atual ?? 0),
      quantidade: String(i.quantidade).replace('.', ','), preco: valorParaMascara(i.preco_unitario), desconto: Number(i.desconto) ? valorParaMascara(i.desconto) : '' })),
  });
  const cliente = d.clientes ? d.clientes.nome_fantasia || d.clientes.nome : null;
  return (
    <aside aria-label="Detalhes da venda" className={`${caixa} space-y-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="text-lg font-black text-gray-900">Venda {numeroVenda(d.numero)}</p>
          <p className="text-xs text-gray-500">{formatarData(d.data_venda)} · {d.condicao === 'a_vista' ? 'À vista' : `A prazo · vence ${formatarData(d.vencimento)}`} · {FORMAS_PAGAMENTO[d.forma_pagamento]}</p></div>
        <Selo tipo={SITUACAO_VENDA[linha.situacao].selo} texto={SITUACAO_VENDA[linha.situacao].rotulo} />
      </div>
      <p className="text-sm"><span className="text-gray-500">Cliente: </span>{cliente && d.id_cliente ? <Link href="/app/clientes" className="font-semibold text-gray-900 hover:text-orange-600">{cliente}</Link> : <span className="text-gray-700">Não identificado</span>}</p>
      <ul className="divide-y divide-gray-100 text-sm border-y border-gray-100" data-testid="itens-venda">
        {d.itens_venda.map((i, k) => (
          <li key={k} className="py-2 flex gap-2">
            <span className="flex-1 min-w-0"><span className="block font-medium text-gray-900 break-words">{i.descricao}</span>
              <span className="block text-xs text-gray-500">{formatarQuantidade(i.quantidade)} {i.produtos?.unidade ?? ''} × {formatarMoeda(i.preco_unitario)}{Number(i.desconto) ? ` − ${formatarMoeda(i.desconto)}` : ''}{i.tipo === 'servico' ? ' · serviço' : ''}</span></span>
            <span className="font-semibold whitespace-nowrap">{formatarMoeda(i.total)}</span>
          </li>
        ))}
      </ul>
      <dl className="text-sm space-y-1">
        <div className="flex justify-between"><dt className="text-gray-500">Subtotal</dt><dd>{formatarMoeda(d.subtotal)}</dd></div>
        {Number(d.desconto) > 0 && <div className="flex justify-between"><dt className="text-gray-500">Desconto</dt><dd>− {formatarMoeda(d.desconto)}</dd></div>}
        <div className="flex justify-between font-black text-base"><dt>Total</dt><dd>{formatarMoeda(d.total)}</dd></div>
        {d.status === 'confirmada' && <>
          <div className="flex justify-between text-green-700"><dt>Recebido</dt><dd data-testid="recebido-venda">{formatarMoeda(linha.recebido)}</dd></div>
          <div className="flex justify-between text-orange-700"><dt>A receber</dt><dd data-testid="a-receber-venda">{formatarMoeda(linha.a_receber)}</dd></div>
        </>}
      </dl>
      {d.observacoes && <p className="text-sm text-gray-700"><span className="text-gray-500">Obs.: </span>{d.observacoes}</p>}
      {d.status === 'cancelada' && d.motivo_cancelamento && <p className="text-sm rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">Motivo do cancelamento: {d.motivo_cancelamento}</p>}
      {lancs && lancs.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-gray-900 mb-1">No Financeiro</h2>
          <ul className="text-sm space-y-1" data-testid="lancamentos-venda">
            {lancs.map((l) => <li key={l.id} className="flex items-center justify-between gap-2"><span className="text-gray-700">{l.status === 'pago' ? `Recebido em ${formatarData(l.data_pagamento)}` : l.status === 'cancelado' ? 'Cancelado' : `A receber · vence ${formatarData(l.data_vencimento)}`}</span><span className="flex items-center gap-2"><span className="font-semibold whitespace-nowrap">{formatarMoeda(l.valor)}</span>{podeOperar && l.status === 'pago' && <Link href={`/app/recibos?lancamento=${l.id}`} aria-label={`Emitir recibo do recebimento de ${formatarMoeda(l.valor)}`} className="min-h-11 px-2 inline-flex items-center text-xs font-semibold text-orange-600 hover:underline">Emitir recibo</Link>}</span></li>)}
          </ul>
          <Link href="/app/financeiro#receber" className="inline-block mt-1 text-xs font-semibold text-orange-600 hover:underline">Abrir contas a receber</Link>
        </div>
      )}
      {podeOperar && (
        <div className="grid gap-2">
          {linha.situacao === 'rascunho' && <button type="button" onClick={continuar} className={classeBotaoPrimario}><Pencil className="w-4 h-4" aria-hidden="true" />Continuar rascunho</button>}
          {linha.situacao === 'aguardando_pagamento' && <button type="button" onClick={() => aoReceber(linha)} className={classeBotaoPrimario}><HandCoins className="w-4 h-4" aria-hidden="true" />Registrar recebimento</button>}
          {linha.situacao !== 'cancelada' && <button type="button" onClick={() => aoCancelar(linha)} className={classeBotaoSecundario}><Ban className="w-4 h-4" aria-hidden="true" />{linha.situacao === 'rascunho' ? 'Descartar rascunho' : 'Cancelar venda'}</button>}
        </div>
      )}
      <div>
        <h2 className="text-sm font-bold text-gray-900 mb-1">Histórico</h2>
        {hist === null ? <div role="status" aria-label="Carregando histórico" className="h-16 rounded-lg bg-gray-50 animate-pulse" /> : (
          <ul className="text-sm space-y-1.5" data-testid="historico-venda">
            {hist.map((h, i) => (
              <li key={i}><span className="font-medium text-gray-900">{ROTULO_HIST[h.acao] ?? h.acao}</span>
                <span className="block text-xs text-gray-500">{new Date(h.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}
                  {h.acao === 'recebimento' && h.dados?.valor ? ` · ${formatarMoeda(h.dados.valor as number)}` : ''}{h.acao === 'cancelada' && h.dados?.motivo ? ` · ${h.dados.motivo}` : ''}</span></li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
