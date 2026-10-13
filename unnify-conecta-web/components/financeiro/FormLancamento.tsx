'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Paperclip } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import {
  ARQUIVOS_COMPROVANTE, TAMANHO_MAXIMO_COMPROVANTE, hojeBrasil, mascaraMoeda, paraDecimal, valorParaMascara,
  type Categoria, type ContaFinanceira, type Lancamento, type TipoLancamento,
} from '@/lib/financeiro';
import { Modal, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { SeletorConta } from './SeletorConta';
import { IconeCategoria } from './IconeCategoria';

const campo = 'w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const rotulo = 'block text-sm font-semibold text-gray-900 mb-1.5';

// Envia um comprovante para o Storage privado e registra o vínculo com o lançamento (validado no banco).
export async function enviarComprovante(idEmpresa: string, idLancamento: string, arquivo: File): Promise<string | null> {
  if (!ARQUIVOS_COMPROVANTE.includes(arquivo.type)) return 'Use PDF, JPG, PNG ou WebP.';
  if (arquivo.size > TAMANHO_MAXIMO_COMPROVANTE) return 'O comprovante deve ter no máximo 10 MB.';
  const supabase = createClient();
  const extensao = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[arquivo.type];
  const caminho = `${idEmpresa}/${idLancamento}/${crypto.randomUUID()}.${extensao}`;
  const { error: erroEnvio } = await supabase.storage.from('comprovantes-financeiros').upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
  if (erroEnvio) return 'Não foi possível enviar o comprovante.';
  const { error } = await supabase.rpc('registrar_anexo_financeiro', { p_id_lancamento: idLancamento, p_caminho: caminho, p_nome_arquivo: arquivo.name });
  if (error) {
    await supabase.storage.from('comprovantes-financeiros').remove([caminho]);
    return 'Não foi possível registrar o comprovante.';
  }
  return null;
}

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  idEmpresa: string;
  tipoInicial: TipoLancamento;
  lancamento: Lancamento | null;
  categorias: Categoria[];
  contas: ContaFinanceira[];
  aoIrParaContas: () => void;
  aoSalvar: (mensagem: string) => void;
}

export function FormLancamento({ aberto, aoFechar, idEmpresa, tipoInicial, lancamento, categorias, contas, aoIrParaContas, aoSalvar }: Props) {
  const editando = !!lancamento;
  const [tipo, setTipo] = useState<TipoLancamento>(tipoInicial);
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [idCategoria, setIdCategoria] = useState('');
  const [competencia, setCompetencia] = useState('');
  const [vencimento, setVencimento] = useState('');
  const [jaPago, setJaPago] = useState(false);
  const [pagamento, setPagamento] = useState('');
  const [idConta, setIdConta] = useState('');
  const [contraparte, setContraparte] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const travado = useRef(false);

  useEffect(() => {
    if (!aberto) return;
    const hoje = hojeBrasil();
    setTipo(lancamento?.tipo ?? tipoInicial);
    setDescricao(lancamento?.descricao ?? '');
    setValor(lancamento ? valorParaMascara(lancamento.valor) : '');
    setIdCategoria(lancamento?.id_categoria ?? '');
    setCompetencia(lancamento?.data_competencia ?? hoje);
    setVencimento(lancamento?.data_vencimento ?? (lancamento ? '' : hoje));
    setJaPago(lancamento ? lancamento.status === 'pago' : false);
    setPagamento(lancamento?.data_pagamento ?? hoje);
    setIdConta(contas.find((c) => c.principal && !c.arquivada_em)?.id ?? '');
    setContraparte(lancamento?.contraparte ?? '');
    setObservacoes(lancamento?.observacoes ?? '');
    setArquivo(null);
    setErro(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reinicia só ao abrir
  }, [aberto, lancamento, tipoInicial]);

  const opcoes = categorias.filter((c) => c.tipo === tipo && (c.ativa || c.id === lancamento?.id_categoria));
  const receita = tipo === 'receita';

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (travado.current) return;
    setErro(null);
    const decimal = paraDecimal(valor);
    if (descricao.trim().length < 2) return setErro('Informe a descrição.');
    if (!decimal) return setErro('Informe um valor maior que zero.');
    if (!idCategoria) return setErro('Escolha a categoria.');
    if (!competencia) return setErro('Informe a data de competência.');
    if (!jaPago && !vencimento) return setErro('Informe o vencimento.');
    if (jaPago && !pagamento) return setErro(`Informe a data do ${receita ? 'recebimento' : 'pagamento'}.`);
    if (jaPago && !editando && !idConta) return setErro(`Escolha a conta de ${receita ? 'destino' : 'origem'}.`);
    if (arquivo && !ARQUIVOS_COMPROVANTE.includes(arquivo.type)) return setErro('Comprovante: use PDF, JPG, PNG ou WebP.');
    if (arquivo && arquivo.size > TAMANHO_MAXIMO_COMPROVANTE) return setErro('O comprovante deve ter no máximo 10 MB.');

    travado.current = true;
    setSalvando(true);
    const { data: id, error } = await createClient().rpc('salvar_lancamento_financeiro', {
      p_id: lancamento?.id ?? null,
      p_id_empresa: idEmpresa,
      p_tipo: tipo,
      p_descricao: descricao.trim(),
      p_valor: decimal,
      p_id_categoria: idCategoria,
      p_data_competencia: competencia,
      p_data_vencimento: vencimento || null,
      p_data_pagamento: jaPago ? pagamento : null,
      p_contraparte: contraparte.trim() || null,
      p_observacoes: observacoes.trim() || null,
      p_id_conta_financeira: jaPago && !editando ? idConta : null,
    });
    if (error) {
      travado.current = false;
      setSalvando(false);
      return setErro(mensagemDeErro(error, 'Não foi possível salvar o lançamento.'));
    }
    let aviso = '';
    if (arquivo && id) {
      const falha = await enviarComprovante(idEmpresa, id as string, arquivo);
      if (falha) aviso = ` Atenção: ${falha}`;
    }
    travado.current = false;
    setSalvando(false);
    aoSalvar(`${editando ? 'Lançamento atualizado.' : receita ? 'Receita lançada.' : 'Despesa lançada.'}${aviso}`);
  };

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={editando ? 'Editar lançamento' : receita ? 'Lançar receita' : 'Lançar despesa'}
      rodape={
        <>
          <button type="button" className={classeBotaoSecundario} onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" form="form-lancamento" disabled={salvando} className={classeBotaoPrimario}>
            {salvando ? 'Salvando...' : 'Salvar lançamento'}
          </button>
        </>
      }
    >
      <form id="form-lancamento" onSubmit={salvar} noValidate className="space-y-4">
        {!editando && (
          <div role="tablist" aria-label="Tipo de lançamento" className="grid grid-cols-2 rounded-lg bg-gray-100 p-1">
            {(['receita', 'despesa'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tipo === t}
                onClick={() => {
                  setTipo(t);
                  setIdCategoria('');
                }}
                className={`min-h-10 rounded-md text-sm font-semibold ${tipo === t ? (t === 'receita' ? 'bg-white text-green-700 shadow-sm' : 'bg-white text-red-700 shadow-sm') : 'text-gray-600'}`}
              >
                {t === 'receita' ? 'Receita' : 'Despesa'}
              </button>
            ))}
          </div>
        )}
        <div>
          <label htmlFor="lanc-descricao" className={rotulo}>
            Descrição
          </label>
          <input id="lanc-descricao" className={campo} maxLength={200} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={receita ? 'Ex.: Venda de serviços' : 'Ex.: Pagamento de fornecedor'} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="lanc-valor" className={rotulo}>
              Valor (R$)
            </label>
            <input id="lanc-valor" inputMode="numeric" disabled={lancamento?.status === 'pago'} className={`${campo} disabled:bg-gray-50 disabled:text-gray-500`} value={valor} onChange={(e) => setValor(mascaraMoeda(e.target.value))} placeholder="0,00" />
          </div>
          <div>
            <label htmlFor="lanc-categoria" className={rotulo}>
              Categoria
            </label>
            <select id="lanc-categoria" className={campo} value={idCategoria} onChange={(e) => setIdCategoria(e.target.value)}>
              <option value="">Selecione</option>
              {opcoes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {!c.ativa ? ' (desativada)' : ''}
                </option>
              ))}
            </select>
            {(() => {
              const escolhida = opcoes.find((c) => c.id === idCategoria);
              return escolhida ? (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-600" data-testid="categoria-escolhida">
                  <IconeCategoria icone={escolhida.icone} cor={escolhida.cor} tamanho="sm" />
                  {escolhida.nome}
                </p>
              ) : null;
            })()}
          </div>
        </div>
        <div>
          <label htmlFor="lanc-contraparte" className={rotulo}>
            {receita ? 'Cliente' : 'Fornecedor'} <span className="font-normal text-gray-500">(opcional)</span>
          </label>
          <input id="lanc-contraparte" className={campo} maxLength={120} value={contraparte} onChange={(e) => setContraparte(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="lanc-competencia" className={rotulo}>
              Competência
            </label>
            <input id="lanc-competencia" type="date" className={campo} value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
          </div>
          <div>
            <label htmlFor="lanc-vencimento" className={rotulo}>
              Vencimento {jaPago && <span className="font-normal text-gray-500">(opcional)</span>}
            </label>
            <input id="lanc-vencimento" type="date" className={campo} value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </div>
        </div>
        {(!editando || lancamento?.status === 'pago') && (
          <div className="rounded-xl border border-gray-200 p-3 space-y-3">
            {!editando && (
              <label className="flex items-center gap-2 min-h-11 text-sm text-gray-800 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-orange-600" checked={jaPago} onChange={(e) => setJaPago(e.target.checked)} />
                {receita ? 'Já foi recebido' : 'Já foi pago'}
              </label>
            )}
            {jaPago && (
              <div>
                <label htmlFor="lanc-pagamento" className={rotulo}>
                  Data do {receita ? 'recebimento' : 'pagamento'}
                </label>
                <input id="lanc-pagamento" type="date" disabled={editando} className={`${campo} disabled:bg-gray-50 disabled:text-gray-500`} value={pagamento} onChange={(e) => setPagamento(e.target.value)} />
              </div>
            )}
            {jaPago && !editando && (
              <SeletorConta
                id="lanc-conta"
                rotulo={receita ? 'Conta de destino' : 'Conta de origem'}
                contas={contas}
                idConta={idConta}
                aoMudar={setIdConta}
                valor={paraDecimal(valor)}
                natureza={receita ? 'entrada' : 'saida'}
                aoIrParaContas={aoIrParaContas}
              />
            )}
            {editando && lancamento?.status === 'pago' && (
              <p className="text-xs text-gray-500">
                Pago pela conta {lancamento.conta_nome ?? '—'}. Para mudar valor, data ou conta, estorne o pagamento.
              </p>
            )}
          </div>
        )}
        <div>
          <label htmlFor="lanc-observacoes" className={rotulo}>
            Observações <span className="font-normal text-gray-500">(opcional)</span>
          </label>
          <textarea id="lanc-observacoes" rows={2} maxLength={1000} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </div>
        {!editando && (
          <div>
            <label htmlFor="lanc-arquivo" className="inline-flex items-center gap-2 min-h-11 text-sm text-gray-700 cursor-pointer">
              <Paperclip className="w-4 h-4" aria-hidden="true" />
              {arquivo ? arquivo.name : 'Anexar comprovante (opcional)'}
            </label>
            <input id="lanc-arquivo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-gray-500">PDF, JPG, PNG ou WebP até 10 MB.</p>
          </div>
        )}
        {erro && (
          <p role="alert" className="text-sm text-red-700">
            {erro}
          </p>
        )}
      </form>
    </Modal>
  );
}
