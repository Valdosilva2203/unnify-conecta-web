// Funcionários (Etapa 1) — tipos e rótulos. Números vêm de resumo_folha/evolucao_folha (migration 038); nada é somado aqui
// além dos totais do painel (soma das linhas já calculadas no banco).

export type Vinculo = 'clt' | 'pj' | 'estagio' | 'temporario' | 'autonomo' | 'outro';
export type SituacaoFolha = 'pago' | 'parcial' | 'pendente' | 'atrasado' | 'cancelada';

export const VINCULOS: Record<Vinculo, string> = {
  clt: 'CLT', pj: 'PJ', estagio: 'Estágio', temporario: 'Temporário', autonomo: 'Autônomo', outro: 'Outro',
};
export const SITUACOES: Record<SituacaoFolha, { rotulo: string; selo: 'sucesso' | 'alerta' | 'perigo' | 'info' | 'neutro' }> = {
  pago: { rotulo: 'Pago', selo: 'sucesso' },
  parcial: { rotulo: 'Parcial', selo: 'alerta' },
  pendente: { rotulo: 'Pendente', selo: 'info' },
  atrasado: { rotulo: 'Atrasado', selo: 'perigo' },
  cancelada: { rotulo: 'Cancelada', selo: 'neutro' },
};

export interface LinhaFolha {
  id_funcionario: string;
  nome: string;
  cargo: string | null;
  vinculo: Vinculo;
  data_admissao: string;
  status_funcionario: 'ativo' | 'inativo';
  id_folha: string;
  salario_base: number;
  adicionais: number;
  descontos: number;
  total: number;
  pago: number;
  pendente: number;
  vencimento: string;
  situacao: SituacaoFolha;
  ultimo_pagamento: string | null;
}

export interface Funcionario {
  id: string;
  nome: string;
  cargo: string | null;
  data_admissao: string;
  vinculo: Vinculo;
  salario_base: number;
  dia_pagamento: number;
  pagamento_mes_seguinte: boolean;
  status: 'ativo' | 'inativo';
  data_desligamento: string | null;
  observacoes: string | null;
}

export interface Ajuste {
  id: string; id_folha: string; tipo: 'adicional' | 'desconto'; descricao: string; valor: number; criado_em: string;
  modalidade?: 'fixo' | 'percentual'; percentual?: number | null; valor_base?: number | null; id_recorrencia?: string | null;
}

// Percentual: aceita "7,5" (até 4 casas decimais). Devolve o número em texto com ponto, ou null se inválido.
export function paraPercentual(texto: string): string | null {
  const t = texto.trim().replace(',', '.');
  if (!/^\d{1,4}(\.\d{1,4})?$/.test(t) || Number(t) <= 0) return null;
  return t;
}
// Prévia do valor (o banco recalcula com a base gravada na competência): base × percentual / 100, arredondado em centavos
export const valorPercentual = (base: number, percentual: string) => Math.round((Math.round(base * 100) * Number(percentual)) / 100) / 100;
export const textoPercentual = (p: number) => `${String(Number(p)).replace('.', ',')}%`;
// "10% sobre o salário-base de R$ 2.200,00" (só ajustes percentuais)
export const calculoDoAjuste = (a: Ajuste, moeda: (v: number) => string) =>
  a.modalidade === 'percentual' && a.percentual != null && a.valor_base != null ? `${textoPercentual(a.percentual)} sobre o salário-base de ${moeda(a.valor_base)}` : null;
export interface EventoHistorico { tipo: 'pagamento' | 'adicional' | 'desconto' | 'salario'; data: string; competencia: string; descricao: string; valor: number; situacao: string | null }

export const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
