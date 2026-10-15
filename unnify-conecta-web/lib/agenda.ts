// Agenda — tipos, rótulos e datas. Tudo no fuso America/Sao_Paulo (o banco guarda timestamptz; o Brasil não tem horário de verão
// desde 2019, então o deslocamento é -03:00). Dados vêm de agenda_eventos (migration 037); nada é calculado aqui além de exibição.

export const FUSO = 'America/Sao_Paulo';
export type Origem = 'compromisso' | 'tarefa' | 'obrigacao' | 'financeiro';
export type StatusAgenda = 'agendado' | 'confirmado' | 'pendente' | 'em_andamento' | 'atrasado' | 'concluido' | 'cancelado';
export type CategoriaCompromisso = 'reuniao' | 'consulta' | 'visita' | 'treinamento' | 'pessoal' | 'outro';

export interface EventoAgenda {
  origem: Origem;
  id: string;
  titulo: string;
  descricao: string | null;
  local: string | null;
  inicio: string;
  fim: string;
  dia_inteiro: boolean;
  categoria: string;
  status: StatusAgenda;
  status_origem: string;
  id_responsavel: string | null;
  responsavel_nome: string | null;
  visibilidade: 'privado' | 'empresa' | 'compartilhado' | null;
  valor: number | null;
  link: string;
  editavel: boolean;
  id_empresa?: string | null;     // só na agenda do contador (null = compromisso pessoal)
  empresa_nome?: string | null;
}

export const CATEGORIAS: Record<CategoriaCompromisso, { rotulo: string; cor: string }> = {
  reuniao: { rotulo: 'Reunião', cor: '#3b82f6' },
  consulta: { rotulo: 'Consulta', cor: '#8b5cf6' },
  visita: { rotulo: 'Visita', cor: '#0ea5e9' },
  treinamento: { rotulo: 'Treinamento', cor: '#10b981' },
  pessoal: { rotulo: 'Pessoal', cor: '#ec4899' },
  outro: { rotulo: 'Outro', cor: '#6b7280' },
};
export const ORIGENS: Record<Origem, string> = { compromisso: 'Compromisso', tarefa: 'Tarefa', obrigacao: 'Obrigação', financeiro: 'Vencimento' };

// Cor e rótulo curto de cada evento (compromisso pela categoria; demais pela origem)
export function estiloEvento(e: Pick<EventoAgenda, 'origem' | 'categoria'>): { cor: string; rotulo: string } {
  if (e.origem === 'compromisso') return { cor: CATEGORIAS[e.categoria as CategoriaCompromisso]?.cor ?? '#6b7280', rotulo: CATEGORIAS[e.categoria as CategoriaCompromisso]?.rotulo ?? 'Compromisso' };
  if (e.origem === 'tarefa') return { cor: '#22c55e', rotulo: 'Tarefa' };
  if (e.origem === 'obrigacao') return { cor: '#7c3aed', rotulo: 'Obrigação' };
  return e.categoria === 'receber' ? { cor: '#059669', rotulo: 'A receber' } : { cor: '#ef4444', rotulo: 'Vencimento' };
}

export const STATUS: Record<StatusAgenda, { rotulo: string; selo: 'info' | 'sucesso' | 'alerta' | 'perigo' | 'neutro' }> = {
  agendado: { rotulo: 'Agendado', selo: 'info' },
  confirmado: { rotulo: 'Confirmado', selo: 'sucesso' },
  pendente: { rotulo: 'Pendente', selo: 'alerta' },
  em_andamento: { rotulo: 'Em andamento', selo: 'info' },
  atrasado: { rotulo: 'Atrasado', selo: 'perigo' },
  concluido: { rotulo: 'Concluído', selo: 'sucesso' },
  cancelado: { rotulo: 'Cancelado', selo: 'neutro' },
};
export const GRUPO_STATUS: Record<string, StatusAgenda[]> = {
  abertos: ['agendado', 'confirmado', 'pendente', 'em_andamento'],
  atrasado: ['atrasado'],
  concluido: ['concluido'],
  cancelado: ['cancelado'],
};

// ===== Datas (strings AAAA-MM-DD sempre no fuso de São Paulo) =====
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false });
export const diaDe = (ts: string | Date) => fmtDia.format(new Date(ts));
export const horaDe = (ts: string | Date) => fmtHora.format(new Date(ts));
export const hojeSP = () => diaDe(new Date());
// Data + hora local de São Paulo → instante absoluto (ISO com deslocamento)
export const paraInstante = (dia: string, hora: string) => `${dia}T${hora}:00-03:00`;

export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const diaDaSemana = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 = domingo
export const inicioDaSemana = (dia: string) => somarDias(dia, -diaDaSemana(dia));
export const inicioDoMes = (dia: string) => `${dia.slice(0, 7)}-01`;
export function somarMeses(dia: string, n: number): string {
  const [a, m] = dia.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}
export const fimDoMes = (dia: string) => somarDias(somarMeses(inicioDoMes(dia), 1), -1);
// Grade mensal: 6 semanas a partir do domingo anterior ao dia 1 (42 dias)
export function gradeDoMes(dia: string): string[] {
  const ini = inicioDaSemana(inicioDoMes(dia));
  return Array.from({ length: 42 }, (_, i) => somarDias(ini, i));
}
// Dias que um evento ocupa (fim é exclusivo: evento de dia inteiro de 13/10 termina 14/10 00:00)
export function diasDoEvento(e: Pick<EventoAgenda, 'inicio' | 'fim'>): string[] {
  const ini = diaDe(e.inicio);
  const ult = diaDe(new Date(new Date(e.fim).getTime() - 1));
  const dias: string[] = [];
  for (let d = ini; d <= ult && dias.length < 32; d = somarDias(d, 1)) dias.push(d);
  return dias;
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
export const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const rotuloMesAno = (dia: string) => `${MESES[Number(dia.slice(5, 7)) - 1]} de ${dia.slice(0, 4)}`;
export const rotuloDiaLongo = (dia: string) => `${SEMANA[diaDaSemana(dia)]}, ${Number(dia.slice(8, 10))} de ${MESES[Number(dia.slice(5, 7)) - 1]} de ${dia.slice(0, 4)}`;
export const rotuloDiaCurto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
export const horarioEvento = (e: Pick<EventoAgenda, 'inicio' | 'fim' | 'dia_inteiro'>) => (e.dia_inteiro ? 'Dia inteiro' : `${horaDe(e.inicio)} - ${horaDe(e.fim)}`);
