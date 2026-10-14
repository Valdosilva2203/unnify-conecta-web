'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarMoeda, mascaraMoeda, paraDecimal, valorParaMascara } from '@/lib/financeiro';
import { formatarQuantidade, mascaraQuantidade, paraQuantidade, type ProdutoCompleto, type TipoItem } from '@/lib/estoque-vendas';
import { Modal, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';
const UNIDADES = ['un', 'kg', 'g', 'l', 'ml', 'm', 'm²', 'cx', 'pct', 'par', 'h', 'serv'];
function Erro({ texto }: { texto: string | null }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (texto) ref.current?.scrollIntoView({ block: 'nearest' }); }, [texto]);
  return texto ? <p ref={ref} role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{texto}</p> : null;
}
const decimalOuZero = (t: string) => (t.trim() ? paraDecimal(t) ?? (/^[0,.]+$/.test(t) ? '0' : null) : '0');

export function ModalProduto({ aberto, aoFechar, idEmpresa, produto, categorias, aoSalvar }: {
  aberto: boolean; aoFechar: () => void; idEmpresa: string; produto: ProdutoCompleto | null; categorias: string[]; aoSalvar: (m: string, id: string) => void;
}) {
  const [tipo, setTipo] = useState<TipoItem>('produto');
  const [f, setF] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!aberto) return;
    const p = produto;
    setErro(null); setTipo(p?.tipo ?? 'produto');
    setF({
      nome: p?.nome ?? '', descricao: p?.descricao ?? '', sku: p?.sku ?? '', barras: p?.codigo_barras ?? '', categoria: p?.categoria ?? '', unidade: p?.unidade ?? 'un',
      custo: p ? valorParaMascara(p.custo) : '', preco: p ? valorParaMascara(p.preco_venda) : '', minimo: p ? String(p.estoque_minimo).replace('.', ',') : '0',
      inicial: '', status: p?.status ?? 'ativo',
    });
  }, [aberto, produto]);

  const custo = decimalOuZero(f.custo ?? '');
  const preco = decimalOuZero(f.preco ?? '');
  const margem = custo && preco && Number(preco) > 0 ? Math.round(((Number(preco) - Number(custo)) / Number(preco)) * 1000) / 10 : null;

  const salvar = async () => {
    if ((f.nome ?? '').trim().length < 2) return setErro('Informe o nome (mínimo 2 caracteres).');
    if (preco === null || custo === null) return setErro('Informe custo e preço válidos.');
    if (f.barras && !/^\d{6,20}$/.test(f.barras.trim())) return setErro('Código de barras: só números (6 a 20).');
    const minimo = tipo === 'servico' ? 0 : paraQuantidade(f.minimo || '0');
    const inicial = tipo === 'servico' || produto ? 0 : paraQuantidade(f.inicial || '0');
    if (minimo === null || inicial === null) return setErro('Quantidades inválidas (até 3 casas decimais).');
    setOcupado(true); setErro(null);
    const { data, error } = await createClient().rpc('salvar_produto', {
      p_id: produto?.id ?? null, p_id_empresa: idEmpresa, p_tipo: tipo, p_nome: f.nome, p_descricao: f.descricao || null, p_sku: f.sku || null,
      p_codigo_barras: f.barras || null, p_categoria: f.categoria || null, p_unidade: tipo === 'servico' ? (f.unidade === 'un' ? 'serv' : f.unidade) : f.unidade,
      p_custo: custo, p_preco: preco, p_estoque_minimo: minimo, p_status: f.status, p_estoque_inicial: inicial,
    });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível salvar o item.'));
    aoSalvar(produto ? 'Item atualizado.' : tipo === 'servico' ? 'Serviço cadastrado.' : 'Produto cadastrado.', data as string);
  };

  const input = (k: string, label: string, props: Record<string, unknown> = {}, mascara?: (v: string) => string) => (
    <div><label htmlFor={`prod-${k}`} className={rotulo}>{label}</label>
      <input id={`prod-${k}`} value={f[k] ?? ''} onChange={(e) => set(k, mascara ? mascara(e.target.value) : e.target.value)} className={campo} {...props} /></div>
  );
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={produto ? 'Editar item' : 'Novo produto ou serviço'}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={salvar}>{ocupado ? 'Salvando...' : 'Salvar'}</button></>}>
      <div className="space-y-4">
        <Erro texto={erro} />
        <div role="radiogroup" aria-label="Tipo do item" className="flex gap-2">
          {(['produto', 'servico'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={tipo === t} disabled={!!produto && produto.tipo !== t} onClick={() => setTipo(t)}
              className={`flex-1 min-h-11 rounded-lg border text-sm font-semibold disabled:opacity-40 ${tipo === t ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600'}`}>
              {t === 'produto' ? 'Produto (com estoque)' : 'Serviço (sem estoque)'}</button>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">{input('nome', 'Nome', { maxLength: 150 })}</div>
          <div className="sm:col-span-2"><label htmlFor="prod-descricao" className={rotulo}>Descrição (opcional)</label>
            <textarea id="prod-descricao" rows={2} maxLength={2000} value={f.descricao ?? ''} onChange={(e) => set('descricao', e.target.value)} className={`${campo} h-auto py-2`} /></div>
          {input('sku', 'SKU / código interno (opcional)', { maxLength: 60 })}
          {input('barras', 'Código de barras (opcional)', { inputMode: 'numeric', maxLength: 20 }, (v) => v.replace(/\D/g, ''))}
          <div><label htmlFor="prod-categoria" className={rotulo}>Categoria (opcional)</label>
            <input id="prod-categoria" list="prod-categorias" maxLength={60} value={f.categoria ?? ''} onChange={(e) => set('categoria', e.target.value)} className={campo} />
            <datalist id="prod-categorias">{categorias.map((c) => <option key={c} value={c} />)}</datalist></div>
          <div><label htmlFor="prod-unidade" className={rotulo}>Unidade</label>
            <select id="prod-unidade" value={f.unidade ?? 'un'} onChange={(e) => set('unidade', e.target.value)} className={campo}>{UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
          {input('custo', 'Custo (R$)', { inputMode: 'numeric', placeholder: '0,00' }, mascaraMoeda)}
          {input('preco', 'Preço de venda (R$)', { inputMode: 'numeric', placeholder: '0,00' }, mascaraMoeda)}
          {margem !== null && <p className="sm:col-span-2 text-xs text-gray-600 -mt-2" data-testid="margem">Margem sobre o preço: <strong className={margem < 0 ? 'text-red-700' : 'text-gray-900'}>{String(margem).replace('.', ',')}%</strong></p>}
          {tipo === 'produto' && input('minimo', `Estoque mínimo (${f.unidade || 'un'})`, { inputMode: 'decimal' }, mascaraQuantidade)}
          {tipo === 'produto' && !produto && input('inicial', 'Estoque inicial (opcional)', { inputMode: 'decimal', placeholder: '0' }, mascaraQuantidade)}
          {produto && <div><label htmlFor="prod-status" className={rotulo}>Situação</label>
            <select id="prod-status" value={f.status} onChange={(e) => set('status', e.target.value)} className={campo}><option value="ativo">Ativo</option><option value="inativo">Inativo (mantém o histórico)</option></select></div>}
        </div>
        {produto && tipo === 'produto' && <p className="text-xs text-gray-500">O saldo ({formatarQuantidade(produto.estoque_atual)} {produto.unidade}) só muda por entrada, saída ou ajuste registrados.</p>}
        {tipo === 'servico' && <p className="text-xs text-gray-500">Serviços não têm controle de quantidade.</p>}
      </div>
    </Modal>
  );
}

export type TipoMovimentacao = 'entrada' | 'saida' | 'ajuste';
export function ModalMovimentacao({ produto, tipoInicial, aoFechar, aoConcluir }: {
  produto: ProdutoCompleto | null; tipoInicial: TipoMovimentacao; aoFechar: () => void; aoConcluir: (m: string) => void;
}) {
  const [tipo, setTipo] = useState<TipoMovimentacao>('entrada');
  const [qtd, setQtd] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const chave = useRef<string>('');

  useEffect(() => {
    if (!produto) return;
    setTipo(tipoInicial); setQtd(''); setMotivo(''); setErro(null);
    chave.current = crypto.randomUUID(); // mesma chave em novas tentativas: o banco não duplica
  }, [produto, tipoInicial]);
  if (!produto) return null;

  const q = paraQuantidade(qtd);
  const atual = Number(produto.estoque_atual);
  const novo = q === null ? null : tipo === 'entrada' ? atual + q : tipo === 'saida' ? atual - q : q;
  const confirmar = async () => {
    if (q === null || (tipo !== 'ajuste' && q <= 0)) return setErro('Informe uma quantidade válida (até 3 casas decimais).');
    if (novo !== null && novo < 0) return setErro(`Estoque insuficiente: saldo atual ${formatarQuantidade(atual)} ${produto.unidade}.`);
    if (tipo !== 'entrada' && motivo.trim().length < 3) return setErro('Informe a justificativa.');
    if (tipo === 'ajuste' && q === atual) return setErro('O saldo contado é igual ao atual.');
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('movimentar_estoque', { p_id_produto: produto.id, p_tipo: tipo, p_quantidade: q, p_motivo: motivo || null, p_chave: chave.current });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível registrar a movimentação.'));
    aoConcluir(tipo === 'entrada' ? 'Entrada registrada.' : tipo === 'saida' ? 'Saída registrada.' : 'Ajuste registrado.');
  };
  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Movimentar estoque — ${produto.nome}`}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={confirmar}>{ocupado ? 'Registrando...' : 'Registrar'}</button></>}>
      <div className="space-y-4">
        <Erro texto={erro} />
        <div role="radiogroup" aria-label="Tipo de movimentação" className="grid grid-cols-3 gap-2">
          {([['entrada', 'Entrada'], ['saida', 'Saída'], ['ajuste', 'Ajuste']] as const).map(([t, r]) => (
            <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => { setTipo(t); setErro(null); }}
              className={`min-h-11 rounded-lg border text-sm font-semibold ${tipo === t ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600'}`}>{r}</button>
          ))}
        </div>
        <div><label htmlFor="mov-qtd" className={rotulo}>{tipo === 'ajuste' ? `Saldo contado (${produto.unidade})` : `Quantidade (${produto.unidade})`}</label>
          <input id="mov-qtd" inputMode="decimal" value={qtd} onChange={(e) => setQtd(mascaraQuantidade(e.target.value))} className={campo} placeholder="0" /></div>
        <div><label htmlFor="mov-motivo" className={rotulo}>{tipo === 'entrada' ? 'Origem (opcional)' : 'Justificativa'}</label>
          <input id="mov-motivo" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo}
            placeholder={tipo === 'entrada' ? 'Ex.: compra NF 123' : tipo === 'saida' ? 'Ex.: avaria, uso interno, perda' : 'Ex.: inventário mensal'} /></div>
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm" aria-live="polite" data-testid="previa-estoque">
          Saldo: <strong>{formatarQuantidade(atual)}</strong> → <strong className={novo !== null && novo < 0 ? 'text-red-700' : ''}>{novo === null ? '—' : formatarQuantidade(novo)}</strong> {produto.unidade}
          {novo !== null && novo >= 0 && novo <= Number(produto.estoque_minimo) && <span className="block text-xs text-orange-700">Abaixo ou igual ao mínimo ({formatarQuantidade(produto.estoque_minimo)}): repor estoque.</span>}
          {produto.custo > 0 && q !== null && tipo === 'entrada' && <span className="block text-xs text-gray-500">Custo estimado da entrada: {formatarMoeda(q * produto.custo)}</span>}
        </div>
      </div>
    </Modal>
  );
}
