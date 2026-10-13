// Parcelamentos: contratos cujas parcelas são lançamentos de despesa do Financeiro.
// Saldo devedor, situação e indicadores são calculados no banco (contratos_parcelados_resumo / resumo_parcelamentos).

export type TipoContrato = 'compra_parcelada' | 'boleto_parcelado' | 'financiamento' | 'emprestimo';
export type SituacaoContrato = 'ativo' | 'em_atraso' | 'quitado' | 'cancelado';

export const TIPOS_CONTRATO: Record<TipoContrato, string> = {
  compra_parcelada: 'Compra parcelada',
  boleto_parcelado: 'Boleto parcelado',
  financiamento: 'Financiamento',
  emprestimo: 'Empréstimo',
};

export const ROTULO_SITUACAO_CONTRATO: Record<SituacaoContrato, string> = {
  ativo: 'Em andamento',
  em_atraso: 'Em atraso',
  quitado: 'Quitado',
  cancelado: 'Cancelado',
};
export const SELO_SITUACAO_CONTRATO = { ativo: 'info', em_atraso: 'perigo', quitado: 'sucesso', cancelado: 'neutro' } as const;

export const ehFinanciamento = (tipo: TipoContrato) => tipo === 'financiamento' || tipo === 'emprestimo';

export interface ContratoResumo {
  id: string;
  nome: string;
  tipo: TipoContrato;
  contraparte: string | null;
  id_categoria: string;
  categoria_nome: string;
  categoria_cor: string;
  categoria_icone: string;
  descricao: string | null;
  data_contratacao: string;
  valor_principal: number;
  valor_total: number;
  taxa_juros_mensal: number | null;
  modalidade: 'fixas' | 'personalizadas';
  id_conta_financeira: string | null;
  conta_nome: string | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  qtd_parcelas: number;
  qtd_pagas: number;
  qtd_atrasadas: number;
  valor_pago: number;
  saldo_devedor: number;
  proximo_vencimento: string | null;
  valor_proxima: number | null;
  juros_previstos: number;
  tem_entrada: boolean;
  situacao: SituacaoContrato;
  percentual_quitado: number;
}

export interface ParcelaPrevia {
  numero: number;
  vencimento: string;
  valor: string; // máscara "1.234,56"
  juros: string; // máscara, opcional
}

// Diferença em centavos inteiros (somente exibição; o banco confere a soma exata)
export const centavos = (decimal: string | null) => (decimal ? Math.round(Number(decimal) * 100) : 0);
