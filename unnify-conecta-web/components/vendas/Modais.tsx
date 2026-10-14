'use client';

import { useEffect, useRef, useState } from 'react';
import { Minus, Package, Plus, Search, Trash2, Wrench } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarMoeda, hojeBrasil, mascaraMoeda, paraDecimal, valorParaMascara, type ContaFinanceira } from '@/lib/financeiro';
import {
  FORMAS_PAGAMENTO, formatarQuantidade, mascaraQuantidade, numeroVenda, paraQuantidade, totaisCarrinho,
  type FormaPagamento, type ItemCarrinho, type Produto,
} from '@/lib/estoque-vendas';
import { Modal, classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { SeletorConta } from '@/components/financeiro/SeletorConta';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';
function Erro({ texto }: { texto: string | null }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (texto) ref.current?.scrollIntoView({ block: 'nearest' }); }, [texto]);
  return texto ? <p ref={ref} role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{texto}</p> : null;
}
// Valor monetário digitado → número (0 quando vazio)
const lerValor = (t: string) => Number(paraDecimal(t) ?? 0);

export interface RascunhoVenda {
  id: string; id_cliente: string | null; condicao: 'a_vista' | 'a_prazo'; forma_pagamento: FormaPagamento; vencimento: string | null; desconto: number; observacoes: string | null;
  itens: ItemCarrinho[];
}

export function ModalNovaVenda({ aberto, aoFechar, idEmpresa, contas, rascunho, aoConcluir }: {
  aberto: boolean; aoFechar: () => void; idEmpresa: string; contas: ContaFinanceira[]; rascunho: RascunhoVenda | null; aoConcluir: (m: string, id: string) => void;
}) {
  const [passo, setPasso] = useState<1 | 2>(1);
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<Produto[]>([]);
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
  const [cliente, setCliente] = useState('');
  const [condicao, setCondicao] = useState<'a_vista' | 'a_prazo'>('a_vista');
  const [forma, setForma] = useState<FormaPagamento>('pix');
  const [vencimento, setVencimento] = useState('');
  const [desconto, setDesconto] = useState('');
  const [obs, setObs] = useState('');
  const [recebido, setRecebido] = useState(false);
  const [conta, setConta] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const chave = useRef('');

  useEffect(() => {
    if (!aberto) return;
    const r = rascunho;
    setPasso(1); setItens(r?.itens ?? []); setBusca(''); setAchados([]); setCliente(r?.id_cliente ?? ''); setCondicao(r?.condicao ?? 'a_vista');
    setForma(r?.forma_pagamento ?? 'pix'); setVencimento(r?.vencimento ?? ''); setDesconto(r?.desconto ? valorParaMascara(r.desconto) : ''); setObs(r?.observacoes ?? '');
    setRecebido(false); setConta(contas.find((c) => c.principal && !c.arquivada_em)?.id ?? ''); setErro(null);
    chave.current = crypto.randomUUID(); // repetir o envio (duplo clique, rede) devolve a mesma venda
    createClient().from('clientes').select('id, nome, nome_fantasia').eq('id_empresa', idEmpresa).neq('status', 'inativo').order('nome').limit(1000)
      .then(({ data }) => setClientes((data ?? []).map((c) => ({ id: c.id as string, nome: (c.nome_fantasia as string) || (c.nome as string) }))));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reinicia só ao abrir
  }, [aberto, rascunho]);

  useEffect(() => {
    if (!aberto) return;
    const t = setTimeout(() => {
      createClient().rpc('buscar_produtos', { p_id_empresa: idEmpresa, p_busca: busca.trim() || null, p_filtro: null, p_categoria: null, p_status: 'ativo', p_limite: 8, p_deslocamento: 0 })
        .then(({ data }) => setAchados((data ?? []) as Produto[]));
    }, 250);
    return () => clearTimeout(t);
  }, [aberto, busca, idEmpresa]);

  const t = totaisCarrinho(itens, lerValor(desconto), lerValor);
  const alterar = (i: number, k: keyof ItemCarrinho, v: string) => setItens((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const adicionar = (p: Produto) => {
    setErro(null);
    setItens((xs) => {
      const j = xs.findIndex((x) => x.id_produto === p.id);
      if (j >= 0) return xs.map((x, k) => (k === j ? { ...x, quantidade: mascaraQuantidade(String((paraQuantidade(x.quantidade) ?? 0) + 1).replace('.', ',')) } : x));
      return [...xs, { id_produto: p.id, tipo: p.tipo, nome: p.nome, unidade: p.unidade, disponivel: Number(p.estoque_atual), quantidade: '1', preco: valorParaMascara(p.preco_venda), desconto: '' }];
    });
  };
  const passo1Ok = () => {
    if (itens.length === 0) return 'Adicione ao menos um produto ou serviço.';
    for (const l of t.linhas) {
      if (l.q <= 0) return `Quantidade inválida em "${l.nome}".`;
      if (l.tipo === 'produto' && l.q > l.disponivel) return `Estoque insuficiente para "${l.nome}": disponível ${formatarQuantidade(l.disponivel)} ${l.unidade}.`;
      if (l.totalCentavos < 0) return `O desconto de "${l.nome}" é maior que o valor do item.`;
    }
    if (t.total < 0) return 'O desconto da venda é maior que o subtotal.';
    return null;
  };

  const enviar = async (confirmar: boolean) => {
    const e1 = passo1Ok();
    if (e1) { setPasso(1); return setErro(e1); }
    if (confirmar && t.total <= 0) return setErro('O total da venda deve ser maior que zero.');
    if (condicao === 'a_prazo' && (!vencimento || vencimento < hojeBrasil())) return setErro('Informe o vencimento (a partir de hoje).');
    if (confirmar && recebido && !conta) return setErro('Escolha a conta que recebeu o pagamento.');
    setOcupado(true); setErro(null);
    const { data, error } = await createClient().rpc('salvar_venda', {
      p_id: rascunho?.id ?? null, p_id_empresa: idEmpresa, p_id_cliente: cliente || null,
      p_itens: t.linhas.map((l) => ({ id_produto: l.id_produto, quantidade: l.q, preco_unitario: lerValor(l.preco), desconto: lerValor(l.desconto) })),
      p_desconto: lerValor(desconto), p_condicao: condicao, p_forma_pagamento: forma, p_vencimento: condicao === 'a_prazo' ? vencimento : null, p_observacoes: obs || null,
      p_confirmar: confirmar, p_recebido: confirmar && condicao === 'a_vista' && recebido, p_id_conta: confirmar && recebido ? conta : null, p_chave: confirmar ? chave.current : null,
    });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar a venda.'));
    aoConcluir(!confirmar ? 'Rascunho salvo (sem baixa de estoque nem lançamento).' : recebido ? 'Venda confirmada e recebimento registrado.' : 'Venda confirmada. O valor está em Contas a receber.', data as string);
  };

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={rascunho ? 'Continuar rascunho' : 'Nova venda'} tamanho="lg"
      rodape={<>
        <button type="button" className={classeBotaoSecundario} onClick={passo === 1 ? aoFechar : () => setPasso(1)}>{passo === 1 ? 'Cancelar' : 'Voltar'}</button>
        <button type="button" className={classeBotaoSecundario} disabled={ocupado} onClick={() => enviar(false)}>Salvar rascunho</button>
        {passo === 1
          ? <button type="button" className={classeBotaoPrimario} onClick={() => { const e = passo1Ok(); setErro(e); if (!e) setPasso(2); }}>Continuar</button>
          : <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={() => enviar(true)}>{ocupado ? 'Confirmando...' : 'Confirmar venda'}</button>}
      </>}>
      <div className="space-y-4">
        <ol className="flex gap-2 text-xs font-semibold" aria-label="Etapas">
          <li className={`flex-1 rounded-lg px-3 py-2 ${passo === 1 ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-700'}`} aria-current={passo === 1 ? 'step' : undefined}>1. Itens</li>
          <li className={`flex-1 rounded-lg px-3 py-2 ${passo === 2 ? 'bg-orange-600 text-white' : 'bg-gray-50 text-gray-600'}`} aria-current={passo === 2 ? 'step' : undefined}>2. Cliente e pagamento</li>
        </ol>
        <Erro texto={erro} />
        {passo === 1 && (
          <>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" aria-hidden="true" />
              <input type="search" aria-label="Buscar produto ou serviço" placeholder="Buscar por nome, SKU ou código de barras..." value={busca} onChange={(e) => setBusca(e.target.value)} className={`${campo} pl-9`} />
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2" aria-label="Itens encontrados">
              {achados.map((p) => {
                const semSaldo = p.tipo === 'produto' && Number(p.estoque_atual) <= 0;
                return (
                  <li key={p.id}><button type="button" disabled={semSaldo} onClick={() => adicionar(p)} aria-label={`Adicionar ${p.nome}`}
                    className="w-full min-h-11 rounded-lg border border-gray-200 px-3 py-2 text-left flex items-center gap-2 hover:border-orange-400 disabled:opacity-50 disabled:cursor-not-allowed">
                    {p.tipo === 'servico' ? <Wrench className="w-4 h-4 text-purple-600 shrink-0" aria-hidden="true" /> : <Package className="w-4 h-4 text-blue-600 shrink-0" aria-hidden="true" />}
                    <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-gray-900 truncate">{p.nome}</span>
                      <span className="block text-xs text-gray-500">{formatarMoeda(p.preco_venda)}{p.tipo === 'produto' ? ` · ${semSaldo ? 'sem estoque' : `${formatarQuantidade(p.estoque_atual)} ${p.unidade} disponível`}` : ' · serviço'}</span></span>
                    <Plus className="w-4 h-4 text-orange-600 shrink-0" aria-hidden="true" />
                  </button></li>
                );
              })}
              {achados.length === 0 && <li className="text-sm text-gray-500 sm:col-span-2">Nenhum item ativo encontrado. Cadastre em Estoque.</li>}
            </ul>
            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-2">Carrinho ({itens.length})</h3>
              {itens.length === 0 ? <p className="text-sm text-gray-500 rounded-lg border border-dashed border-gray-300 p-4 text-center">Nenhum item adicionado.</p> : (
                <ul className="space-y-2" data-testid="carrinho">
                  {t.linhas.map((l, i) => (
                    <li key={l.id_produto} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-start gap-2">
                        <p className="flex-1 min-w-0 text-sm font-semibold text-gray-900 break-words">{l.nome}{l.tipo === 'produto' && <span className="block text-xs font-normal text-gray-500">Disponível: {formatarQuantidade(l.disponivel)} {l.unidade}</span>}</p>
                        <p className="text-sm font-bold whitespace-nowrap" data-testid={`total-item-${l.nome}`}>{formatarMoeda(l.totalCentavos / 100)}</p>
                        <button type="button" aria-label={`Remover ${l.nome}`} onClick={() => setItens((xs) => xs.filter((_, j) => j !== i))} className="w-11 h-11 -m-2 inline-flex items-center justify-center text-gray-500 hover:text-red-600"><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
                      </div>
                      <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-2 mt-2">
                        <div><label className="block text-xs text-gray-600 mb-1" htmlFor={`qtd-${i}`}>Quantidade ({l.unidade})</label>
                          <div className="flex"><button type="button" aria-label={`Diminuir ${l.nome}`} onClick={() => alterar(i, 'quantidade', String(Math.max(0, l.q - 1)).replace('.', ','))} className="w-10 h-11 border border-gray-300 rounded-l-lg inline-flex items-center justify-center"><Minus className="w-3.5 h-3.5" aria-hidden="true" /></button>
                            <input id={`qtd-${i}`} inputMode="decimal" value={l.quantidade} onChange={(e) => alterar(i, 'quantidade', mascaraQuantidade(e.target.value))} className="w-full min-w-0 h-11 px-2 border-y border-gray-300 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-500" />
                            <button type="button" aria-label={`Aumentar ${l.nome}`} onClick={() => alterar(i, 'quantidade', String(l.q + 1).replace('.', ','))} className="w-10 h-11 border border-gray-300 rounded-r-lg inline-flex items-center justify-center"><Plus className="w-3.5 h-3.5" aria-hidden="true" /></button></div></div>
                        <div><label className="block text-xs text-gray-600 mb-1" htmlFor={`preco-${i}`}>Preço unitário (R$)</label>
                          <input id={`preco-${i}`} inputMode="numeric" value={l.preco} onChange={(e) => alterar(i, 'preco', mascaraMoeda(e.target.value))} className={campo} /></div>
                        <div><label className="block text-xs text-gray-600 mb-1" htmlFor={`desc-${i}`}>Desconto (R$)</label>
                          <input id={`desc-${i}`} inputMode="numeric" placeholder="0,00" value={l.desconto} onChange={(e) => alterar(i, 'desconto', mascaraMoeda(e.target.value))} className={campo} /></div>
                      </div>
                      {l.tipo === 'produto' && l.q > l.disponivel && <p className="text-xs text-red-700 mt-1">Quantidade maior que o estoque disponível.</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
        {passo === 2 && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><label htmlFor="venda-cliente" className={rotulo}>Cliente (opcional)</label>
              <select id="venda-cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} className={campo}><option value="">Consumidor não identificado</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
            <div role="radiogroup" aria-label="Condição de pagamento" className="sm:col-span-2 grid grid-cols-2 gap-2">
              {([['a_vista', 'À vista'], ['a_prazo', 'A prazo']] as const).map(([v, r]) => (
                <button key={v} type="button" role="radio" aria-checked={condicao === v} onClick={() => { setCondicao(v); if (v === 'a_prazo') setRecebido(false); }}
                  className={`min-h-11 rounded-lg border text-sm font-semibold ${condicao === v ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600'}`}>{r}</button>
              ))}
            </div>
            <div><label htmlFor="venda-forma" className={rotulo}>Forma de pagamento</label>
              <select id="venda-forma" value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)} className={campo}>{Object.entries(FORMAS_PAGAMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            {condicao === 'a_prazo'
              ? <div><label htmlFor="venda-venc" className={rotulo}>Vencimento</label><input id="venda-venc" type="date" min={hojeBrasil()} value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={campo} /></div>
              : <div><label htmlFor="venda-desconto" className={rotulo}>Desconto na venda (R$)</label><input id="venda-desconto" inputMode="numeric" placeholder="0,00" value={desconto} onChange={(e) => setDesconto(mascaraMoeda(e.target.value))} className={campo} /></div>}
            {condicao === 'a_prazo' && <div><label htmlFor="venda-desconto" className={rotulo}>Desconto na venda (R$)</label><input id="venda-desconto" inputMode="numeric" placeholder="0,00" value={desconto} onChange={(e) => setDesconto(mascaraMoeda(e.target.value))} className={campo} /></div>}
            <div className="sm:col-span-2"><label htmlFor="venda-obs" className={rotulo}>Observações (opcional)</label>
              <input id="venda-obs" maxLength={1000} value={obs} onChange={(e) => setObs(e.target.value)} className={campo} /></div>
            {condicao === 'a_vista' && (
              <div className="sm:col-span-2 rounded-xl border border-gray-200 p-3 space-y-3">
                <label className="flex items-start gap-2 text-sm min-h-11 cursor-pointer">
                  <input type="checkbox" checked={recebido} onChange={(e) => setRecebido(e.target.checked)} className="mt-1 w-4 h-4 accent-orange-600" />
                  <span><strong>Pagamento já recebido e comprovado</strong><span className="block text-xs text-gray-500">Marque só se o dinheiro já entrou. Sem marcar, a venda fica em Contas a receber até a baixa.</span></span>
                </label>
                {recebido && <SeletorConta id="venda-conta" rotulo="Conta que recebeu" contas={contas} idConta={conta} aoMudar={setConta} valor={t.total > 0 ? t.total.toFixed(2) : null} natureza="entrada" />}
              </div>
            )}
          </div>
        )}
        <dl className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm space-y-1" data-testid="resumo-venda">
          <div className="flex justify-between"><dt className="text-gray-600">Subtotal</dt><dd>{formatarMoeda(t.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-600">Desconto da venda</dt><dd>− {formatarMoeda(lerValor(desconto))}</dd></div>
          <div className="flex justify-between text-base font-black"><dt>Total</dt><dd data-testid="total-venda">{formatarMoeda(t.total)}</dd></div>
        </dl>
      </div>
    </Modal>
  );
}

export function ModalRecebimento({ venda, contas, aoFechar, aoConcluir }: {
  venda: { id: string; numero: number; a_receber: number } | null; contas: ContaFinanceira[]; aoFechar: () => void; aoConcluir: (m: string) => void;
}) {
  const [valor, setValor] = useState('');
  const [data, setData] = useState('');
  const [conta, setConta] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (!venda) return;
    setValor(valorParaMascara(venda.a_receber)); setData(hojeBrasil()); setErro(null); setConta(contas.find((c) => c.principal && !c.arquivada_em)?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reinicia só ao abrir
  }, [venda]);
  if (!venda) return null;
  const v = paraDecimal(valor);
  const confirmar = async () => {
    if (!v) return setErro('Informe o valor recebido.');
    if (Number(v) > Number(venda.a_receber)) return setErro(`O valor passa do saldo a receber (${formatarMoeda(venda.a_receber)}).`);
    if (!data || data > hojeBrasil()) return setErro('A data não pode ser futura.');
    if (!conta) return setErro('Escolha a conta que recebeu.');
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('registrar_recebimento_venda', { p_id_venda: venda.id, p_valor: v, p_data: data, p_id_conta: conta });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível registrar o recebimento.'));
    aoConcluir(Number(v) < Number(venda.a_receber) ? 'Recebimento parcial registrado. O saldo continua em Contas a receber.' : 'Recebimento registrado. Venda concluída.');
  };
  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Registrar recebimento — venda ${numeroVenda(venda.numero)}`}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={confirmar}>{ocupado ? 'Registrando...' : 'Registrar recebimento'}</button></>}>
      <div className="space-y-4">
        <Erro texto={erro} />
        <p className="text-sm text-gray-600">Saldo a receber: <strong className="text-gray-900">{formatarMoeda(venda.a_receber)}</strong>. Pode receber uma parte; o restante continua pendente.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label htmlFor="rec-valor" className={rotulo}>Valor recebido (R$)</label><input id="rec-valor" inputMode="numeric" value={valor} onChange={(e) => setValor(mascaraMoeda(e.target.value))} className={campo} /></div>
          <div><label htmlFor="rec-data" className={rotulo}>Data do recebimento</label><input id="rec-data" type="date" max={hojeBrasil()} value={data} onChange={(e) => setData(e.target.value)} className={campo} /></div>
        </div>
        <SeletorConta id="rec-conta" rotulo="Conta que recebeu" contas={contas} idConta={conta} aoMudar={setConta} valor={v} natureza="entrada" />
      </div>
    </Modal>
  );
}

export function ModalCancelarVenda({ venda, aoFechar, aoConcluir }: {
  venda: { id: string; numero: number; recebido: number; situacao: string } | null; aoFechar: () => void; aoConcluir: (m: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setMotivo(''); setErro(null); }, [venda]);
  if (!venda) return null;
  const confirmar = async () => {
    if (motivo.trim().length < 3) return setErro('Informe o motivo do cancelamento.');
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('cancelar_venda', { p_id_venda: venda.id, p_motivo: motivo });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível cancelar a venda.'));
    aoConcluir('Venda cancelada. Estoque devolvido e contas a receber canceladas; o histórico foi mantido.');
  };
  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Cancelar venda ${numeroVenda(venda.numero)}`}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Voltar</button>
        <button type="button" className={classeBotaoPerigo} disabled={ocupado || venda.recebido > 0} onClick={confirmar}>{ocupado ? 'Cancelando...' : 'Cancelar venda'}</button></>}>
      <div className="space-y-4">
        <Erro texto={erro} />
        {venda.recebido > 0 ? (
          <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Esta venda tem {formatarMoeda(venda.recebido)} recebido. Para cancelar, estorne antes o(s) recebimento(s) em Financeiro → Contas a receber (ou registre a devolução do dinheiro). Assim o caixa fica correto.
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-600">{venda.situacao === 'rascunho' ? 'O rascunho será descartado.' : 'Os produtos voltam ao estoque (estorno registrado) e a conta a receber desta venda é cancelada. Nada é apagado do histórico.'}</p>
            <div><label htmlFor="canc-motivo" className={rotulo}>Motivo</label><input id="canc-motivo" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo} placeholder="Ex.: cliente desistiu" /></div>
          </>
        )}
      </div>
    </Modal>
  );
}
