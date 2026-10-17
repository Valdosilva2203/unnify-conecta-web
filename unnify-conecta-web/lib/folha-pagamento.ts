// Folha de Pagamento (migration 052): tipos, rótulos, etapas do fluxo e arquivos. Números e situações vêm de painel_folha_pagamento;
// a tela só exibe. Toda escrita passa pelas funções do banco, que conferem permissão e etapa a cada chamada.
import { createClient } from '@/lib/supabase/client';
import { pdfTemConteudoAtivo } from '@/lib/documentos';

export type StatusCompetencia = 'preparacao' | 'enviada' | 'em_processamento' | 'correcao_solicitada' | 'devolvida' | 'revisao_solicitada' | 'aprovada';
export type SituacaoFuncionario = 'apto' | 'a_conferir' | 'pendente';
export type TipoOcorrencia = 'horas_extras' | 'faltas' | 'atrasos' | 'comissoes' | 'bonificacoes' | 'adiantamentos' | 'ferias' | 'afastamentos'
  | 'alteracao_salarial' | 'admissao' | 'desligamento' | 'outras';
export type SituacaoJustificativa = 'justificada' | 'nao_justificada' | 'pendente';
export type CategoriaDocumento = 'anexo_ocorrencia' | 'holerite' | 'resumo' | 'liquidos' | 'guia' | 'outro' | 'comprovante';

// Adicionais/descontos lançados em Funcionários (avulsos, percentuais e recorrentes) — migration 058
export interface AjusteFolhaPagamento { id: string; tipo: 'adicional' | 'desconto'; descricao: string; valor: number; calculo?: string; recorrente: boolean }
export const somaAjustes = (a: AjusteFolhaPagamento[] | undefined, tipo: 'adicional' | 'desconto') => (a ?? []).filter((x) => x.tipo === tipo).reduce((t, x) => t + Number(x.valor), 0);
export interface FuncionarioFolha {
  id: string; nome: string; matricula: number; cargo: string | null; vinculo: string; data_admissao: string; status_funcionario: string;
  salario_base: number; ajustes?: AjusteFolhaPagamento[]; ocorrencias: number; pendencias: number; situacao: SituacaoFuncionario;
  conferencia: { sem_ocorrencias: boolean; confirmado_em: string; confirmado_por: string | null } | null;
}
export interface PendenciaFolha { id_funcionario: string; origem: 'ocorrencia' | 'rh' | 'contador'; id: string; descricao: string }
export interface PainelFolha {
  competencia: { id: string; competencia: string; status: StatusCompetencia; versao_atual: number; atualizado_em: string } | null;
  funcionarios: FuncionarioFolha[];
  pendencias: PendenciaFolha[];
  pacote: { id: string; versao: number; responsavel: string; enviado_em: string; observacoes: string | null; enviado_por: string | null } | null;
  devolucao: { id: string; numero: number; situacao: string; enviada_em: string | null; observacoes: string | null; motivo_revisao: string | null; numero_origem?: number | null;
    aprovada_em: string | null; aprovada_por: string | null; faltas: number } | null;
  pagamento: {
    salarios: { id_funcionario: string; liquido: number; id_folha: string | null; pago: number | null; pendente: number | null; total: number | null }[];
    encargos: { id_valor: string; descricao: string; valor: number; vencimento: string; id_lancamento: string | null; status: string | null }[];
  } | null;
  pode_preparar: boolean;
  pode_processar: boolean;
  contador_habilitado: boolean;
}
export interface Ocorrencia {
  id: string; id_funcionario: string; tipo: TipoOcorrencia; quantidade: number | null; valor: number | null; data_inicio: string | null; data_fim: string | null;
  situacao_justificativa: SituacaoJustificativa | null; justificativa: string | null; observacoes: string | null; criado_em: string;
}
export interface DocumentoFolha {
  id: string; categoria: CategoriaDocumento; id_funcionario: string | null; id_ocorrencia: string | null; id_devolucao: string | null; id_valor: string | null;
  caminho: string; nome_arquivo: string; tipo_mime: string; tamanho: number | null; enviado_em: string;
}
export interface EventoFolha { id: string; id_funcionario: string | null; tipo: string; descricao: string; versao: number | null; criado_em: string; id_usuario: string | null }
export interface ValorFolha { id: string; id_devolucao: string; tipo: 'liquido' | 'encargo'; id_funcionario: string | null; descricao: string | null; valor: number; vencimento: string | null }

export const STATUS_COMPETENCIA: Record<StatusCompetencia | 'nao_iniciada', { rotulo: string; cor: string }> = {
  nao_iniciada: { rotulo: 'Não iniciada', cor: 'bg-gray-100 text-gray-700' },
  preparacao: { rotulo: 'Em preparação', cor: 'bg-amber-100 text-amber-800' },
  enviada: { rotulo: 'Enviada ao contador', cor: 'bg-blue-100 text-blue-800' },
  em_processamento: { rotulo: 'Em processamento', cor: 'bg-blue-100 text-blue-800' },
  correcao_solicitada: { rotulo: 'Correção solicitada', cor: 'bg-red-100 text-red-800' },
  devolvida: { rotulo: 'Aguardando aprovação', cor: 'bg-violet-100 text-violet-800' },
  revisao_solicitada: { rotulo: 'Revisão solicitada', cor: 'bg-red-100 text-red-800' },
  aprovada: { rotulo: 'Aprovada', cor: 'bg-green-100 text-green-800' },
};

export const SITUACAO_FUNCIONARIO: Record<SituacaoFuncionario, { rotulo: string; selo: 'sucesso' | 'alerta' | 'perigo' }> = {
  apto: { rotulo: 'Apto', selo: 'sucesso' },
  a_conferir: { rotulo: 'A conferir', selo: 'alerta' },
  pendente: { rotulo: 'Pendente', selo: 'perigo' },
};

// Campos de cada tipo (mesmas regras de validar_ocorrencia_folha). "obrigatorio" = recusa; justificativa/documento pendente = pendência.
type Campo = 'quantidade' | 'valor' | 'data_inicio' | 'data_fim' | 'justificativa_situacao' | 'justificativa';
export const TIPOS_OCORRENCIA: Record<TipoOcorrencia, { rotulo: string; unidade?: string; campos: Campo[]; obrigatorios: Campo[]; rotuloTexto?: string; documento?: 'obrigatorio' | 'opcional' }> = {
  horas_extras: { rotulo: 'Horas extras', unidade: 'horas', campos: ['quantidade', 'data_inicio', 'data_fim', 'justificativa'], obrigatorios: ['quantidade'], documento: 'opcional' },
  faltas: { rotulo: 'Faltas', unidade: 'dias', campos: ['quantidade', 'data_inicio', 'data_fim', 'justificativa_situacao', 'justificativa'], obrigatorios: ['quantidade', 'data_inicio', 'justificativa_situacao'], documento: 'opcional' },
  atrasos: { rotulo: 'Atrasos', unidade: 'horas', campos: ['quantidade', 'data_inicio', 'justificativa_situacao', 'justificativa'], obrigatorios: ['quantidade', 'data_inicio', 'justificativa_situacao'], documento: 'opcional' },
  comissoes: { rotulo: 'Comissões', campos: ['valor', 'justificativa'], obrigatorios: ['valor'], rotuloTexto: 'Descrição', documento: 'opcional' },
  bonificacoes: { rotulo: 'Bonificações', campos: ['valor', 'justificativa'], obrigatorios: ['valor'], rotuloTexto: 'Descrição', documento: 'opcional' },
  adiantamentos: { rotulo: 'Adiantamentos', campos: ['valor', 'data_inicio', 'justificativa'], obrigatorios: ['valor', 'data_inicio'], rotuloTexto: 'Descrição', documento: 'opcional' },
  ferias: { rotulo: 'Férias', campos: ['data_inicio', 'data_fim', 'justificativa'], obrigatorios: ['data_inicio', 'data_fim'], rotuloTexto: 'Descrição', documento: 'opcional' },
  afastamentos: { rotulo: 'Afastamentos', campos: ['data_inicio', 'data_fim', 'justificativa'], obrigatorios: ['data_inicio', 'justificativa'], rotuloTexto: 'Motivo', documento: 'obrigatorio' },
  alteracao_salarial: { rotulo: 'Alteração salarial', campos: ['valor', 'data_inicio', 'justificativa'], obrigatorios: ['valor', 'data_inicio'], rotuloTexto: 'Motivo', documento: 'opcional' },
  admissao: { rotulo: 'Admissão', campos: ['data_inicio', 'justificativa'], obrigatorios: ['data_inicio'], rotuloTexto: 'Descrição', documento: 'opcional' },
  desligamento: { rotulo: 'Desligamento', campos: ['data_inicio', 'justificativa'], obrigatorios: ['data_inicio', 'justificativa'], rotuloTexto: 'Motivo', documento: 'opcional' },
  outras: { rotulo: 'Outras', campos: ['quantidade', 'valor', 'data_inicio', 'data_fim', 'justificativa'], obrigatorios: ['justificativa'], rotuloTexto: 'Descrição', documento: 'opcional' },
};
export const ROTULO_VALOR: Partial<Record<TipoOcorrencia, string>> = { alteracao_salarial: 'Novo salário', adiantamentos: 'Valor adiantado' };
export const ROTULO_DATA: Partial<Record<TipoOcorrencia, string>> = { alteracao_salarial: 'Vigência a partir de', admissao: 'Data de admissão', desligamento: 'Data do desligamento', adiantamentos: 'Data do adiantamento' };
export const SITUACOES_JUSTIFICATIVA: Record<SituacaoJustificativa, string> = { justificada: 'Justificada', nao_justificada: 'Não justificada', pendente: 'Justificativa pendente' };

export const CATEGORIAS_DEVOLUCAO: { id: Exclude<CategoriaDocumento, 'anexo_ocorrencia' | 'comprovante'>; rotulo: string }[] = [
  { id: 'holerite', rotulo: 'Holerite (por funcionário)' }, { id: 'resumo', rotulo: 'Resumo da folha' }, { id: 'liquidos', rotulo: 'Relação de líquidos' },
  { id: 'guia', rotulo: 'Guia de encargo' }, { id: 'outro', rotulo: 'Outro documento' },
];
export const ROTULO_CATEGORIA_DOC: Record<CategoriaDocumento, string> = {
  anexo_ocorrencia: 'Anexo da ocorrência', holerite: 'Holerite', resumo: 'Resumo da folha', liquidos: 'Relação de líquidos', guia: 'Guia', outro: 'Outro', comprovante: 'Comprovante de pagamento',
};

// Resumo legível de uma ocorrência (quantidade/valor)
export function resumoOcorrencia(o: Pick<Ocorrencia, 'tipo' | 'quantidade' | 'valor'>, moeda: (v: number) => string): string {
  const t = TIPOS_OCORRENCIA[o.tipo];
  if (o.quantidade != null && t.unidade) return `${String(Number(o.quantidade)).replace('.', ',')} ${Number(o.quantidade) === 1 ? t.unidade.replace(/s$/, '') : t.unidade}`;
  if (o.valor != null) return moeda(Number(o.valor));
  if (o.quantidade != null) return String(Number(o.quantidade)).replace('.', ',');
  return '—';
}

// ===== Fluxo da folha: 6 etapas derivadas do status persistido (a tela nunca avança etapa sozinha) =====
export type EstadoEtapa = 'aguardando' | 'em_andamento' | 'concluido' | 'correcao';
export const ETAPAS = ['Preparação', 'Envio ao contador', 'Processamento', 'Devolução', 'Aprovação', 'Pagamento'] as const;
export const ROTULO_ESTADO_ETAPA: Record<EstadoEtapa, string> = { aguardando: 'Aguardando', em_andamento: 'Em andamento', concluido: 'Concluído', correcao: 'Correção solicitada' };

export function etapasDoFluxo(status: StatusCompetencia | null, pagamentoConcluido: boolean): EstadoEtapa[] {
  const c = 'concluido', a = 'aguardando', e = 'em_andamento', x = 'correcao';
  switch (status) {
    case null: case 'preparacao': return [e, a, a, a, a, a];
    case 'correcao_solicitada': return [x, a, a, a, a, a];
    case 'enviada': return [c, c, a, a, a, a];
    case 'em_processamento': return [c, c, e, a, a, a];
    case 'revisao_solicitada': return [c, c, c, x, a, a];
    case 'devolvida': return [c, c, c, c, e, a];
    case 'aprovada': return [c, c, c, c, c, pagamentoConcluido ? c : e];
  }
}

export function pagamentoConcluido(p: PainelFolha['pagamento']): boolean {
  if (!p) return false;
  const salariosOk = p.salarios.every((s) => s.pendente != null && Number(s.pendente) === 0);
  const encargosOk = p.encargos.every((e) => e.status === 'pago');
  return (p.salarios.length + p.encargos.length) > 0 && salariosOk && encargosOk;
}

export const matricula = (n: number) => String(n).padStart(4, '0');
export const competenciaCurta = (iso: string) => `${['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;
export const dataHora = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).replace(', ', ' ') : '—');

// ===== Arquivos (bucket privado "folha"): PDF, JPG ou PNG até 10 MB, conferidos pelo conteúdo =====
export const TAMANHO_MAXIMO_ARQUIVO_FOLHA = 10 * 1024 * 1024;
export async function validarArquivoFolha(arquivo: File): Promise<{ erro: string } | { ext: 'pdf' | 'jpg' | 'png'; mime: string }> {
  if (arquivo.size === 0 || arquivo.size > TAMANHO_MAXIMO_ARQUIVO_FOLHA) return { erro: 'O arquivo deve ter até 10 MB.' };
  const b = new Uint8Array(await arquivo.arrayBuffer());
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) {
    if (pdfTemConteudoAtivo(b)) return { erro: 'PDF com conteúdo ativo (scripts ou arquivos embutidos) não é aceito.' };
    return { ext: 'pdf', mime: 'application/pdf' };
  }
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: 'png', mime: 'image/png' };
  return { erro: 'Envie um PDF, JPG ou PNG.' };
}

// Envia para o bucket e registra pela função informada; se o registro falhar, o envio é descartado
export async function enviarArquivoFolha(idEmpresa: string, arquivo: File, registrar: (caminho: string) => Promise<{ error: unknown }>): Promise<string | null> {
  const v = await validarArquivoFolha(arquivo);
  if ('erro' in v) return v.erro;
  const caminho = `${idEmpresa}/${crypto.randomUUID()}.${v.ext}`;
  const supabase = createClient();
  const { error } = await supabase.storage.from('folha').upload(caminho, arquivo, { contentType: v.mime, upsert: false });
  if (error) return 'Não foi possível enviar o arquivo. Verifique sua permissão para esta empresa.';
  const reg = await registrar(caminho);
  if (reg.error) {
    await supabase.storage.from('folha').remove([caminho]);
    return (reg.error as { message?: string }).message || 'Não foi possível registrar o arquivo.';
  }
  return null;
}

// Visualizar/baixar: URL temporária de 60 s, autorizada pela política do Storage
export async function abrirArquivoFolha(caminho: string, nome: string): Promise<string | null> {
  const janela = window.open('', '_blank');
  if (!janela) return 'Permita pop-ups para abrir o arquivo.';
  const { data, error } = await createClient().storage.from('folha').createSignedUrl(caminho, 60);
  if (error || !data?.signedUrl) { janela.close(); return `Não foi possível abrir "${nome}".`; }
  janela.opener = null;
  janela.location.href = data.signedUrl;
  return null;
}
