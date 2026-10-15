'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Box, CheckCircle2, Package, PackageX, Pencil, Plus, RefreshCw, SlidersHorizontal, Wrench } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useEmpresaAtual } from '@/components/app/LayoutEmpresa';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarMoeda } from '@/lib/financeiro';
import { recursoAusente } from '@/lib/erros-banco';
import { SITUACAO_ESTOQUE, TIPO_MOVIMENTO, formatarQuantidade, numeroVenda, type Produto, type ProdutoCompleto, type ResumoEstoque, type SituacaoEstoque } from '@/lib/estoque-vendas';
import { Paginacao, Selo } from '@/components/admin/tabela';
import { Indicador } from '@/components/financeiro/Indicador';
import { classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { ModalMovimentacao, ModalProduto, type TipoMovimentacao } from '@/components/estoque/Modais';

type Lista = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string; ausente: boolean } | { tipo: 'ok'; linhas: Produto[]; total: number };
const filtro = 'min-h-11 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-500';

export default function EstoquePage() {
  const { empresa } = useEmpresaAtual();
  const [resumo, setResumo] = useState<ResumoEstoque | null | 'erro'>(null);
  const [lista, setLista] = useState<Lista>({ tipo: 'carregando' });
  const [aba, setAba] = useState<'' | SituacaoEstoque>('');
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [status, setStatus] = useState('ativo');
  const [categorias, setCategorias] = useState<string[]>([]);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [podeOperar, setPodeOperar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [modal, setModal] = useState<{ p: ProdutoCompleto | null } | null>(null);
  const [mov, setMov] = useState<{ p: ProdutoCompleto; tipo: TipoMovimentacao } | null>(null);
  const [versao, setVersao] = useState(0);
  const req = useRef(0);

  const carregarLista = useCallback(() => {
    if (!empresa) return;
    const atual = ++req.current;
    setLista((l) => (l.tipo === 'ok' ? l : { tipo: 'carregando' }));
    createClient().rpc('buscar_produtos', { p_id_empresa: empresa.id, p_busca: busca.trim() || null, p_filtro: aba || null, p_categoria: categoria || null, p_status: status || null, p_limite: porPagina, p_deslocamento: (pagina - 1) * porPagina })
      .then(({ data, error }) => {
        if (atual !== req.current) return;
        if (error) return setLista({ tipo: 'erro', mensagem: mensagemDeErro(error, 'Não foi possível carregar o estoque.'), ausente: recursoAusente(error) });
        const linhas = (data ?? []) as Produto[];
        setLista({ tipo: 'ok', linhas, total: Number(linhas[0]?.total ?? 0) });
        setSelecionado((s) => (s && linhas.some((l) => l.id === s) ? s : linhas[0]?.id ?? s));
      });
  }, [empresa, busca, aba, categoria, status, pagina, porPagina]);
  useEffect(() => { const t = setTimeout(carregarLista, 250); return () => clearTimeout(t); }, [carregarLista, versao]);
  useEffect(() => {
    if (!empresa) return;
    const supabase = createClient();
    supabase.rpc('resumo_estoque', { p_id_empresa: empresa.id }).then(({ data, error }) => setResumo(error ? 'erro' : (data as ResumoEstoque)));
    supabase.rpc('pode_operar_comercial', { p_id_empresa: empresa.id }).then(({ data }) => setPodeOperar(!!data));
    supabase.from('produtos').select('categoria').eq('id_empresa', empresa.id).not('categoria', 'is', null).limit(1000)
      .then(({ data }) => setCategorias([...new Set((data ?? []).map((x) => x.categoria as string))].sort((a, b) => a.localeCompare(b, 'pt-BR'))));
  }, [empresa, versao]);

  if (!empresa) return null;
  const alterado = (m: string, id?: string) => { setAviso(m); setModal(null); setMov(null); if (id) setSelecionado(id); setVersao((v) => v + 1); };
  const r = resumo && resumo !== 'erro' ? resumo : null;
  const valorCard = (v: number | undefined) => (r ? String(v ?? 0) : resumo === 'erro' ? 'Indisponível' : '…');
  const linhas = lista.tipo === 'ok' ? lista.linhas : [];
  const filtrando = !!(busca || aba || categoria || status !== 'ativo');

  return (
    <div className="space-y-5 min-w-0">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-2xl bg-orange-100 text-orange-600 inline-flex items-center justify-center"><Box className="w-7 h-7" aria-hidden="true" /></span>
          <div className="min-w-0"><h1 className="text-2xl sm:text-3xl font-black text-gray-900">Estoque</h1>
            <p className="text-gray-600 mt-1 text-sm sm:text-base">Produtos, serviços, saldos e movimentações.</p></div>
        </div>
        {podeOperar && <button type="button" className={`${classeBotaoPrimario} whitespace-nowrap self-start xl:self-auto`} onClick={() => setModal({ p: null })}><Plus className="w-4 h-4" aria-hidden="true" />Novo produto ou serviço</button>}
      </div>

      {aviso && <div role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex justify-between gap-3"><span>{aviso}</span><button type="button" className="underline" onClick={() => setAviso(null)}>Fechar</button></div>}
      {lista.tipo === 'erro' && (lista.ausente
        ? <p role="status" data-testid="estoque-indisponivel" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{lista.mensagem}</p>
        : <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex flex-wrap justify-between gap-3">{lista.mensagem}
            <button type="button" onClick={() => setVersao((v) => v + 1)} className="min-h-11 px-3 inline-flex items-center gap-1 font-semibold hover:underline"><RefreshCw className="w-4 h-4" aria-hidden="true" />Tentar novamente</button></div>)}

      <div className="grid gap-3 sm:gap-4 grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Itens cadastrados" valor={valorCard(r?.cadastrados)} icone={Package} cor="bg-blue-100 text-blue-600" detalhe={r ? `${r.produtos} produtos · ${r.servicos} serviços` : undefined} />
        <Indicador titulo="Em estoque" valor={valorCard(r?.em_estoque)} icone={CheckCircle2} cor="bg-green-100 text-green-600" detalhe={r ? `Valor de custo: ${formatarMoeda(r.valor_estoque_custo)}` : undefined} />
        <Indicador titulo="Estoque baixo" valor={valorCard(r?.estoque_baixo)} icone={AlertTriangle} cor="bg-orange-100 text-orange-600" detalhe="No mínimo ou abaixo: repor" />
        <Indicador titulo="Sem estoque" valor={valorCard(r?.sem_estoque)} icone={PackageX} cor="bg-red-100 text-red-600" detalhe="Saldo zerado" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <section aria-label="Lista de produtos e serviços" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 sm:p-4 min-w-0 space-y-3">
          <div role="tablist" aria-label="Situação do estoque" className="flex flex-wrap gap-1">
            {([['', 'Todos'], ['em_estoque', 'Em estoque'], ['estoque_baixo', 'Estoque baixo'], ['sem_estoque', 'Sem estoque'], ['servico', 'Serviços']] as const).map(([v, rot]) => (
              <button key={v} type="button" role="tab" aria-selected={aba === v} onClick={() => { setAba(v); setPagina(1); }}
                className={`min-h-11 px-3 sm:px-4 rounded-lg text-sm font-semibold ${aba === v ? 'bg-orange-600 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>{rot}</button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="search" aria-label="Buscar itens" placeholder="Buscar por nome, SKU, código de barras ou categoria..." value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} className={`${filtro} flex-1 min-w-0`} />
            <select aria-label="Filtrar por categoria" value={categoria} onChange={(e) => { setCategoria(e.target.value); setPagina(1); }} className={filtro}><option value="">Todas as categorias</option>{categorias.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <select aria-label="Filtrar por situação do cadastro" value={status} onChange={(e) => { setStatus(e.target.value); setPagina(1); }} className={filtro}><option value="ativo">Ativos</option><option value="inativo">Inativos</option><option value="">Ativos e inativos</option></select>
          </div>
          {lista.tipo === 'carregando' && <div role="status" aria-label="Carregando estoque" className="h-56 rounded-xl bg-gray-50 animate-pulse" />}
          {lista.tipo === 'ok' && (linhas.length === 0 ? (
            <div className="text-center py-12">
              <p className="font-semibold text-gray-900">{filtrando ? 'Nenhum item com esses filtros.' : 'Nenhum produto ou serviço cadastrado ainda.'}</p>
              {!filtrando && podeOperar && <button type="button" className={`${classeBotaoPrimario} mt-4`} onClick={() => setModal({ p: null })}><Plus className="w-4 h-4" aria-hidden="true" />Cadastrar o primeiro item</button>}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-3 sm:mx-0">
                <table className="w-full text-sm min-w-[50rem]">
                  <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">{['Item', 'Categoria', 'Custo', 'Preço', 'Estoque', 'Situação'].map((h) => <th key={h} className="py-2 px-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {linhas.map((p) => (
                      <tr key={p.id} onClick={() => setSelecionado(p.id)} data-testid={`produto-${p.nome}`} className={`border-b border-gray-50 cursor-pointer ${selecionado === p.id ? 'bg-orange-50/60' : 'hover:bg-gray-50'}`}>
                        <td className="py-2.5 px-2"><button type="button" onClick={() => setSelecionado(p.id)} className="flex items-center gap-2 text-left">
                          <span className={`w-9 h-9 shrink-0 rounded-lg inline-flex items-center justify-center ${p.tipo === 'servico' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>{p.tipo === 'servico' ? <Wrench className="w-4 h-4" aria-hidden="true" /> : <Package className="w-4 h-4" aria-hidden="true" />}</span>
                          <span className="min-w-[10rem]"><span className="block font-semibold text-gray-900">{p.nome}{p.status === 'inativo' && <span className="ml-1 text-xs font-normal text-gray-500">(inativo)</span>}</span><span className="block text-xs text-gray-500">{p.sku ? `SKU ${p.sku}` : p.tipo === 'servico' ? 'Serviço' : 'Sem SKU'}</span></span></button></td>
                        <td className="py-2.5 px-2">{p.categoria ?? '—'}</td>
                        <td className="py-2.5 px-2 whitespace-nowrap">{formatarMoeda(p.custo)}</td>
                        <td className="py-2.5 px-2 whitespace-nowrap font-semibold">{formatarMoeda(p.preco_venda)}</td>
                        <td className="py-2.5 px-2 whitespace-nowrap">{p.tipo === 'servico' ? '—' : <>{formatarQuantidade(p.estoque_atual)} {p.unidade}<span className="block text-xs text-gray-500">mín. {formatarQuantidade(p.estoque_minimo)}</span></>}</td>
                        <td className="py-2.5 px-2"><Selo tipo={SITUACAO_ESTOQUE[p.situacao_estoque].selo} texto={SITUACAO_ESTOQUE[p.situacao_estoque].rotulo} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginacao pagina={pagina} aoMudarPagina={setPagina} porPagina={porPagina} aoMudarPorPagina={(n) => { setPorPagina(n); setPagina(1); }} total={lista.total} />
            </>
          ))}
        </section>

        <PainelProduto id={selecionado} versao={versao} podeOperar={podeOperar} aoEditar={(p) => setModal({ p })} aoMovimentar={(p, tipo) => setMov({ p, tipo })} />
      </div>

      <ModalProduto aberto={!!modal} aoFechar={() => setModal(null)} idEmpresa={empresa.id} produto={modal?.p ?? null} categorias={categorias} aoSalvar={alterado} />
      <ModalMovimentacao produto={mov?.p ?? null} tipoInicial={mov?.tipo ?? 'entrada'} aoFechar={() => setMov(null)} aoConcluir={(m) => alterado(m)} />
    </div>
  );
}

interface Movimento { id: string; tipo: string; quantidade: number; saldo_apos: number; motivo: string | null; criado_em: string; vendas: { numero: number } | null; compras?: { numero: number } | null }

function PainelProduto({ id, versao, podeOperar, aoEditar, aoMovimentar }: {
  id: string | null; versao: number; podeOperar: boolean; aoEditar: (p: ProdutoCompleto) => void; aoMovimentar: (p: ProdutoCompleto, t: TipoMovimentacao) => void;
}) {
  const [p, setP] = useState<ProdutoCompleto | null | 'erro'>(null);
  const [movs, setMovs] = useState<Movimento[] | null>(null);
  const [vendido, setVendido] = useState<{ qtd: number; total: number } | null>(null);

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    setP(null); setMovs(null); setVendido(null);
    supabase.from('produtos').select('id, tipo, nome, descricao, sku, codigo_barras, categoria, unidade, custo, preco_venda, estoque_atual, estoque_minimo, status, criado_em, atualizado_em').eq('id', id).maybeSingle()
      .then(({ data, error }) => setP(error || !data ? 'erro' : (data as ProdutoCompleto)));
    supabase.from('movimentacoes_estoque').select('id, tipo, quantidade, saldo_apos, motivo, criado_em, vendas(numero), compras(numero)').eq('id_produto', id).order('criado_em', { ascending: false }).limit(50)
      .then(({ data }) => setMovs((data ?? []) as unknown as Movimento[]));
    supabase.from('itens_venda').select('quantidade, total, vendas!inner(status)').eq('id_produto', id).eq('vendas.status', 'confirmada').limit(5000)
      .then(({ data }) => setVendido((data ?? []).reduce((a, x) => ({ qtd: a.qtd + Number(x.quantidade), total: a.total + Number(x.total) }), { qtd: 0, total: 0 })));
  }, [id, versao]);

  const caixa = 'bg-white rounded-2xl border border-gray-200 shadow-sm p-4 self-start min-w-0';
  if (!id) return <aside aria-label="Detalhes do item" className={`${caixa} text-sm text-gray-500`}>Selecione um item.</aside>;
  if (p === null) return <aside aria-label="Detalhes do item" className={caixa}><div role="status" aria-label="Carregando item" className="h-64 rounded-xl bg-gray-50 animate-pulse" /></aside>;
  if (p === 'erro') return <aside aria-label="Detalhes do item" role="alert" className={`${caixa} text-sm text-red-700`}>Não foi possível carregar o item.</aside>;

  const servico = p.tipo === 'servico';
  const baixo = !servico && Number(p.estoque_atual) <= Number(p.estoque_minimo);
  const margem = Number(p.preco_venda) > 0 ? Math.round(((p.preco_venda - p.custo) / p.preco_venda) * 1000) / 10 : null;
  return (
    <aside aria-label="Detalhes do item" className={`${caixa} space-y-3`}>
      <div className="flex items-start gap-3">
        <span className={`w-12 h-12 shrink-0 rounded-xl inline-flex items-center justify-center ${servico ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>{servico ? <Wrench className="w-6 h-6" aria-hidden="true" /> : <Package className="w-6 h-6" aria-hidden="true" />}</span>
        <div className="flex-1 min-w-0"><p className="font-bold text-gray-900 break-words">{p.nome}</p><p className="text-xs text-gray-500">{[p.sku && `SKU ${p.sku}`, p.categoria, servico ? 'Serviço' : 'Produto'].filter(Boolean).join(' · ')}</p></div>
        {p.status === 'inativo' && <Selo tipo="neutro" texto="Inativo" />}
      </div>
      {p.descricao && <p className="text-sm text-gray-700 whitespace-pre-line">{p.descricao}</p>}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl border border-gray-100 p-3"><p className="text-xs text-gray-500">Preço</p><p className="font-bold text-gray-900">{formatarMoeda(p.preco_venda)}</p></div>
        <div className="rounded-xl border border-gray-100 p-3"><p className="text-xs text-gray-500">Custo{margem !== null ? ` · margem ${String(margem).replace('.', ',')}%` : ''}</p><p className="font-bold text-gray-900">{formatarMoeda(p.custo)}</p></div>
        {!servico && <div className={`rounded-xl border p-3 ${baixo ? 'border-orange-200 bg-orange-50' : 'border-gray-100'}`}><p className="text-xs text-gray-500">Estoque atual</p><p className="font-bold text-gray-900" data-testid="saldo-produto">{formatarQuantidade(p.estoque_atual)} {p.unidade}</p></div>}
        {!servico && <div className="rounded-xl border border-gray-100 p-3"><p className="text-xs text-gray-500">Estoque mínimo</p><p className="font-bold text-gray-900">{formatarQuantidade(p.estoque_minimo)} {p.unidade}</p></div>}
        <div className="rounded-xl border border-gray-100 p-3 col-span-2"><p className="text-xs text-gray-500">Vendido (vendas confirmadas)</p><p className="font-bold text-gray-900">{vendido === null ? '…' : `${formatarQuantidade(vendido.qtd)} ${p.unidade} · ${formatarMoeda(vendido.total)}`}</p></div>
      </div>
      {baixo && <p role="status" className="text-sm rounded-lg bg-orange-50 border border-orange-200 text-orange-800 px-3 py-2 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />{Number(p.estoque_atual) === 0 ? 'Sem estoque.' : 'Estoque no mínimo ou abaixo.'} Programe a reposição.</p>}
      {podeOperar && !servico && (
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => aoMovimentar(p, 'entrada')} className={`${classeBotaoSecundario} !px-2`}><ArrowDownCircle className="w-4 h-4 text-green-600" aria-hidden="true" />Entrada</button>
          <button type="button" onClick={() => aoMovimentar(p, 'saida')} className={`${classeBotaoSecundario} !px-2`}><ArrowUpCircle className="w-4 h-4 text-red-600" aria-hidden="true" />Saída</button>
          <button type="button" onClick={() => aoMovimentar(p, 'ajuste')} className={`${classeBotaoSecundario} !px-2`}><SlidersHorizontal className="w-4 h-4" aria-hidden="true" />Ajuste</button>
        </div>
      )}
      {!servico && (
        <div>
          <h2 className="text-sm font-bold text-gray-900 mb-1">Histórico de movimentações</h2>
          {movs === null ? <div role="status" aria-label="Carregando movimentações" className="h-20 rounded-lg bg-gray-50 animate-pulse" /> : movs.length === 0 ? <p className="text-sm text-gray-500">Nenhuma movimentação.</p> : (
            <ul className="divide-y divide-gray-100 text-sm max-h-72 overflow-y-auto" data-testid="movimentacoes">
              {movs.map((m) => (
                <li key={m.id} className="py-2 flex items-start gap-2">
                  <span className="flex-1 min-w-0"><span className="block font-medium text-gray-900">{TIPO_MOVIMENTO[m.tipo] ?? m.tipo}{m.vendas ? ` · venda ${numeroVenda(m.vendas.numero)}` : m.compras ? ` · compra ${numeroVenda(m.compras.numero)}` : ''}</span>
                    <span className="block text-xs text-gray-500 break-words">{new Date(m.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}{m.motivo ? ` · ${m.motivo}` : ''}</span></span>
                  <span className="text-right whitespace-nowrap"><span className={`block font-semibold ${Number(m.quantidade) < 0 ? 'text-red-700' : 'text-green-700'}`}>{Number(m.quantidade) > 0 ? '+' : ''}{formatarQuantidade(m.quantidade)}</span>
                    <span className="block text-xs text-gray-500">saldo {formatarQuantidade(m.saldo_apos)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {podeOperar && <button type="button" onClick={() => aoEditar(p)} className={`${classeBotaoSecundario} w-full`}><Pencil className="w-4 h-4" aria-hidden="true" />Editar item</button>}
      <Link href="/app/vendas" className="block text-center text-sm font-semibold text-orange-600 hover:underline min-h-11 leading-[2.75rem]">Ir para Vendas</Link>
    </aside>
  );
}
