// Documentos e Obrigações (E3). Regras de acesso ficam no banco (migration 000032); aqui só rótulos e validação de arquivo.

export const CATEGORIAS_DOCUMENTO = {
  contratos: 'Contratos',
  societarios: 'Documentos societários',
  fiscais: 'Documentos fiscais',
  contabeis: 'Documentos contábeis',
  comprovantes: 'Comprovantes',
  outros: 'Outros',
} as const;
export type CategoriaDocumento = keyof typeof CATEGORIAS_DOCUMENTO;

export const ORIGENS_DOCUMENTO = { empresa: 'Enviado pela empresa', contador: 'Enviado pelo contador' } as const;

export const STATUS_SOLICITACAO = {
  pendente: 'Pendente',
  enviado: 'Enviado',
  aceito: 'Aceito',
  correcao_solicitada: 'Correção solicitada',
  cancelado: 'Cancelado',
} as const;
export type StatusSolicitacao = keyof typeof STATUS_SOLICITACAO;
export const SELO_SOLICITACAO = { pendente: 'alerta', enviado: 'info', aceito: 'sucesso', correcao_solicitada: 'perigo', cancelado: 'neutro' } as const;

export const CATEGORIAS_OBRIGACAO = { fiscal: 'Fiscal', contabil: 'Contábil', trabalhista: 'Trabalhista', societaria: 'Societária', outras: 'Outras' } as const;
export type CategoriaObrigacao = keyof typeof CATEGORIAS_OBRIGACAO;
export const SITUACOES_OBRIGACAO = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída', atrasada: 'Atrasada', cancelada: 'Cancelada' } as const;
export type SituacaoObrigacao = keyof typeof SITUACOES_OBRIGACAO;
export const SELO_OBRIGACAO = { pendente: 'alerta', em_andamento: 'info', concluida: 'sucesso', atrasada: 'perigo', cancelada: 'neutro' } as const;

export interface Documento {
  id: string;
  id_empresa: string;
  nome: string;
  categoria: CategoriaDocumento;
  caminho: string;
  nome_arquivo_original: string;
  tipo_mime: string;
  tamanho: number;
  origem: keyof typeof ORIGENS_DOCUMENTO;
  compartilhado_contador: boolean;
  id_solicitacao: string | null;
  enviado_por: string | null;
  enviado_em: string;
}

export interface Solicitacao {
  id: string;
  id_empresa: string;
  titulo: string;
  descricao: string | null;
  prazo: string | null;
  status: StatusSolicitacao;
  id_documento: string | null;
  motivo_correcao: string | null;
  motivo_cancelamento: string | null;
  criado_em: string;
  respondido_em: string | null;
  analisado_em: string | null;
}

export interface Obrigacao {
  id: string;
  id_empresa: string;
  titulo: string;
  descricao: string | null;
  categoria: CategoriaObrigacao;
  id_responsavel: string | null;
  data_vencimento: string;
  status: Exclude<SituacaoObrigacao, 'atrasada'>;
  situacao: SituacaoObrigacao;
  dias_para_vencer: number;
  observacoes: string | null;
  id_documento: string | null;
  id_tarefa: string | null;
  motivo_cancelamento: string | null;
}

// Tamanho máximo do arquivo: configurável (NEXT_PUBLIC_DOCUMENTOS_TAMANHO_MAXIMO_MB), nunca acima do limite do bucket (10 MB).
// Padrão 4 MB: o envio passa por uma rota do servidor e a Vercel limita o corpo da requisição a 4,5 MB.
export const LIMITE_BUCKET_BYTES = 10 * 1024 * 1024;
export function tamanhoMaximoBytes(): number {
  const mb = Number(process.env.NEXT_PUBLIC_DOCUMENTOS_TAMANHO_MAXIMO_MB ?? 4);
  return Math.min(LIMITE_BUCKET_BYTES, Math.max(1, Number.isFinite(mb) ? mb : 4) * 1024 * 1024);
}

export const formatarTamanho = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export type TipoArquivo = { mime: 'application/pdf' | 'image/jpeg' | 'image/png'; extensao: 'pdf' | 'jpg' | 'png' };

// Tipo REAL pelo conteúdo (assinatura dos primeiros bytes), não pelo nome nem pelo tipo informado pelo navegador
export function detectarTipo(bytes: Uint8Array): TipoArquivo | null {
  const comeca = (assinatura: number[]) => assinatura.every((b, i) => bytes[i] === b);
  if (comeca([0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: 'application/pdf', extensao: 'pdf' }; // %PDF-
  if (comeca([0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', extensao: 'jpg' };
  if (comeca([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', extensao: 'png' };
  return null;
}

const EXTENSOES_ACEITAS: Record<string, TipoArquivo['extensao']> = { pdf: 'pdf', jpg: 'jpg', jpeg: 'jpg', png: 'png' };
export const extensaoDoNome = (nome: string) => EXTENSOES_ACEITAS[(nome.split('.').pop() ?? '').toLowerCase()] ?? null;

// PDF com conteúdo ativo (scripts, ações automáticas, arquivos embutidos) é recusado
const MARCADORES_ATIVOS = ['/JavaScript', '/JS', '/Launch', '/EmbeddedFile', '/RichMedia', '/XFA', '/AA', '/SubmitForm', '/ImportData'];
export function pdfTemConteudoAtivo(bytes: Uint8Array): boolean {
  const texto = new TextDecoder('latin1').decode(bytes);
  return MARCADORES_ATIVOS.some((m) => new RegExp(`${m.replace('/', '\\/')}(?![A-Za-z])`).test(texto));
}

// Nome exibido: sem caracteres de controle nem caminhos; até 150 caracteres
export function nomeSeguro(nome: string, padrao: string): string {
  const limpo = nome.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
  return limpo || padrao.slice(0, 150) || 'Documento';
}
