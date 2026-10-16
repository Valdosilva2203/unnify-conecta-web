// Portal do Colaborador + Ponto (migration 056). Tipos e rótulos compartilhados por RH e colaborador.
export type TipoMarcacao = 'entrada' | 'saida_intervalo' | 'retorno_intervalo' | 'saida' | 'outra';
export const TIPOS_MARCACAO: Record<TipoMarcacao, string> = {
  entrada: 'Entrada', saida_intervalo: 'Saída para intervalo', retorno_intervalo: 'Retorno do intervalo', saida: 'Saída', outra: 'Outra marcação',
};
export const SEQUENCIA: TipoMarcacao[] = ['entrada', 'saida_intervalo', 'retorno_intervalo', 'saida'];
// Próxima marcação sugerida pelo que já foi registrado hoje (o banco não impõe a ordem para não bloquear marcação legítima)
export function proximaMarcacao(feitas: { tipo: string; desconsiderada?: boolean }[]): TipoMarcacao {
  const validas = feitas.filter((m) => !m.desconsiderada && m.tipo !== 'outra');
  if (!validas.length) return 'entrada';
  const ultima = validas[validas.length - 1].tipo as TipoMarcacao;
  if (ultima === 'saida') return 'entrada';
  return SEQUENCIA[SEQUENCIA.indexOf(ultima) + 1] ?? 'saida';
}

export interface VinculoColaborador {
  id_funcionario: string; id_empresa: string; empresa: string; nome: string; cargo: string | null; vinculo: string; data_admissao: string; matricula: number | null; email: string | null;
}
export interface MarcacaoPonto {
  id: string; tipo: TipoMarcacao; registrado_em: string; data_local: string; origem: 'portal' | 'correcao'; desconsiderada: boolean;
  situacao_foto: string; situacao_localizacao: string; foto_caminho: string | null;
}
export interface DiaEspelho {
  data: string; previsto: string | null; registrado: string | null; previsto_minutos: number; trabalhado_minutos: number; excedente_minutos: number; atraso_minutos: number;
  ausencia: boolean; incompleta: boolean; intervalo_inconsistente: boolean; nao_previsto: boolean; feriado: boolean; em_andamento: boolean;
  id_apuracao: string | null; situacao: SituacaoApuracao | null; pedido_esclarecimento: string | null; resposta_colaborador: string | null;
}
export type Escala = Record<string, [string, string][]>;
export interface JornadaColaborador {
  jornada: { vigente_desde: string; escala: Escala; tolerancia_minutos: number; intervalo_minimo_minutos: number } | null;
  proximos_feriados: { data: string; descricao: string }[];
  dias: DiaEspelho[];
}
export interface SolicitacaoPonto {
  id: string; tipo: 'incluir' | 'desconsiderar'; data: string; horario: string | null; tipo_marcacao: TipoMarcacao | null; id_marcacao: string | null;
  motivo: string; situacao: 'pendente' | 'aprovada' | 'recusada' | 'cancelada'; resposta: string | null; criado_em: string; dia_seguinte?: boolean;
}

export type SituacaoApuracao = 'apurada' | 'esclarecimento' | 'conferida' | 'integrada';
export const SITUACOES_APURACAO: Record<SituacaoApuracao, { rotulo: string; selo: 'sucesso' | 'alerta' | 'perigo' | 'info' | 'neutro' | 'roxo' }> = {
  apurada: { rotulo: 'A conferir', selo: 'alerta' }, esclarecimento: { rotulo: 'Esclarecimento', selo: 'info' },
  conferida: { rotulo: 'Conferida', selo: 'sucesso' }, integrada: { rotulo: 'Enviada à folha', selo: 'roxo' },
};
export type Classificacao = 'hora_extra' | 'banco_horas' | 'compensacao' | 'falta' | 'falta_justificada' | 'abonada' | 'atraso' | 'atraso_justificado' | 'ciente';
export const CLASSIFICACOES: Record<Classificacao, string> = {
  hora_extra: 'Hora extra', banco_horas: 'Banco de horas', compensacao: 'Compensação', falta: 'Falta não justificada', falta_justificada: 'Falta justificada',
  abonada: 'Abonada', atraso: 'Horas a menos (não justificadas)', atraso_justificado: 'Horas a menos (justificadas)', ciente: 'Ciente (sem reflexo na folha)',
};
export const EXIGE_JUSTIFICATIVA: Classificacao[] = ['falta_justificada', 'abonada', 'atraso_justificado', 'compensacao'];
export interface Apuracao {
  id: string; id_funcionario: string; funcionario: string; matricula: number | null; data: string; previsto_minutos: number; trabalhado_minutos: number;
  excedente_minutos: number; atraso_minutos: number; ausencia: boolean; intervalo_inconsistente: boolean; incompleta: boolean; dia_nao_previsto: boolean; feriado: boolean;
  jornada_prevista: string | null; jornada_registrada: string | null; situacao: SituacaoApuracao; classificacao: Classificacao | null; justificativa: string | null;
  pedido_esclarecimento: string | null; resposta_colaborador: string | null; tratamento_padrao: 'conferir' | 'hora_extra' | 'banco_horas' | null; ocorrencia_processada: boolean;
}
// Mesmas regras do banco (conferir_apuracao_ponto): horas registradas nunca são apagadas
export function classificacoesPermitidas(a: Pick<Apuracao, 'excedente_minutos' | 'ausencia' | 'atraso_minutos'>): Classificacao[] {
  if (a.excedente_minutos > 0) return ['hora_extra', 'banco_horas', 'compensacao'];
  if (a.ausencia) return ['falta', 'falta_justificada', 'abonada'];
  if (a.atraso_minutos > 0) return ['atraso', 'atraso_justificado', 'compensacao'];
  return ['ciente'];
}
export function sinaisApuracao(a: { excedente_minutos: number; atraso_minutos: number; ausencia: boolean; intervalo_inconsistente: boolean; incompleta: boolean; dia_nao_previsto?: boolean; nao_previsto?: boolean; feriado: boolean }) {
  const s: string[] = [];
  if (a.incompleta) s.push('Marcações incompletas');
  if (a.ausencia) s.push('Ausência');
  if (a.dia_nao_previsto || a.nao_previsto) s.push(a.feriado ? 'Trabalho em feriado' : 'Trabalho em dia não previsto');
  if (a.excedente_minutos > 0) s.push(`Horas excedentes: ${duracao(a.excedente_minutos)}`);
  if (a.atraso_minutos > 0) s.push(`Horas a menos: ${duracao(a.atraso_minutos)}`);
  if (a.intervalo_inconsistente) s.push('Intervalo inconsistente');
  return s;
}

export const duracao = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
export const horaLocal = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const dataLocal = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
// Hora da marcação; "(+1)" quando caiu no dia seguinte ao da jornada (turno que virou a meia-noite)
export const horaMarcacao = (iso: string, dataJornada: string) => `${horaLocal(iso)}${dataLocal(iso) > dataJornada ? ' (+1)' : ''}`;
export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const diaDaSemana = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

export const SENHA_REGRAS: [string, (s: string) => boolean][] = [
  ['Pelo menos 8 caracteres', (s) => s.length >= 8 && s.length <= 72], ['Uma letra maiúscula', (s) => /[A-Z]/.test(s)], ['Uma letra minúscula', (s) => /[a-z]/.test(s)],
  ['Um número', (s) => /[0-9]/.test(s)], ['Um caractere especial', (s) => /[^A-Za-z0-9]/.test(s)],
];
export const CHAVE_CONVITE = 'unnify_convite_colaborador';
export const CHAVE_VINCULO = 'unnify_vinculo_colaborador';
export const AVISO_REP = 'Controle auxiliar de jornada integrado ao RH. Não é um REP-P homologado (Portaria MTP 671/2021).';
