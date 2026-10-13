// Gastos fixos: um só cadastro (gastos_fixos) para empresas e para a plataforma (Admin Master).
// Datas da recorrência, ocorrências e indicadores vêm do banco (datas_gasto_fixo, ocorrencias_gastos_fixos, resumo_gastos_fixos).

export type ContextoGasto = 'empresa' | 'plataforma';
export type Recorrencia = 'mensal' | 'semanal' | 'trimestral' | 'anual';
export type TipoValor = 'fixo' | 'variavel';
export type SituacaoGasto = 'ativo' | 'pausado' | 'encerrado';

export const RECORRENCIAS: Record<Recorrencia, string> = {
  mensal: 'Mensal',
  semanal: 'Semanal',
  trimestral: 'Trimestral',
  anual: 'Anual',
};
export const TIPOS_VALOR: Record<TipoValor, string> = { fixo: 'Valor fixo', variavel: 'Valor variável' };
export const ROTULO_SITUACAO_GASTO: Record<SituacaoGasto, string> = { ativo: 'Ativo', pausado: 'Pausado', encerrado: 'Encerrado' };
export const SELO_SITUACAO_GASTO = { ativo: 'sucesso', pausado: 'alerta', encerrado: 'neutro' } as const;

const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export interface GastoFixo {
  id: string;
  contexto: ContextoGasto;
  id_empresa: string | null;
  nome: string;
  contraparte: string | null;
  id_categoria: string;
  categoria_nome: string;
  categoria_cor: string;
  categoria_icone: string;
  subcategoria: string | null;
  tipo_valor: TipoValor;
  valor: number;
  recorrencia: Recorrencia;
  dia_vencimento: number | null;
  data_inicio: string;
  data_termino: string | null;
  id_conta_financeira: string | null;
  conta_nome: string | null;
  observacoes: string | null;
  situacao: SituacaoGasto;
  criado_em: string;
  proximo_vencimento: string | null;
}

export interface OcorrenciaGasto {
  id: string;
  contexto: ContextoGasto;
  id_gasto_fixo: string;
  competencia: string;
  data_vencimento: string;
  valor: number;
  status: 'pendente' | 'pago' | 'cancelado';
  situacao: 'pendente' | 'vencido' | 'pago' | 'cancelado';
  data_pagamento: string | null;
  nome: string;
}

export interface ResumoGastos {
  total_mes: number;
  gastos_ativos: number;
  gastos_pausados: number;
  pago_mes: number;
  qtd_pagas: number;
  pendente_mes: number;
  qtd_pendentes: number;
  por_categoria: { id: string; categoria: string; cor: string; icone: string; valor: number }[];
}

// "Dia 25" / "Toda segunda" (semanal: dia da semana da data de início)
export function rotuloVencimento(g: Pick<GastoFixo, 'recorrencia' | 'dia_vencimento' | 'data_inicio'>): string {
  if (g.recorrencia === 'semanal') {
    const d = new Date(`${g.data_inicio}T12:00:00Z`).getUTCDay();
    return `${d === 0 || d === 6 ? 'Todo' : 'Toda'} ${DIAS_SEMANA[d]}`;
  }
  return `Dia ${String(g.dia_vencimento ?? '').padStart(2, '0')}`;
}

export const diasAte = (iso: string, hoje: string) => Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86400000);

export function rotuloPrazo(iso: string, hoje: string): string {
  const d = diasAte(iso, hoje);
  if (d === 0) return 'Vence hoje';
  if (d === 1) return 'Vence amanhã';
  if (d > 1) return `Vence em ${d} dias`;
  return d === -1 ? 'Venceu ontem' : `Venceu há ${-d} dias`;
}
