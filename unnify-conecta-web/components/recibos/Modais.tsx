'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import { formatarData, formatarMoeda, hojeBrasil, mascaraMoeda, paraDecimal } from '@/lib/financeiro';
import { documentoValido, mascaraDocumento } from '@/lib/clientes';
import { FORMAS_RECIBO, type FormaRecibo } from '@/lib/recibos';
import { Modal, classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';
function Erro({ texto }: { texto: string | null }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (texto) ref.current?.scrollIntoView({ block: 'nearest' }); }, [texto]);
  return texto ? <p ref={ref} role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{texto}</p> : null;
}
interface Pagamento { id: string; tipo: 'receita' | 'despesa'; descricao: string; valor: number; data_pagamento: string; contraparte: string | null; cliente: string | null; id_venda: string | null; id_compra: string | null }

// Lista de pagamentos confirmados sem recibo (Financeiro) — usada na emissão vinculada e na conciliação
function ListaPagamentos({ idEmpresa, tipo, valor, selecionado, aoSelecionar }: { idEmpresa: string; tipo: 'receita' | null; valor?: number; selecionado: string; aoSelecionar: (p: Pagamento) => void }) {
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState<Pagamento[] | null | 'erro'>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      createClient().rpc('pagamentos_sem_recibo', { p_id_empresa: idEmpresa, p_tipo: tipo, p_busca: busca.trim() || null })
        .then(({ data, error }) => setLista(error ? 'erro' : ((data ?? []) as Pagamento[]).filter((p) => valor === undefined || Number(p.valor) === valor)));
    }, 250);
    return () => clearTimeout(t);
  }, [idEmpresa, tipo, busca, valor]);
  return (
    <div className="space-y-2">
      <div className="relative"><Search className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" aria-hidden="true" />
        <input type="search" aria-label="Buscar pagamento confirmado" placeholder="Buscar por descrição, cliente ou fornecedor..." value={busca} onChange={(e) => setBusca(e.target.value)} className={`${campo} pl-9`} /></div>
      {lista === null ? <div role="status" aria-label="Carregando pagamentos" className="h-24 rounded-lg bg-gray-50 animate-pulse" />
        : lista === 'erro' ? <p role="alert" className="text-sm text-red-700">Não foi possível carregar os pagamentos.</p>
        : lista.length === 0 ? <p className="text-sm text-gray-500">Nenhum pagamento confirmado sem recibo{valor !== undefined ? ` no valor de ${formatarMoeda(valor)}` : ''}.</p> : (
          <ul role="radiogroup" aria-label="Pagamentos confirmados" className="max-h-64 overflow-y-auto divide-y divide-gray-100 rounded-lg border border-gray-200" data-testid="pagamentos-sem-recibo">
            {lista.map((p) => (
              <li key={p.id}><button type="button" role="radio" aria-checked={selecionado === p.id} onClick={() => aoSelecionar(p)}
                className={`w-full min-h-11 px-3 py-2 text-left flex items-center gap-2 ${selecionado === p.id ? 'bg-orange-50' : 'hover:bg-gray-50'}`}>
                <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-gray-900 truncate">{p.descricao}</span>
                  <span className="block text-xs text-gray-500">{p.tipo === 'receita' ? 'Recebido' : 'Pago'} em {formatarData(p.data_pagamento)}{p.cliente || p.contraparte ? ` · ${p.cliente ?? p.contraparte}` : ''}</span></span>
                <span className={`text-sm font-bold whitespace-nowrap ${p.tipo === 'receita' ? 'text-green-700' : 'text-red-700'}`}>{p.tipo === 'despesa' ? '− ' : ''}{formatarMoeda(p.valor)}</span>
              </button></li>
            ))}
          </ul>
        )}
    </div>
  );
}

export function ModalNovoRecibo({ aberto, aoFechar, idEmpresa, idLancamentoInicial, aoConcluir }: {
  aberto: boolean; aoFechar: () => void; idEmpresa: string; idLancamentoInicial: string | null; aoConcluir: (m: string, id: string) => void;
}) {
  const [modo, setModo] = useState<'financeiro' | 'manual'>('financeiro');
  const [pag, setPag] = useState<Pagamento | null>(null);
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
  const [f, setF] = useState<Record<string, string>>({});
  const [parcial, setParcial] = useState(false);
  const [declaro, setDeclaro] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const chave = useRef('');
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!aberto) return;
    setModo('financeiro'); setPag(null); setParcial(false); setDeclaro(false); setErro(null);
    setF({ cliente: '', nome: '', documento: '', descricao: '', valor: '', data: hojeBrasil(), forma: 'pix', total: '', obs: '' });
    chave.current = crypto.randomUUID(); // repetir o envio devolve o mesmo recibo
    const supabase = createClient();
    supabase.from('clientes').select('id, nome, nome_fantasia').eq('id_empresa', idEmpresa).neq('status', 'inativo').order('nome').limit(1000)
      .then(({ data }) => setClientes((data ?? []).map((c) => ({ id: c.id as string, nome: (c.nome_fantasia as string) || (c.nome as string) }))));
    if (idLancamentoInicial) {
      supabase.rpc('pagamentos_sem_recibo', { p_id_empresa: idEmpresa, p_tipo: null, p_busca: null })
        .then(({ data }) => { const p = ((data ?? []) as Pagamento[]).find((x) => x.id === idLancamentoInicial); if (p) setPag(p); else setErro('Este pagamento não está disponível para recibo (pendente, de outra empresa ou já tem recibo).'); });
    }
  }, [aberto, idEmpresa, idLancamentoInicial]);

  const emitir = async () => {
    setErro(null);
    const supabase = createClient();
    let args: Record<string, unknown>;
    if (modo === 'financeiro') {
      if (!pag) return setErro('Escolha o pagamento confirmado.');
      args = { p_id_empresa: idEmpresa, p_id_lancamento: pag.id, p_id_cliente: null, p_pessoa_nome: f.nome || null, p_pessoa_documento: null, p_descricao: f.descricao || null,
        p_valor: null, p_data_pagamento: null, p_forma_pagamento: f.forma, p_parcial: false, p_valor_total: null, p_declaracao: false, p_observacoes: f.obs || null, p_chave: chave.current };
    } else {
      const v = paraDecimal(f.valor ?? '');
      if (!f.cliente && (f.nome ?? '').trim().length < 2) return setErro('Escolha um cliente ou informe o nome do pagador.');
      if (!f.cliente && f.documento && !documentoValido(f.documento.replace(/\D/g, '').length > 11 ? 'pj' : 'pf', f.documento)) return setErro('CPF/CNPJ do pagador inválido.');
      if ((f.descricao ?? '').trim().length < 3) return setErro('Descreva o pagamento.');
      if (!v) return setErro('Informe o valor recebido.');
      if (!f.data || f.data > hojeBrasil()) return setErro('A data do pagamento não pode ser futura.');
      const total = parcial && f.total ? paraDecimal(f.total) : null;
      if (parcial && total && Number(total) <= Number(v)) return setErro('No pagamento parcial, o total da operação deve ser maior que o valor recebido.');
      if (!declaro) return setErro('Confirme que o valor foi efetivamente recebido.');
      args = { p_id_empresa: idEmpresa, p_id_lancamento: null, p_id_cliente: f.cliente || null, p_pessoa_nome: f.cliente ? null : f.nome, p_pessoa_documento: f.cliente ? null : f.documento || null,
        p_descricao: f.descricao, p_valor: v, p_data_pagamento: f.data, p_forma_pagamento: f.forma, p_parcial: parcial, p_valor_total: total, p_declaracao: true, p_observacoes: f.obs || null, p_chave: chave.current };
    }
    setOcupado(true);
    const { data, error } = await supabase.rpc('emitir_recibo', args);
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível emitir o recibo.'));
    aoConcluir(modo === 'manual' ? 'Recibo emitido. Ele fica "não conciliado" até ser vinculado a um recebimento do Financeiro.' : 'Recibo emitido e vinculado ao pagamento.', data as string);
  };

  const semVendaCompra = pag && !pag.id_venda && !pag.id_compra;
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Novo recibo" tamanho="lg"
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={emitir}>{ocupado ? 'Emitindo...' : 'Emitir recibo'}</button></>}>
      <div className="space-y-4">
        <Erro texto={erro} />
        <div role="radiogroup" aria-label="Origem do recibo" className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
          {([['financeiro', 'De um pagamento confirmado'], ['manual', 'Recibo manual']] as const).map(([v, r]) => (
            <button key={v} type="button" role="radio" aria-checked={modo === v} onClick={() => { setModo(v); setErro(null); }}
              className={`min-h-11 rounded-lg border text-sm font-semibold px-2 ${modo === v ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600'}`}>{r}</button>
          ))}
        </div>
        {modo === 'financeiro' ? (
          <>
            <p className="text-xs text-gray-500">Mostra só pagamentos já baixados no Financeiro e ainda sem recibo. Receita gera <strong>recibo de recebimento</strong>; despesa gera <strong>comprovante de pagamento</strong> (não substitui o recibo de quitação do fornecedor).</p>
            {pag && idLancamentoInicial ? (
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm" data-testid="pagamento-escolhido"><p className="font-semibold">{pag.descricao}</p>
                <p className="text-xs text-gray-600">{pag.tipo === 'receita' ? 'Recebido' : 'Pago'} em {formatarData(pag.data_pagamento)} · {formatarMoeda(pag.valor)}</p></div>
            ) : <ListaPagamentos idEmpresa={idEmpresa} tipo={null} selecionado={pag?.id ?? ''} aoSelecionar={setPag} />}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><label htmlFor="rec-desc" className={rotulo}>Descrição no recibo (opcional)</label>
                <input id="rec-desc" maxLength={300} value={f.descricao ?? ''} onChange={(e) => set('descricao', e.target.value)} className={campo} placeholder={pag?.descricao ?? 'Usa a descrição do lançamento'} /></div>
              {pag && !pag.cliente && <div><label htmlFor="rec-nome-fin" className={rotulo}>{pag.tipo === 'receita' ? 'Pagador' : 'Beneficiário'} (se faltar no lançamento)</label>
                <input id="rec-nome-fin" maxLength={150} value={f.nome ?? ''} onChange={(e) => set('nome', e.target.value)} className={campo} placeholder={pag.contraparte ?? ''} /></div>}
              {semVendaCompra && <div><label htmlFor="rec-forma-fin" className={rotulo}>Forma de pagamento</label>
                <select id="rec-forma-fin" value={f.forma} onChange={(e) => set('forma', e.target.value)} className={campo}>{Object.entries(FORMAS_RECIBO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>}
            </div>
          </>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><label htmlFor="rec-cliente" className={rotulo}>Cliente cadastrado (opcional)</label>
              <select id="rec-cliente" value={f.cliente} onChange={(e) => set('cliente', e.target.value)} className={campo}><option value="">Informar o pagador manualmente</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
            {!f.cliente && <>
              <div><label htmlFor="rec-nome" className={rotulo}>Nome do pagador</label><input id="rec-nome" maxLength={150} value={f.nome ?? ''} onChange={(e) => set('nome', e.target.value)} className={campo} /></div>
              <div><label htmlFor="rec-doc" className={rotulo}>CPF/CNPJ (opcional)</label><input id="rec-doc" inputMode="numeric" value={f.documento ?? ''} onChange={(e) => set('documento', mascaraDocumento(e.target.value.replace(/\D/g, '').length > 11 ? 'pj' : 'pf', e.target.value))} className={campo} /></div>
            </>}
            <div className="sm:col-span-2"><label htmlFor="rec-desc-m" className={rotulo}>Descrição</label><input id="rec-desc-m" maxLength={300} value={f.descricao ?? ''} onChange={(e) => set('descricao', e.target.value)} className={campo} placeholder="Ex.: corte de cabelo" /></div>
            <div><label htmlFor="rec-valor" className={rotulo}>Valor recebido (R$)</label><input id="rec-valor" inputMode="numeric" placeholder="0,00" value={f.valor ?? ''} onChange={(e) => set('valor', mascaraMoeda(e.target.value))} className={campo} /></div>
            <div><label htmlFor="rec-data" className={rotulo}>Data do pagamento</label><input id="rec-data" type="date" max={hojeBrasil()} value={f.data ?? ''} onChange={(e) => set('data', e.target.value)} className={campo} /></div>
            <div><label htmlFor="rec-forma" className={rotulo}>Forma de pagamento</label>
              <select id="rec-forma" value={f.forma} onChange={(e) => set('forma', e.target.value as FormaRecibo)} className={campo}>{Object.entries(FORMAS_RECIBO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div><label htmlFor="rec-obs" className={rotulo}>Observações (opcional)</label><input id="rec-obs" maxLength={500} value={f.obs ?? ''} onChange={(e) => set('obs', e.target.value)} className={campo} /></div>
            <div className="sm:col-span-2 rounded-xl border border-gray-200 p-3 space-y-3">
              <label className="flex items-start gap-2 text-sm min-h-11 cursor-pointer"><input type="checkbox" checked={parcial} onChange={(e) => setParcial(e.target.checked)} className="mt-1 w-4 h-4 accent-orange-600" />
                <span><strong>Pagamento parcial</strong><span className="block text-xs text-gray-500">O recibo indica que não há quitação integral.</span></span></label>
              {parcial && <div><label htmlFor="rec-total" className={rotulo}>Valor total da operação (opcional)</label><input id="rec-total" inputMode="numeric" placeholder="0,00" value={f.total ?? ''} onChange={(e) => set('total', mascaraMoeda(e.target.value))} className={campo} /></div>}
              <label className="flex items-start gap-2 text-sm min-h-11 cursor-pointer"><input type="checkbox" checked={declaro} onChange={(e) => setDeclaro(e.target.checked)} className="mt-1 w-4 h-4 accent-orange-600" />
                <span><strong>Declaro que este valor foi efetivamente recebido.</strong><span className="block text-xs text-gray-500">O recibo manual não lança nada no Financeiro e fica "não conciliado" até ser vinculado a um recebimento.</span></span></label>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function ModalConciliar({ recibo, idEmpresa, aoFechar, aoConcluir }: { recibo: { id: string; numero: number; valor: number } | null; idEmpresa: string; aoFechar: () => void; aoConcluir: (m: string) => void }) {
  const [pag, setPag] = useState<Pagamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setPag(null); setErro(null); }, [recibo]);
  if (!recibo) return null;
  const confirmar = async () => {
    if (!pag) return setErro('Escolha o recebimento confirmado.');
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('conciliar_recibo', { p_id_recibo: recibo.id, p_id_lancamento: pag.id });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível vincular.'));
    aoConcluir('Recibo vinculado ao recebimento do Financeiro (conciliado).');
  };
  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Vincular recibo nº ${String(recibo.numero).padStart(6, '0')}`} descricao="Escolha o recebimento já baixado no Financeiro, com o mesmo valor."
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Cancelar</button>
        <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={confirmar}>{ocupado ? 'Vinculando...' : 'Vincular'}</button></>}>
      <div className="space-y-3"><Erro texto={erro} /><ListaPagamentos idEmpresa={idEmpresa} tipo="receita" valor={Number(recibo.valor)} selecionado={pag?.id ?? ''} aoSelecionar={setPag} /></div>
    </Modal>
  );
}

export function ModalCancelarRecibo({ recibo, aoFechar, aoConcluir }: { recibo: { id: string; numero: number } | null; aoFechar: () => void; aoConcluir: (m: string) => void }) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setMotivo(''); setErro(null); }, [recibo]);
  if (!recibo) return null;
  const confirmar = async () => {
    if (motivo.trim().length < 5) return setErro('Informe a justificativa (mínimo 5 caracteres).');
    setOcupado(true); setErro(null);
    const { error } = await createClient().rpc('cancelar_recibo', { p_id_recibo: recibo.id, p_motivo: motivo });
    setOcupado(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível cancelar o recibo.'));
    aoConcluir('Recibo cancelado. O documento e o histórico foram mantidos.');
  };
  return (
    <Modal aberto aoFechar={aoFechar} titulo={`Cancelar recibo nº ${String(recibo.numero).padStart(6, '0')}`}
      rodape={<><button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Voltar</button>
        <button type="button" className={classeBotaoPerigo} disabled={ocupado} onClick={confirmar}>{ocupado ? 'Cancelando...' : 'Cancelar recibo'}</button></>}>
      <div className="space-y-4">
        <Erro texto={erro} />
        <p className="text-sm text-gray-600">O recibo continua no histórico, marcado como CANCELADO. Nada muda no Financeiro.</p>
        <div><label htmlFor="canc-rec" className={rotulo}>Justificativa</label><input id="canc-rec" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo} /></div>
      </div>
    </Modal>
  );
}
