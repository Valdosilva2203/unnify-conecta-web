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

export interface Ajuste { id: string; id_folha: string; tipo: 'adicional' | 'desconto'; descricao: string; valor: number; criado_em: string }
export interface EventoHistorico { tipo: 'pagamento' | 'adicional' | 'desconto' | 'salario'; data: string; competencia: string; descricao: string; valor: number; situacao: string | null }

export const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
