// Impostos e parcelamentos tributários — tipos, rótulos e utilidades. Dados reais vêm das funções da migration 045
// (buscar_impostos, listar_parcelamentos_tributarios, resumo_impostos…). Cada imposto/parcela tem UM lançamento em
// Contas a pagar; "pago" vem da baixa no Financeiro; "pagamento informado" não conta como pago.

export type SituacaoImposto = 'pendente' | 'vencido' | 'pagamento_informado' | 'pago' | 'cancelado';
export type TipoImposto = 'das' | 'fgts' | 'darf' | 'iss' | 'icms' | 'pis_cofins' | 'inss' | 'outro';

export interface ImpostoLinha {
  id: string; id_parcelamento: string | null; numero_parcela: number | null; tipo: TipoImposto | 'parcelamento'; nome: string; orgao: string;
  competencia: string | null; vencimento: string; valor: number; descricao: string | null; situacao: SituacaoImposto; data_pagamento: string | null;
  data_pagamento_informada: string | null; id_lancamento: string; guia_caminho: string | null; guia_nome: string | null; guia_tamanho: number | null;
  guia_enviada_em: string | null; comprovantes: number; total: number;
}
export interface ParcelamentoLinha {
  id: string; tributo: string; orgao: string; numero_acordo: string; valor_negociado: number; observacoes: string | null;
  situacao: 'em_andamento' | 'concluido' | 'cancelado'; parcelas: number; pagas: number; saldo: number; proximo_vencimento: string | null; atrasadas: number; criado_em: string;
}
export interface ResumoImpostos { a_pagar: number; qtd_a_pagar: number; vencidos: number; vencendo_7: number; guias: number; pagos_90: number }

export const TIPOS_IMPOSTO: Record<TipoImposto, { rotulo: string; orgao: string }> = {
  das: { rotulo: 'DAS – Simples Nacional', orgao: 'Receita Federal' },
  fgts: { rotulo: 'FGTS Digital', orgao: 'Caixa Econômica Federal' },
  darf: { rotulo: 'DARF – IRPJ/CSLL', orgao: 'Receita Federal' },
  iss: { rotulo: 'ISSQN', orgao: 'Prefeitura Municipal' },
  icms: { rotulo: 'ICMS', orgao: 'Secretaria da Fazenda Estadual' },
  pis_cofins: { rotulo: 'PIS/COFINS', orgao: 'Receita Federal' },
  inss: { rotulo: 'INSS (GPS/DCTFWeb)', orgao: 'Receita Federal' },
  outro: { rotulo: 'Outro tributo', orgao: '' },
};
export const SITUACAO: Record<SituacaoImposto, { rotulo: string; selo: 'alerta' | 'perigo' | 'info' | 'sucesso' | 'neutro' }> = {
  pendente: { rotulo: 'Pendente', selo: 'alerta' },
  vencido: { rotulo: 'Vencido', selo: 'perigo' },
  pagamento_informado: { rotulo: 'Pagamento informado', selo: 'info' },
  pago: { rotulo: 'Pago', selo: 'sucesso' },
  cancelado: { rotulo: 'Cancelado', selo: 'neutro' },
};
export const SITUACAO_PARCELAMENTO: Record<ParcelamentoLinha['situacao'], { rotulo: string; selo: 'info' | 'sucesso' | 'neutro' }> = {
  em_andamento: { rotulo: 'Em andamento', selo: 'info' },
  concluido: { rotulo: 'Concluído', selo: 'sucesso' },
  cancelado: { rotulo: 'Cancelado', selo: 'neutro' },
};
export const ROTULO_HISTORICO: Record<string, string> = {
  criado: 'Imposto cadastrado', editado: 'Dados alterados', guia_enviada: 'Guia enviada', comprovante_enviado: 'Comprovante anexado',
  pagamento_informado: 'Pagamento informado (aguarda confirmação)', pagamento_confirmado: 'Pagamento confirmado no Financeiro', cancelado: 'Cancelado',
  parcelamento_criado: 'Parcelamento cadastrado', parcelamento_cancelado: 'Parcelamento cancelado',
  guia_excluida: 'Guia excluída', excluido: 'Imposto excluído', parcelamento_excluido: 'Parcelamento excluído',
};

export const competenciaRotulo = (c: string | null) => (c ? `${c.slice(5, 7)}/${c.slice(0, 4)}` : '—');
export const ARQUIVOS_IMPOSTO: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
export const TAMANHO_MAXIMO_ARQUIVO_IMPOSTO = 10 * 1024 * 1024;

// Divide o valor negociado em parcelas mensais (diferença de centavos na última); cada parcela pode ser ajustada depois
export function gerarParcelas(total: number, n: number, primeiro: string): { vencimento: string; valor: number }[] {
  const base = Math.floor((total / n) * 100) / 100;
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(`${primeiro}T12:00:00Z`); const dia = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + i);
    const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(dia, ultimo)); // 31/01 → 28/02 (sem pular mês)
    return { vencimento: d.toISOString().slice(0, 10), valor: i === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base };
  });
}
