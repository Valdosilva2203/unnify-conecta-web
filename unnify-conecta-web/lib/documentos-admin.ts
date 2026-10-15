// Documentos administrativos — formatos aceitos, conferência do tipo REAL pelos primeiros bytes (navegador e servidor)
// e utilitários. O banco (migration 044) e a rota /api/admin/documentos validam de novo.

export const TAMANHO_MAXIMO_DOCUMENTO = 25 * 1024 * 1024;

type Assinatura = 'pdf' | 'zip' | 'ole' | 'png' | 'jpg' | 'webp' | 'texto';
export const FORMATOS: Record<string, { mime: string; assinatura: Assinatura; rotulo: string }> = {
  pdf: { mime: 'application/pdf', assinatura: 'pdf', rotulo: 'PDF' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', assinatura: 'zip', rotulo: 'Word' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', assinatura: 'zip', rotulo: 'Excel' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', assinatura: 'zip', rotulo: 'PowerPoint' },
  odt: { mime: 'application/vnd.oasis.opendocument.text', assinatura: 'zip', rotulo: 'Texto (ODT)' },
  ods: { mime: 'application/vnd.oasis.opendocument.spreadsheet', assinatura: 'zip', rotulo: 'Planilha (ODS)' },
  zip: { mime: 'application/zip', assinatura: 'zip', rotulo: 'ZIP' },
  doc: { mime: 'application/msword', assinatura: 'ole', rotulo: 'Word 97' },
  xls: { mime: 'application/vnd.ms-excel', assinatura: 'ole', rotulo: 'Excel 97' },
  ppt: { mime: 'application/vnd.ms-powerpoint', assinatura: 'ole', rotulo: 'PowerPoint 97' },
  png: { mime: 'image/png', assinatura: 'png', rotulo: 'Imagem PNG' },
  jpg: { mime: 'image/jpeg', assinatura: 'jpg', rotulo: 'Imagem JPG' },
  jpeg: { mime: 'image/jpeg', assinatura: 'jpg', rotulo: 'Imagem JPG' },
  webp: { mime: 'image/webp', assinatura: 'webp', rotulo: 'Imagem WebP' },
  txt: { mime: 'text/plain', assinatura: 'texto', rotulo: 'Texto' },
  csv: { mime: 'text/csv', assinatura: 'texto', rotulo: 'CSV' },
};
export const ACEITOS = Object.keys(FORMATOS).map((e) => `.${e}`).join(',');

export const extensaoDe = (nome: string) => (nome.includes('.') ? nome.split('.').pop()!.toLowerCase() : '');
export const nomeSemExtensao = (nome: string) => nome.replace(/\.[^.]+$/, '');
export const nomeValido = (nome: string) => nome.trim().length >= 1 && nome.trim().length <= 200 && !/[\\/<>:"|?*]/.test(nome);
export const limparNome = (nome: string) => nome.replace(/[\\/<>:"|?*]/g, '-').trim().slice(0, 200);

const comeca = (b: Uint8Array, bytes: number[], desde = 0) => bytes.every((x, i) => b[desde + i] === x);
// Confere o conteúdo real do arquivo contra a extensão informada
export function tipoRealConfere(extensao: string, inicio: Uint8Array): boolean {
  const f = FORMATOS[extensao];
  if (!f) return false;
  switch (f.assinatura) {
    case 'pdf': { const t = new TextDecoder('latin1').decode(inicio.slice(0, 1024)); return t.includes('%PDF-'); }
    case 'zip': return comeca(inicio, [0x50, 0x4b, 0x03, 0x04]);
    case 'ole': return comeca(inicio, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case 'png': return comeca(inicio, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'jpg': return comeca(inicio, [0xff, 0xd8, 0xff]);
    case 'webp': return comeca(inicio, [0x52, 0x49, 0x46, 0x46]) && comeca(inicio, [0x57, 0x45, 0x42, 0x50], 8);
    case 'texto': return !inicio.slice(0, 4096).includes(0);
  }
}

// PDF: assinatura digital (campo /ByteRange + /Sig) e criptografia (/Encrypt) — sinais para alertar e restringir edição
export function inspecionarPdf(bytes: Uint8Array): { assinado: boolean; criptografado: boolean } {
  const t = new TextDecoder('latin1').decode(bytes);
  return { assinado: /\/ByteRange\s*\[/.test(t) && /\/Type\s*\/Sig\b|\/FT\s*\/Sig\b|\/adbe\.pkcs7/.test(t), criptografado: /\/Encrypt\s/.test(t) };
}

export function formatarBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2).replace('.', ',')} GB`;
}

export interface DocumentoAdmin {
  id: string; id_pasta: string | null; pasta: string | null; nome: string; extensao: string; tipo_mime: string; versao_atual: number; tamanho_atual: number;
  assinado: boolean; protegido: boolean; atualizado_em: string; criado_em: string; excluido_em: string | null; total: number;
}
export interface VersaoAdmin { numero: number; caminho: string; tamanho: number; tipo_mime: string; sha256: string; origem: 'upload' | 'edicao'; observacao: string | null; assinado: boolean; criado_em: string; criado_por: string | null }
export interface PastaAdmin { id: string; nome: string }

// Envio: arquivo vai para envios/<uuid>.<ext> com a sessão do usuário; a rota do servidor confere e registra.
export async function enviarDocumento(
  supabase: { storage: { from: (b: string) => { upload: (c: string, f: Blob, o: object) => Promise<{ error: unknown }> } } },
  arquivo: Blob, extensao: string,
  registro: Record<string, unknown>,
): Promise<{ ok: true; id: string; versao: number; assinado: boolean } | { ok: false; erro: string }> {
  const caminho = `envios/${crypto.randomUUID()}.${extensao}`;
  const { error } = await supabase.storage.from('documentos-admin').upload(caminho, arquivo, { contentType: FORMATOS[extensao].mime, upsert: false });
  if (error) return { ok: false, erro: 'Não foi possível enviar o arquivo.' };
  const resp = await fetch('/api/admin/documentos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...registro, caminho, extensao }) });
  const corpo = await resp.json().catch(() => ({}));
  if (!resp.ok) return { ok: false, erro: corpo.erro ?? 'Não foi possível registrar o documento.' };
  return { ok: true, id: corpo.id, versao: corpo.versao, assinado: !!corpo.assinado };
}
