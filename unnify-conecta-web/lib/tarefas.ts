// Tarefas: base única para 'empresa', 'escritorio' e 'plataforma' (administração do Unnify).
// O banco decide quem acessa cada contexto (pode_acessar_contexto_tarefas); a tela só informa o contexto.

export type ContextoTarefas = 'empresa' | 'escritorio' | 'plataforma';
export type StatusTarefa = 'pendente' | 'em_andamento' | 'concluida' | 'cancelada';
export type Prioridade = 'baixa' | 'media' | 'alta';
export type VisaoTarefas = 'todas' | 'minhas' | 'criadas' | 'concluidas' | 'canceladas' | 'arquivadas';

export interface Tarefa {
  id: string;
  titulo: string;
  descricao: string | null;
  prioridade: Prioridade;
  status: StatusTarefa;
  atrasada: boolean;
  prazo: string | null;
  hora: string | null;
  id_categoria: string | null;
  categoria_nome: string | null;
  categoria_cor: string | null;
  categoria_icone: string | null;
  id_responsavel: string | null;
  responsavel_nome: string | null;
  criado_por: string | null;
  arquivada: boolean;
  qtd_comentarios: number;
  qtd_anexos: number;
  checklist_total: number;
  checklist_feitos: number;
  total: number;
}

export interface CategoriaTarefa {
  id: string;
  nome: string;
  cor: string;
  icone: string;
  ativa: boolean;
}

export interface Membro {
  id_usuario: string;
  nome: string;
  email: string;
}

export interface ResumoTarefas {
  hoje: string;
  pendentes: number;
  em_andamento: number;
  concluidas: number;
  atrasadas: number;
  dias_com_tarefas: string[];
  categorias: { id: string; nome: string; cor: string; icone: string; qtd: number }[];
}

export const ROTULO_STATUS: Record<StatusTarefa, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};
export const SELO_STATUS = { pendente: 'alerta', em_andamento: 'info', concluida: 'sucesso', cancelada: 'neutro' } as const;

export const ROTULO_PRIORIDADE: Record<Prioridade, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
export const SELO_PRIORIDADE = { alta: 'perigo', media: 'alerta', baixa: 'sucesso' } as const;

export const VISOES: { id: VisaoTarefas; titulo: string }[] = [
  { id: 'todas', titulo: 'Todas' },
  { id: 'minhas', titulo: 'Minhas tarefas' },
  { id: 'criadas', titulo: 'Criadas por mim' },
  { id: 'concluidas', titulo: 'Concluídas' },
  { id: 'canceladas', titulo: 'Canceladas' },
  { id: 'arquivadas', titulo: 'Arquivadas' },
];

export const iniciais = (nome: string | null | undefined) =>
  (nome ?? '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

// Pasta dos anexos: <id_empresa ou 'plataforma'>/<id_tarefa>/<arquivo> (validada pelo banco)
export const pastaAnexos = (idEmpresa: string | null, idTarefa: string) => `${idEmpresa ?? 'plataforma'}/${idTarefa}`;
