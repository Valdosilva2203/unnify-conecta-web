'use client';

import { useEffect, useRef, useState } from 'react';
import { Minus, Package, Plus, Search, Trash2, Wrench } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro, UFS } from '@/lib/contabil';
import { formatarData, formatarMoeda, hojeBrasil, mascaraMoeda, paraDecimal, valorParaMascara, type ContaFinanceira } from '@/lib/financeiro';
import { documentoValido, mascaraDocumento, mascaraTelefone } from '@/lib/clientes';
import { FORMAS_PAGAMENTO, formatarQuantidade, mascaraQuantidade, paraQuantidade, totaisCarrinho, type FormaPagamento, type ItemCarrinho, type Produto } from '@/lib/estoque-vendas';
import { nomeFornecedor, type FornecedorCompleto } from '@/lib/compras';
import { Modal, classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { SeletorConta } from '@/components/financeiro/SeletorConta';
import { enviarComprovante } from '@/components/financeiro/FormLancamento';
import { ARQUIVOS_COMPROVANTE, TAMANHO_MAXIMO_COMPROVANTE } from '@/lib/financeiro';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';
function Erro({ texto }: { texto: string | null }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (texto) ref.current?.scrollIntoView({ block: 'nearest' }); }, [texto]);
  return texto ? <p ref={ref} role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{texto}</p> : null;
}
const lerValor = (t: string) => Number(paraDecimal(t) ?? 0);

// ===== Fornecedor =====
export function ModalFornecedor({ aberto, aoFechar, idEmpresa, fornecedor, aoSalvar }: {
  aberto: boolean; aoFechar: () => void; idEmpresa: string; fornecedor: FornecedorCompleto | null; aoSalvar: (m: string, id: string) => void;
}) {
  const [tipo, setTipo] = useState<'pf' | 'pj'>('pj');
  const [f, setF] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => {
    if (!aberto) return;
    const x = fornecedor;
    setErro(null); setTipo(x?.tipo_pessoa ?? 'pj');
    setF({ nome: x?.nome ?? '', fantasia: x?.nome_fantasia ?? '', documento: x?.documento ? mascaraDocumento(x.tipo_pessoa, x.documento) : '', telefone: x?.telefone ? mascaraTelefone(x.telefone) : '',
      email: x?.email ?? '', endereco: x?.endereco ?? '', cidade: x?.cidade ?? '', estado: x?.estado ?? '', obs: x?.observacoes ?? '', status: x?.status ?? 'ativo' });
  }, [aberto, fornecedor]);
  const salvar = async () => {
    if ((f.nome ?? '').trim().length < 2) return setErro(tipo === 'pj' ? 'Informe a razão social.' : 'Informe o nome.');
    if (f.documento && !documentoValido(tipo, f.documento)) return setErro(tipo === 'pf' ? 'CPF inválido.' : 'CNPJ inválido.');
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return setErro('E-mail inválido.');
    setOcupado(true); setErro(null);
    const { data, error } = await createClient().rpc('salvar_fornecedor', {
      p_id: fornecedor?.id ?? null, p_id_empresa: idEmpresa, p_tipo_pessoa: tipo, p_nome: f.nome, p_nome_fantasia: tipo === 'pj' ? f.fantasia || null : null, p_documento: f.documento || null,
      p_telefone: f.telefone || null, p_email: f.email || null, p_endereco: f.endereco || null, p_cidade: f.cidade || null, p_estado: f.estado || null, p_observacoes: f.obs || null, p_status: f.status,
    });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar o fornecedor.'));
    aoSalvar(fornecedor ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.', data as string);
  };
  const input = (k: string, label: string, props: Record<string, unknown> = {}, mascara?: (v: string) => string) => (
    <div><label htmlFor={`forn-${k}`} className={rotulo}>{label}</label>
      <input id={`forn-${k}`} value={f[k] ?? ''} onChange={(e) => set(k, mascara ? mascara(e.target.value) : e.target.value)} className={campo} {...props} /></div>
  );
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={fornecedor ? 'Editar fornecedor' : 'Novo fornecedor'}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={salvar}>{ocupado ? 'Salvando...' : 'Salvar'}</button></>}>
      <div className="space-y-4">
        <Erro texto={erro} />
        <div role="radiogroup" aria-label="Tipo de pessoa" className="flex gap-2">
          {(['pj', 'pf'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => { setTipo(t); set('documento', ''); }}
              className={`flex-1 min-h-11 rounded-lg border text-sm font-semibold ${tipo === t ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600'}`}>{t === 'pj' ? 'Pessoa jurídica' : 'Pessoa física'}</button>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">{input('nome', tipo === 'pj' ? 'Razão social' : 'Nome completo', { maxLength: 150 })}</div>
          {tipo === 'pj' && input('fantasia', 'Nome fantasia (opcional)', { maxLength: 150 })}
          {input('documento', tipo === 'pj' ? 'CNPJ (opcional)' : 'CPF (opcional)', { inputMode: 'numeric' }, (v) => mascaraDocumento(tipo, v))}
          {input('telefone', 'Telefone', { inputMode: 'tel' }, mascaraTelefone)}
          {input('email', 'E-mail', { type: 'email', maxLength: 254 })}
          <div className="sm:col-span-2">{input('endereco', 'Endereço (opcional)', { maxLength: 300 })}</div>
          {input('cidade', 'Cidade', { maxLength: 100 })}
          <div><label htmlFor="forn-estado" className={rotulo}>UF</label>
            <select id="forn-estado" value={f.estado ?? ''} onChange={(e) => set('estado', e.target.value)} className={campo}><option value="">—</option>{UFS.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
          <div className="sm:col-span-2"><label htmlFor="forn-obs" className={rotulo}>Observações (opcional)</label>
            <textarea id="forn-obs" rows={2} maxLength={1000} value={f.obs ?? ''} onChange={(e) => set('obs', e.target.value)} className={`${campo} h-auto py-2`} /></div>
          {fornecedor && <div><label htmlFor="forn-status" className={rotulo}>Situação</label>
            <select id="forn-status" value={f.status} onChange={(e) => set('status', e.target.value)} className={campo}><option value="ativo">Ativo</option><option value="inativo">Inativo (mantém o histórico)</option></select></div>}
        </div>
      </div>
    </Modal>
  );
}

// ===== Nova compra (itens → fornecedor e pagamento) =====
export interface RascunhoCompra {
  id: string; id_fornecedor: string | null; condicao: 'a_vista' | 'a_prazo'; forma_pagamento: FormaPagamento; parcelas: number; primeiro_vencimento: string | null;
  previsao_entrega: string | null; desconto: number; frete: number; observacoes: string | null; itens: ItemCarrinho[];
}
export function ModalNovaCompra({ aberto, aoFechar, idEmpresa, contas, rascunho, aoConcluir }: {
  aberto: boolean; aoFechar: () => void; idEmpresa: string; contas: ContaFinanceira[]; rascunho: RascunhoCompra | null; aoConcluir: (m: string, id: string) => void;
}) {
  const [passo, setPasso] = useState<1 | 2>(1);
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<Produto[]>([]);
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([]);
  const [fornecedor, setFornecedor] = useState('');
  const [condicao, setCondicao] = useState<'a_vista' | 'a_prazo'>('a_vista');
  const [forma, setForma] = useState<FormaPagamento>('pix');
  const [parcelas, setParcelas] = useState('1');
  const [vencimento, setVencimento] = useState('');
  const [previsao, setPrevisao] = useState('');
  const [desconto, setDesconto] = useState('');
  const [frete, setFrete] = useState('');
  const [obs, setObs] = useState('');
  const [pago, setPago] = useState(false);
  const [conta, setConta] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const chave = useRef('');

  useEffect(() => {
    if (!aberto) return;
    const r = rascunho;
    setPasso(1); setItens(r?.itens ?? []); setBusca(''); setFornecedor(r?.id_fornecedor ?? ''); setCondicao(r?.condicao ?? 'a_vista'); setForma(r?.forma_pagamento ?? 'pix');
    setParcelas(String(r?.parcelas ?? 1)); setVencimento(r?.primeiro_vencimento ?? ''); setPrevisao(r?.previsao_entrega ?? ''); setDesconto(r?.desconto ? valorParaMascara(r.desconto) : '');
    setFrete(r?.frete ? valorParaMascara(r.frete) : ''); setObs(r?.observacoes ?? ''); setPago(false); setConta(contas.find((c) => c.principal && !c.arquivada_em)?.id ?? ''); setErro(null);
    chave.current = crypto.randomUUID(); // repetir o envio devolve a mesma compra
    createClient().from('fornecedores').select('id, nome, nome_fantasia').eq('id_empresa', idEmpresa).eq('status', 'ativo').order('nome').limit(1000)
      .then(({ data }) => setFornecedores((data ?? []).map((x) => ({ id: x.id as string, nome: nomeFornecedor(x as { nome: string; nome_fantasia: string | null }) }))));
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
  const total = t.total + lerValor(frete);
  const nParc = condicao === 'a_prazo' ? Math.max(1, Math.min(24, Number(parcelas) || 1)) : 1;
  const alterar = (i: number, k: keyof ItemCarrinho, v: string) => setItens((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const adicionar = (p: Produto) => {
    setErro(null);
    setItens((xs) => {
      const j = xs.findIndex((x) => x.id_produto === p.id);
      if (j >= 0) return xs.map((x, k) => (k === j ? { ...x, quantidade: String((paraQuantidade(x.quantidade) ?? 0) + 1).replace('.', ',') } : x));
      return [...xs, { id_produto: p.id, tipo: p.tipo, nome: p.nome, unidade: p.unidade, disponivel: Number(p.estoque_atual), quantidade: '1', preco: valorParaMascara(p.custo), desconto: '' }];
    });
  };
  const passo1Ok = () => {
    if (itens.length === 0) return 'Adicione ao menos um produto ou serviço.';
    for (const l of t.linhas) {
      if (l.q <= 0) return `Quantidade inválida em "${l.nome}".`;
      if (l.totalCentavos < 0) return `O desconto de "${l.nome}" é maior que o valor do item.`;
    }
    if (t.total < 0) return 'O desconto da compra é maior que o subtotal.';
    return null;
  };
  const enviar = async (confirmar: boolean) => {
    const e1 = passo1Ok();
    if (e1) { setPasso(1); return setErro(e1); }
    if (confirmar && total <= 0) return setErro('O total da compra deve ser maior que zero.');
    if (condicao === 'a_prazo' && (!vencimento || vencimento < hojeBrasil())) return setErro('Informe o primeiro vencimento (a partir de hoje).');
    if (confirmar && pago && !conta) return setErro('Escolha a conta usada no pagamento.');
    setOcupado(true); setErro(null);
    const { data, error } = await createClient().rpc('salvar_compra', {
      p_id: rascunho?.id ?? null, p_id_empresa: idEmpresa, p_id_fornecedor: fornecedor || null,
      p_itens: t.linhas.map((l) => ({ id_produto: l.id_produto, quantidade: l.q, preco_unitario: lerValor(l.preco), desconto: lerValor(l.desconto) })),
      p_desconto: lerValor(desconto), p_frete: lerValor(frete), p_condicao: condicao, p_forma_pagamento: forma, p_parcelas: nParc,
      p_primeiro_vencimento: condicao === 'a_prazo' ? vencimento : null, p_previsao_entrega: previsao || null, p_observacoes: obs || null,
      p_confirmar: confirmar, p_pago: confirmar && condicao === 'a_vista' && pago, p_id_conta: confirmar && pago ? conta : null, p_chave: confirmar ? chave.current : null,
    });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar a compra.'));
    aoConcluir(!confirmar ? 'Rascunho salvo (sem conta a pagar nem estoque).' : pago ? 'Compra registrada e pagamento lançado. O estoque entra no recebimento.' : 'Compra registrada. Contas a pagar geradas; o estoque entra no recebimento.', data as string);
  };

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={rascunho ? 'Continuar rascunho' : 'Nova compra'} tamanho="lg"
      rodape={<>
        <button type="button" className={classeBotaoSecundario} onClick={passo === 1 ? aoFechar : () => setPasso(1)}>{passo === 1 ? 'Cancelar' : 'Voltar'}</button>
        <button type="button" className={classeBotaoSecundario} disabled={ocupado} onClick={() => enviar(false)}>Salvar rascunho</button>
        {passo === 1
          ? <button type="button" className={classeBotaoPrimario} onClick={() => { const e = passo1Ok(); setErro(e); if (!e) setPasso(2); }}>Continuar</button>
          : <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={() => enviar(true)}>{ocupado ? 'Registrando...' : 'Registrar compra'}</button>}
      </>}>
      <div className="space-y-4">
        <ol className="flex gap-2 text-xs font-semibold" aria-label="Etapas">
          <li className={`flex-1 rounded-lg px-3 py-2 ${passo === 1 ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-700'}`} aria-current={passo === 1 ? 'step' : undefined}>1. Itens</li>
          <li className={`flex-1 rounded-lg px-3 py-2 ${passo === 2 ? 'bg-orange-600 text-white' : 'bg-gray-50 text-gray-600'}`} aria-current={passo === 2 ? 'step' : undefined}>2. Fornecedor e pagamento</li>
        </ol>
        <Erro texto={erro} />
        {passo === 1 && (
          <>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" aria-hidden="true" />
              <input type="search" aria-label="Buscar produto ou serviço" placeholder="Buscar no catálogo do Estoque por nome, SKU ou código de barras..." value={busca} onChange={(e) => setBusca(e.target.value)} className={`${campo} pl-9`} />
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2" aria-label="Itens encontrados">
              {achados.map((p) => (
                <li key={p.id}><button type="button" onClick={() => adicionar(p)} aria-label={`Adicionar ${p.nome}`}
                  className="w-full min-h-11 rounded-lg border border-gray-200 px-3 py-2 text-left flex items-center gap-2 hover:border-orange-400">
                  {p.tipo === 'servico' ? <Wrench className="w-4 h-4 text-purple-600 shrink-0" aria-hidden="true" /> : <Package className="w-4 h-4 text-blue-600 shrink-0" aria-hidden="true" />}
                  <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-gray-900 truncate">{p.nome}</span>
                    <span className="block text-xs text-gray-500">Custo {formatarMoeda(p.custo)}{p.tipo === 'produto' ? ` · estoque ${formatarQuantidade(p.estoque_atual)} ${p.unidade}` : ' · serviço'}</span></span>
                  <Plus className="w-4 h-4 text-orange-600 shrink-0" aria-hidden="true" />
                </button></li>
              ))}
              {achados.length === 0 && <li className="text-sm text-gray-500 sm:col-span-2">Nenhum item ativo encontrado. Cadastre em Estoque.</li>}
            </ul>
            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-2">Itens da compra ({itens.length})</h3>
              {itens.length === 0 ? <p className="text-sm text-gray-500 rounded-lg border border-dashed border-gray-300 p-4 text-center">Nenhum item adicionado.</p> : (
                <ul className="space-y-2" data-testid="itens-compra-form">
                  {t.linhas.map((l, i) => (
                    <li key={l.id_produto} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-start gap-2">
                        <p className="flex-1 min-w-0 text-sm font-semibold text-gray-900 break-words">{l.nome}<span className="block text-xs font-normal text-gray-500">{l.tipo === 'servico' ? 'Serviço (sem estoque)' : 'Produto'}</span></p>
                        <p className="text-sm font-bold whitespace-nowrap" data-testid={`total-item-${l.nome}`}>{formatarMoeda(l.totalCentavos / 100)}</p>
                        <button type="button" aria-label={`Remover ${l.nome}`} onClick={() => setItens((xs) => xs.filter((_, j) => j !== i))} className="w-11 h-11 -m-2 inline-flex items-center justify-center text-gray-500 hover:text-red-600"><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
                      </div>
                      <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-2 mt-2">
                        <div><label className="block text-xs text-gray-600 mb-1" htmlFor={`cqtd-${i}`}>Quantidade ({l.unidade})</label>
                          <div className="flex"><button type="button" aria-label={`Diminuir ${l.nome}`} onClick={() => alterar(i, 'quantidade', String(Math.max(0, l.q - 1)).replace('.', ','))} className="w-10 h-11 border border-gray-300 rounded-l-lg inline-flex items-center justify-center"><Minus className="w-3.5 h-3.5" aria-hidden="true" /></button>
                            <input id={`cqtd-${i}`} inputMode="decimal" value={l.quantidade} onChange={(e) => alterar(i, 'quantidade', mascaraQuantidade(e.target.value))} className="w-full min-w-0 h-11 px-2 border-y border-gray-300 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-500" />
                            <button type="button" aria-label={`Aumentar ${l.nome}`} onClick={() => alterar(i, 'quantidade', String(l.q + 1).replace('.', ','))} className="w-10 h-11 border border-gray-300 rounded-r-lg inline-flex items-center justify-center"><Plus className="w-3.5 h-3.5" aria-hidden="true" /></button></div></div>
                        <div><label className="block text-xs text-gray-600 mb-1" htmlFor={`cpreco-${i}`}>Preço unitário (R$)</label>
                          <input id={`cpreco-${i}`} inputMode="numeric" value={l.preco} onChange={(e) => alterar(i, 'preco', mascaraMoeda(e.target.value))} className={campo} /></div>
                        <div><label className="block text-xs text-gray-600 mb-1" htmlFor={`cdesc-${i}`}>Desconto (R$)</label>
                          <input id={`cdesc-${i}`} inputMode="numeric" placeholder="0,00" value={l.desconto} onChange={(e) => alterar(i, 'desconto', mascaraMoeda(e.target.value))} className={campo} /></div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
        {passo === 2 && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><label htmlFor="compra-fornecedor" className={rotulo}>Fornecedor</label>
              <select id="compra-fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} className={campo}><option value="">Sem fornecedor cadastrado</option>{fornecedores.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></div>
            <div role="radiogroup" aria-label="Condição de pagamento" className="sm:col-span-2 grid grid-cols-2 gap-2">
              {([['a_vista', 'À vista'], ['a_prazo', 'A prazo']] as const).map(([v, r]) => (
                <button key={v} type="button" role="radio" aria-checked={condicao === v} onClick={() => { setCondicao(v); if (v === 'a_prazo') setPago(false); }}
                  className={`min-h-11 rounded-lg border text-sm font-semibold ${condicao === v ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600'}`}>{r}</button>
              ))}
            </div>
            <div><label htmlFor="compra-forma" className={rotulo}>Forma de pagamento</label>
              <select id="compra-forma" value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)} className={campo}>{Object.entries(FORMAS_PAGAMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            {condicao === 'a_prazo' && <>
              <div><label htmlFor="compra-parcelas" className={rotulo}>Parcelas</label>
                <select id="compra-parcelas" value={parcelas} onChange={(e) => setParcelas(e.target.value)} className={campo}>{Array.from({ length: 24 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}x</option>)}</select></div>
              <div><label htmlFor="compra-venc" className={rotulo}>Primeiro vencimento</label><input id="compra-venc" type="date" min={hojeBrasil()} value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={campo} /></div>
            </>}
            <div><label htmlFor="compra-previsao" className={rotulo}>Previsão de entrega (opcional)</label><input id="compra-previsao" type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} className={campo} /></div>
            <div><label htmlFor="compra-desconto" className={rotulo}>Desconto na compra (R$)</label><input id="compra-desconto" inputMode="numeric" placeholder="0,00" value={desconto} onChange={(e) => setDesconto(mascaraMoeda(e.target.value))} className={campo} /></div>
            <div><label htmlFor="compra-frete" className={rotulo}>Frete (R$)</label><input id="compra-frete" inputMode="numeric" placeholder="0,00" value={frete} onChange={(e) => setFrete(mascaraMoeda(e.target.value))} className={campo} /></div>
            <div className="sm:col-span-2"><label htmlFor="compra-obs" className={rotulo}>Observações (opcional)</label>
              <input id="compra-obs" maxLength={1000} value={obs} onChange={(e) => setObs(e.target.value)} className={campo} /></div>
            {condicao === 'a_vista' && (
              <div className="sm:col-span-2 rounded-xl border border-gray-200 p-3 space-y-3">
                <label className="flex items-start gap-2 text-sm min-h-11 cursor-pointer">
                  <input type="checkbox" checked={pago} onChange={(e) => setPago(e.target.checked)} className="mt-1 w-4 h-4 accent-orange-600" />
                  <span><strong>Pagamento já feito e comprovado</strong><span className="block text-xs text-gray-500">Sem marcar, o valor fica em Contas a pagar até a baixa. Registrar a compra não é pagar.</span></span>
                </label>
                {pago && <SeletorConta id="compra-conta" rotulo="Conta usada no pagamento" contas={contas} idConta={conta} aoMudar={setConta} valor={total > 0 ? total.toFixed(2) : null} natureza="saida" />}
              </div>
            )}
          </div>
        )}
        <dl className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm space-y-1" data-testid="resumo-compra">
          <div className="flex justify-between"><dt className="text-gray-600">Subtotal</dt><dd>{formatarMoeda(t.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-600">Desconto</dt><dd>− {formatarMoeda(lerValor(desconto))}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-600">Frete</dt><dd>{formatarMoeda(lerValor(frete))}</dd></div>
          <div className="flex justify-between text-base font-black"><dt>Total</dt><dd data-testid="total-compra">{formatarMoeda(total)}</dd></div>
          {condicao === 'a_prazo' && nParc > 1 && total > 0 && <p className="text-xs text-gray-500 text-right">{nParc}x de cerca de {formatarMoeda(Math.floor((total / nParc) * 100) / 100)}</p>}
        </dl>
      </div>
    </Modal>
  );
}

// ===== Recebimento de mercadorias =====
export interface ItemParaReceber { id: string; descricao: string; tipo: 'produto' | 'servico'; unidade: string; quantidade: number; quantidade_recebida: number }
export function ModalReceberCompra({ compra, itens, aoFechar, aoConcluir }: {
  compra: { id: string; numero: number; data_compra: string } | null; itens: ItemParaReceber[]; aoFechar: () => void; aoConcluir: (m: string) => void;
}) {
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [data, setData] = useState('');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const chave = useRef('');
  useEffect(() => {
    if (!compra) return;
    setQtd(Object.fromEntries(itens.map((i) => [i.id, String(Math.max(0, Number(i.quantidade) - Number(i.quantidade_recebida))).replace('.', ',')])));
    setData(hojeBrasil()); setObs(''); setErro(null); chave.current = crypto.randomUUID();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reinicia só ao abrir
  }, [compra]);
  if (!compra) return null;
  const confirmar = async () => {
    const lista: { id_item: string; quantidade: number }[] = [];
    for (const i of itens) {
      const pend = Number(i.quantidade) - Number(i.quantidade_recebida);
      const q = paraQuantidade(qtd[i.id] || '0');
      if (q === null) return setErro(`Quantidade inválida em "${i.descricao}".`);
      if (q > pend) return setErro(`Recebimento maior que o pendente em "${i.descricao}" (pendente ${formatarQuantidade(pend)}).`);
      if (q > 0) lista.push({ id_item: i.id, quantidade: q });
    }
    if (lista.length === 0) return setErro('Informe ao menos uma quantidade recebida.');
    if (!data || data > hojeBrasil() || data < compra.data_compra) return setErro('Data de recebimento inválida (entre a compra e hoje).');
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('registrar_recebimento_compra', { p_id_compra: compra.id, p_itens: lista, p_data: data, p_observacoes: obs || null, p_chave: chave.current });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível registrar o recebimento.'));
    const total = lista.every((l) => { const i = itens.find((x) => x.id === l.id_item)!; return l.quantidade === Number(i.quantidade) - Number(i.quantidade_recebida); })
      && itens.every((i) => Number(i.quantidade) === Number(i.quantidade_recebida) || lista.some((l) => l.id_item === i.id));
    aoConcluir(total ? 'Recebimento registrado: compra totalmente recebida e estoque atualizado.' : 'Recebimento parcial registrado e estoque atualizado.');
  };
  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Receber itens da compra #${String(compra.numero).padStart(6, '0')}`} descricao="Informe as quantidades recebidas. Só elas entram no estoque." tamanho="lg"
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={confirmar}>{ocupado ? 'Registrando...' : 'Confirmar recebimento'}</button></>}>
      <div className="space-y-4">
        <Erro texto={erro} />
        <ul className="divide-y divide-gray-100" data-testid="itens-receber">
          {itens.map((i) => {
            const pend = Number(i.quantidade) - Number(i.quantidade_recebida);
            return (
              <li key={i.id} className="py-2 grid grid-cols-1 min-[420px]:grid-cols-[minmax(0,1fr)_8rem] gap-2 items-center">
                <div className="min-w-0"><p className="text-sm font-semibold text-gray-900 break-words">{i.descricao}</p>
                  <p className="text-xs text-gray-500">Comprado {formatarQuantidade(i.quantidade)} · já recebido {formatarQuantidade(i.quantidade_recebida)} · pendente {formatarQuantidade(pend)} {i.unidade}{i.tipo === 'servico' ? ' · serviço (sem estoque)' : ''}</p></div>
                <div><label htmlFor={`rec-${i.id}`} className="sr-only">Receber agora: {i.descricao}</label>
                  <input id={`rec-${i.id}`} inputMode="decimal" disabled={pend <= 0} value={qtd[i.id] ?? ''} onChange={(e) => setQtd((x) => ({ ...x, [i.id]: mascaraQuantidade(e.target.value) }))} className={`${campo} disabled:bg-gray-50`} /></div>
              </li>
            );
          })}
        </ul>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label htmlFor="rec-data" className={rotulo}>Data de recebimento</label><input id="rec-data" type="date" min={compra.data_compra} max={hojeBrasil()} value={data} onChange={(e) => setData(e.target.value)} className={campo} /></div>
          <div><label htmlFor="rec-obs" className={rotulo}>Observações (opcional)</label><input id="rec-obs" maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} className={campo} placeholder="Ex.: recebimento parcial conforme nota" /></div>
        </div>
      </div>
    </Modal>
  );
}

// ===== Pagamento (integral ou parcial) de uma conta a pagar =====
export function ModalPagarCompra({ conta: lanc, idEmpresa, contas, aoFechar, aoConcluir }: {
  idEmpresa: string; conta: { id: string; descricao: string; valor: number; data_vencimento: string | null } | null; contas: ContaFinanceira[]; aoFechar: () => void; aoConcluir: (m: string) => void;
}) {
  const [valor, setValor] = useState('');
  const [data, setData] = useState('');
  const [idConta, setIdConta] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (!lanc) return;
    setValor(valorParaMascara(lanc.valor)); setData(hojeBrasil()); setErro(null); setArquivo(null); setIdConta(contas.find((c) => c.principal && !c.arquivada_em)?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reinicia só ao abrir
  }, [lanc]);
  if (!lanc) return null;
  const v = paraDecimal(valor);
  const confirmar = async () => {
    if (!v) return setErro('Informe o valor pago.');
    if (Number(v) > Number(lanc.valor)) return setErro(`O valor passa do saldo desta conta (${formatarMoeda(lanc.valor)}).`);
    if (!data || data > hojeBrasil()) return setErro('A data não pode ser futura.');
    if (!idConta) return setErro('Escolha a conta usada no pagamento.');
    if (arquivo && (!ARQUIVOS_COMPROVANTE.includes(arquivo.type) || arquivo.size > TAMANHO_MAXIMO_COMPROVANTE)) return setErro('Comprovante: PDF, JPG, PNG ou WebP até 10 MB.');
    setOcupado(true); setErro(null);
    const { data: idPago, error } = await createClient().rpc('registrar_pagamento_compra', { p_id_lancamento: lanc.id, p_valor: v, p_data: data, p_id_conta: idConta });
    if (error) { setOcupado(false); return setErro(mensagemDeErro(error, 'Não foi possível registrar o pagamento.')); }
    // Comprovante do pagamento feito (anexo do lançamento pago, mesmo armazenamento protegido do Financeiro)
    const falhaAnexo = arquivo && idPago ? await enviarComprovante(idEmpresa, idPago as string, arquivo) : null;
    setOcupado(false);
    aoConcluir(`${Number(v) < Number(lanc.valor) ? 'Pagamento parcial registrado. O restante continua em Contas a pagar.' : 'Pagamento registrado.'}${falhaAnexo ? ` Atenção: o comprovante não foi anexado (${falhaAnexo}) — anexe pelo Financeiro.` : arquivo ? ' Comprovante anexado.' : ''}`);
  };
  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Registrar pagamento — ${lanc.descricao}`}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={confirmar}>{ocupado ? 'Registrando...' : 'Registrar pagamento'}</button></>}>
      <div className="space-y-4">
        <Erro texto={erro} />
        <p className="text-sm text-gray-600">Saldo desta conta: <strong className="text-gray-900">{formatarMoeda(lanc.valor)}</strong>{lanc.data_vencimento ? ` · vence ${formatarData(lanc.data_vencimento)}` : ''}. Pode pagar uma parte.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label htmlFor="pag-valor" className={rotulo}>Valor pago (R$)</label><input id="pag-valor" inputMode="numeric" value={valor} onChange={(e) => setValor(mascaraMoeda(e.target.value))} className={campo} /></div>
          <div><label htmlFor="pag-data" className={rotulo}>Data do pagamento</label><input id="pag-data" type="date" max={hojeBrasil()} value={data} onChange={(e) => setData(e.target.value)} className={campo} /></div>
        </div>
        <SeletorConta id="pag-conta" rotulo="Conta usada no pagamento" contas={contas} idConta={idConta} aoMudar={setIdConta} valor={v} natureza="saida" />
        <div><label htmlFor="pag-comprovante" className={rotulo}>Comprovante do pagamento (opcional)</label>
          <input id="pag-comprovante" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:min-h-11 file:px-3 file:rounded-lg file:border-0 file:bg-gray-100 file:font-semibold" />
          <p className="text-xs text-gray-500 mt-1">Ex.: comprovante do Pix ou do boleto. Fica anexado ao lançamento no Financeiro. O recibo de quitação é do fornecedor.</p></div>
      </div>
    </Modal>
  );
}

// ===== Motivo (cancelar compra / estornar recebimento) =====
export function ModalMotivo({ alvo, aoFechar, aoConcluir }: {
  alvo: { tipo: 'cancelar' | 'estornar'; id: string; titulo: string; bloqueio?: string | null; aviso: string } | null; aoFechar: () => void; aoConcluir: (m: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setMotivo(''); setErro(null); }, [alvo]);
  if (!alvo) return null;
  const confirmar = async () => {
    if (motivo.trim().length < 3) return setErro('Informe o motivo.');
    setOcupado(true); setErro(null);
    const { error } = alvo.tipo === 'cancelar'
      ? await createClient().rpc('cancelar_compra', { p_id_compra: alvo.id, p_motivo: motivo })
      : await createClient().rpc('estornar_recebimento_compra', { p_id_recebimento: alvo.id, p_motivo: motivo });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, alvo.tipo === 'cancelar' ? 'Não foi possível cancelar a compra.' : 'Não foi possível estornar o recebimento.'));
    aoConcluir(alvo.tipo === 'cancelar' ? 'Compra cancelada. Contas a pagar pendentes canceladas; o histórico foi mantido.' : 'Recebimento estornado: o estoque foi corrigido e o histórico mantido.');
  };
  const botao = alvo.tipo === 'cancelar' ? 'Cancelar compra' : 'Estornar recebimento';
  return (
    <Modal aberto aoFechar={aoFechar} titulo={alvo.titulo}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Voltar</button>
        <button type="button" className={classeBotaoPerigo} disabled={ocupado || !!alvo.bloqueio} onClick={confirmar}>{ocupado ? 'Processando...' : botao}</button></>}>
      <div className="space-y-4">
        <Erro texto={erro} />
        {alvo.bloqueio ? <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{alvo.bloqueio}</p> : (
          <>
            <p className="text-sm text-gray-600">{alvo.aviso}</p>
            <div><label htmlFor="motivo" className={rotulo}>Motivo</label><input id="motivo" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo} /></div>
          </>
        )}
      </div>
    </Modal>
  );
}
