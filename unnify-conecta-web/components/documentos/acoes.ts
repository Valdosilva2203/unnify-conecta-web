import { createClient } from '@/lib/supabase/client';
import { MIME_XLSX, type Documento } from '@/lib/documentos';

// Envio pela rota do servidor (valida o arquivo e grava com a sessão do usuário). Devolve o id do documento.
export async function enviarDocumento(p: { arquivo: File; idEmpresa: string; nome: string; categoria: string; compartilhar: boolean; finalidade?: 'obrigacao' }) {
  const dados = new FormData();
  dados.set('arquivo', p.arquivo);
  dados.set('id_empresa', p.idEmpresa);
  dados.set('nome', p.nome);
  dados.set('categoria', p.categoria);
  dados.set('compartilhar', String(p.compartilhar));
  if (p.finalidade) dados.set('finalidade', p.finalidade);
  const r = await fetch('/api/documentos', { method: 'POST', body: dados });
  if (r.status === 413) throw new Error('O arquivo é maior que o limite aceito pelo servidor.');
  const corpo = (await r.json().catch(() => ({}))) as { id?: string; erro?: string };
  if (!r.ok || !corpo.id) throw new Error(corpo.erro ?? 'Não foi possível enviar o documento.');
  return corpo.id;
}

// O storage-js codifica duas vezes o nome do download; sem acentos/símbolos o arquivo baixado não vem com "%C3%A7" no nome
const ACENTOS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');
const nomeParaDownload = (nome: string) => nome.normalize('NFD').replace(ACENTOS, '').replace(/[^\w.\- ]+/g, '_').trim() || 'documento';

// Arquivos privados: só por URL temporária (60s), autorizada pela política do Storage
export async function abrirDocumento(d: Pick<Documento, 'caminho' | 'nome' | 'tipo_mime'>, baixar: boolean) {
  const extensao = d.tipo_mime === 'application/pdf' ? 'pdf' : d.tipo_mime === 'image/png' ? 'png' : d.tipo_mime === MIME_XLSX ? 'xlsx' : 'jpg';
  const { data, error } = await createClient().storage.from('documentos-empresas')
    .createSignedUrl(d.caminho, 60, baixar || d.tipo_mime === MIME_XLSX ? { download: `${nomeParaDownload(d.nome)}.${extensao}` } : undefined); // planilha não abre no navegador: sempre baixa
  if (error || !data?.signedUrl) throw new Error('Não foi possível abrir o documento.');
  window.open(data.signedUrl, '_blank', 'noopener');
}
