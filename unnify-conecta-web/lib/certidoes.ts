// Certidões da empresa (migration 048): tipos, rótulos e envio do PDF. Dados vêm de certidoes_situacao (RLS) e as escritas
// passam por salvar_certidao / arquivar_certidao, que conferem a permissão a cada chamada.
import { createClient } from '@/lib/supabase/client';
import { pdfTemConteudoAtivo } from '@/lib/documentos';
import type { TipoCertidaoFederal } from '@/lib/leitura-pdf';

export type TipoCertidao = 'federal' | 'fgts' | 'trabalhista' | 'estadual' | 'municipal' | 'outra';
export type SituacaoCertidao = 'valida' | 'vencendo' | 'vencida' | 'sem_validade';

export interface Certidao {
  id: string; id_empresa: string; tipo: TipoCertidao; nome: string; orgao_emissor: string; resultado: TipoCertidaoFederal | null;
  data_emissao: string; data_validade: string | null; codigo_controle: string | null; observacoes: string | null; versao_atual: number;
  situacao: SituacaoCertidao; dias_para_vencer: number | null; caminho: string | null; nome_arquivo: string | null; tamanho: number | null;
  arquivada_em: string | null; criado_em: string; atualizado_em: string;
}
export interface VersaoCertidao { id: string; numero: number; caminho: string; nome_arquivo: string; tamanho: number; data_emissao: string; data_validade: string | null; codigo_controle: string | null; enviado_em: string }
export interface EventoCertidao { acao: string; dados: Record<string, unknown> | null; criado_em: string }
export interface ResumoCertidoes { total: number; validas: number; vencendo: number; vencidas: number; sem_validade: number }

export const TIPOS_CERTIDAO: Record<TipoCertidao, { rotulo: string; orgao: string }> = {
  federal: { rotulo: 'Certidão Federal (RFB/PGFN)', orgao: 'Receita Federal do Brasil / PGFN' },
  fgts: { rotulo: 'Certidão de Regularidade do FGTS (CRF)', orgao: 'Caixa Econômica Federal' },
  trabalhista: { rotulo: 'Certidão Negativa de Débitos Trabalhistas (CNDT)', orgao: 'Tribunal Superior do Trabalho' },
  estadual: { rotulo: 'Certidão Estadual', orgao: 'Secretaria da Fazenda Estadual' },
  municipal: { rotulo: 'Certidão Municipal', orgao: 'Prefeitura Municipal' },
  outra: { rotulo: 'Outra certidão', orgao: '' },
};
export const RESULTADOS_CERTIDAO: Record<TipoCertidaoFederal, string> = {
  negativa: 'Negativa', positiva_efeitos_negativa: 'Positiva com efeitos de negativa', positiva: 'Positiva',
};
export const SITUACOES_CERTIDAO: Record<SituacaoCertidao, { rotulo: string; selo: 'sucesso' | 'alerta' | 'perigo' | 'neutro' }> = {
  valida: { rotulo: 'Válida', selo: 'sucesso' }, vencendo: { rotulo: 'Vence em breve', selo: 'alerta' },
  vencida: { rotulo: 'Vencida', selo: 'perigo' }, sem_validade: { rotulo: 'Sem validade', selo: 'neutro' },
};
export const ACOES_CERTIDAO: Record<string, string> = {
  cadastrada: 'Certidão cadastrada', atualizada: 'Dados atualizados', nova_versao: 'Nova versão enviada', arquivada: 'Arquivada', alerta_vencimento: 'Alerta de vencimento enviado',
};
export const TAMANHO_MAXIMO_CERTIDAO = 10 * 1024 * 1024;

// Situação a partir das datas (mesma regra da view certidoes_situacao) — usada na conferência antes de salvar
export function situacaoPorValidade(validade: string | null | undefined, hoje: string): SituacaoCertidao {
  if (!validade) return 'sem_validade';
  if (validade < hoje) return 'vencida';
  const limite = new Date(Date.parse(`${hoje}T12:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10);
  return validade <= limite ? 'vencendo' : 'valida';
}

// Validação local do PDF (tipo real pelos bytes, tamanho, conteúdo ativo). O banco confere de novo tipo, dono e caminho.
export async function validarPdfCertidao(arquivo: File): Promise<string | null> {
  if (arquivo.size === 0 || arquivo.size > TAMANHO_MAXIMO_CERTIDAO) return 'O PDF deve ter até 10 MB.';
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d)) return 'Envie a certidão em PDF.';
  if (pdfTemConteudoAtivo(bytes)) return 'PDF com conteúdo ativo (scripts ou arquivos embutidos) não é aceito.';
  return null;
}

// Envia o PDF para o bucket privado com a sessão do usuário. Devolve o caminho; quem chama descarta se o cadastro falhar.
export async function enviarPdfCertidao(idEmpresa: string, arquivo: File): Promise<string> {
  const caminho = `${idEmpresa}/${crypto.randomUUID()}.pdf`;
  const { error } = await createClient().storage.from('certidoes').upload(caminho, arquivo, { contentType: 'application/pdf', upsert: false });
  if (error) throw new Error('Não foi possível enviar o PDF. Verifique sua permissão para esta empresa.');
  return caminho;
}
export async function descartarPdfCertidao(caminho: string) {
  await createClient().storage.from('certidoes').remove([caminho]);
}

// Visualizar/baixar: URL temporária de 60 s, autorizada pela política do Storage
export async function abrirPdfCertidao(caminho: string, nome: string, baixar: boolean): Promise<string | null> {
  const janela = window.open('', '_blank');
  if (!janela) return 'Permita pop-ups para abrir a certidão.';
  const semAcento = nome.normalize('NFD').replace(new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g'), '').replace(/[^\w.\- ]+/g, '_').trim() || 'certidao';
  const { data, error } = await createClient().storage.from('certidoes').createSignedUrl(caminho, 60, baixar ? { download: semAcento.endsWith('.pdf') ? semAcento : `${semAcento}.pdf` } : undefined);
  if (error || !data?.signedUrl) { janela.close(); return 'Não foi possível abrir a certidão.'; }
  janela.opener = null;
  janela.location.href = data.signedUrl;
  return null;
}
