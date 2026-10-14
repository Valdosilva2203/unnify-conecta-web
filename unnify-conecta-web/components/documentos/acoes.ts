import { createClient } from '@/lib/supabase/client';
import type { Documento } from '@/lib/documentos';

// Envio pela rota do servidor (valida o arquivo e grava com a sessão do usuário). Devolve o id do documento.
export async function enviarDocumento(p: { arquivo: File; idEmpresa: string; nome: string; categoria: string; compartilhar: boolean }) {
  const dados = new FormData();
  dados.set('arquivo', p.arquivo);
  dados.set('id_empresa', p.idEmpresa);
  dados.set('nome', p.nome);
  dados.set('categoria', p.categoria);
  dados.set('compartilhar', String(p.compartilhar));
  const r = await fetch('/api/documentos', { method: 'POST', body: dados });
  const corpo = (await r.json().catch(() => ({}))) as { id?: string; erro?: string };
  if (!r.ok || !corpo.id) throw new Error(corpo.erro ?? 'Não foi possível enviar o documento.');
  return corpo.id;
}

// Arquivos privados: só por URL temporária (60s), autorizada pela política do Storage
export async function abrirDocumento(d: Pick<Documento, 'caminho' | 'nome' | 'tipo_mime'>, baixar: boolean) {
  const extensao = d.tipo_mime === 'application/pdf' ? 'pdf' : d.tipo_mime === 'image/png' ? 'png' : 'jpg';
  const { data, error } = await createClient().storage.from('documentos-empresas')
    .createSignedUrl(d.caminho, 60, baixar ? { download: `${d.nome}.${extensao}` } : undefined);
  if (error || !data?.signedUrl) throw new Error('Não foi possível abrir o documento.');
  window.open(data.signedUrl, '_blank', 'noopener');
}
