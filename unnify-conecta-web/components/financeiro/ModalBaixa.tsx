'use client';

import { useEffect, useRef, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mensagemDeErro } from '@/lib/contabil';
import {
  ARQUIVOS_COMPROVANTE, TAMANHO_MAXIMO_COMPROVANTE, formatarMoeda, hojeBrasil, mascaraMoeda, paraDecimal, valorParaMascara,
  type ContaFinanceira, type TipoLancamento,
} from '@/lib/financeiro';
import { Modal, classeBotaoPrimario, classeBotaoSecundario } from '@/components/ui/Modal';
import { enviarComprovante } from './FormLancamento';
import { SeletorConta } from './SeletorConta';

export interface LancamentoParaBaixa {
  id: string;
  tipo: TipoLancamento;
  descricao: string;
  valor: number;
  idContaSugerida?: string | null; // ex.: banco vinculado ao gasto fixo
}

interface Props {
  lancamento: LancamentoParaBaixa | null;
  idEmpresa: string;
  contas: ContaFinanceira[];
  aoFechar: () => void;
  aoConcluir: (mensagem: string) => void;
  aoIrParaContas: () => void;
}

// Janela ÚNICA de pagamento/recebimento do Financeiro (Contas a pagar/receber e Parcelamentos).
// Usa registrar_baixa_lancamento: conta obrigatória, saldo, valor total (sem parcial) e movimentação única.
export function ModalBaixa({ lancamento, idEmpresa, contas, aoFechar, aoConcluir, aoIrParaContas }: Props) {
  const [conta, setConta] = useState('');
  const [valor, setValor] = useState('');
  const [data, setData] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const travado = useRef(false);

  useEffect(() => {
    if (!lancamento) return;
    const sugerida = contas.find((c) => c.id === lancamento.idContaSugerida && !c.arquivada_em);
    setConta(sugerida?.id ?? contas.find((c) => c.principal && !c.arquivada_em)?.id ?? '');
    setValor(valorParaMascara(lancamento.valor));
    setData(hojeBrasil());
    setArquivo(null);
    setErro(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reinicia só ao abrir
  }, [lancamento]);

  const receita = lancamento?.tipo === 'receita';

  const confirmar = async () => {
    if (!lancamento || travado.current) return;
    if (!conta) return setErro('Escolha a conta.');
    if (!paraDecimal(valor)) return setErro('Informe o valor.');
    if (arquivo && (!ARQUIVOS_COMPROVANTE.includes(arquivo.type) || arquivo.size > TAMANHO_MAXIMO_COMPROVANTE)) return setErro('Comprovante: PDF, JPG, PNG ou WebP até 10 MB.');
    travado.current = true;
    setProcessando(true);
    setErro(null);
    const { error } = await createClient().rpc('registrar_baixa_lancamento', { p_id: lancamento.id, p_data_pagamento: data || null, p_id_conta: conta, p_valor: paraDecimal(valor) });
    let aviso = '';
    if (!error && arquivo) {
      const falha = await enviarComprovante(idEmpresa, lancamento.id, arquivo);
      if (falha) aviso = ` Atenção: ${falha}`;
    }
    travado.current = false;
    setProcessando(false);
    if (error) return setErro(mensagemDeErro(error, 'Não foi possível concluir a ação.'));
    aoConcluir((receita ? 'Recebimento registrado.' : 'Pagamento registrado.') + aviso);
  };

  return (
    <Modal
      aberto={!!lancamento}
      aoFechar={aoFechar}
      titulo={receita ? 'Registrar recebimento' : 'Registrar pagamento'}
      descricao={lancamento ? `${lancamento.descricao} · ${formatarMoeda(lancamento.valor)}` : undefined}
      rodape={
        <>
          <button type="button" className={classeBotaoSecundario} onClick={aoFechar}>Voltar</button>
          <button type="button" disabled={processando} onClick={confirmar} className={classeBotaoPrimario}>{processando ? 'Processando...' : 'Confirmar'}</button>
        </>
      }
    >
      {lancamento && (
        <div className="space-y-4">
          <SeletorConta
            id="conta-baixa"
            rotulo={receita ? 'Conta de destino' : 'Conta de origem'}
            contas={contas}
            idConta={conta}
            aoMudar={setConta}
            valor={paraDecimal(valor)}
            natureza={receita ? 'entrada' : 'saida'}
            aoIrParaContas={() => {
              aoFechar();
              aoIrParaContas();
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="valor-baixa" className="block text-sm font-semibold text-gray-900 mb-1.5">Valor {receita ? 'recebido' : 'pago'} (R$)</label>
              <input id="valor-baixa" inputMode="numeric" value={valor} onChange={(e) => setValor(mascaraMoeda(e.target.value))} className="w-full h-11 px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label htmlFor="data-baixa" className="block text-sm font-semibold text-gray-900 mb-1.5">Data do {receita ? 'recebimento' : 'pagamento'}</label>
              <input id="data-baixa" type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-full h-11 px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>
          <p className="text-xs text-gray-500">Pagamento parcial ainda não é suportado: informe o valor total do lançamento.</p>
          <div>
            <label htmlFor="arquivo-baixa" className="inline-flex items-center gap-2 min-h-11 text-sm text-gray-700 cursor-pointer">
              <Paperclip className="w-4 h-4" aria-hidden="true" />
              {arquivo ? arquivo.name : 'Anexar comprovante (opcional)'}
            </label>
            <input id="arquivo-baixa" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
          </div>
          {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
        </div>
      )}
    </Modal>
  );
}
