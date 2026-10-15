import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { clienteDoUsuario } from '@/lib/convites-servidor';
import { excedeuLimite } from '@/lib/limite-taxa';
import { MENSAGEM_RECURSO_AUSENTE, recursoAusente, statusHttpDoErro, type ErroBanco } from '@/lib/erros-banco';
import { FORMATOS, TAMANHO_MAXIMO_DOCUMENTO, inspecionarPdf, limparNome, nomeValido, tipoRealConfere } from '@/lib/documentos-admin';

// Registra um documento (ou nova versão) já enviado ao bucket privado. Tudo COM A SESSÃO DO USUÁRIO (sem service_role):
// o storage só deixa o Admin Master ler/enviar; aqui o servidor baixa o arquivo, confere o tipo REAL (primeiros bytes),
// o tamanho e calcula o SHA-256; o banco confere de novo e grava. Arquivo recusado é descartado.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AMIGAVEIS = new Set(['42501', '23505', '23514', '40001', 'P0001']);

function erro(e: ErroBanco, padrao: string) {
  if (recursoAusente(e)) return NextResponse.json({ erro: MENSAGEM_RECURSO_AUSENTE, codigo: 'recurso_ausente' }, { status: 503 });
  const msg = e?.code && AMIGAVEIS.has(e.code) && e.message ? e.message : padrao;
  return NextResponse.json({ erro: msg }, { status: e?.code === '40001' ? 409 : statusHttpDoErro(e) });
}

export async function POST(req: NextRequest) {
  const supabase = clienteDoUsuario(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Faça login novamente.' }, { status: 401 });
  const { data: master, error: errMaster } = await supabase.rpc('admin_master_ativo');
  if (errMaster || master !== true) return NextResponse.json({ erro: 'Acesso restrito ao Admin Master.' }, { status: 403 });
  if (excedeuLimite(`documentos-admin:${user.id}`, 60, 10 * 60 * 1000)) return NextResponse.json({ erro: 'Muitos envios em pouco tempo. Aguarde alguns minutos.' }, { status: 429 });

  const corpo = await req.json().catch(() => null);
  const acao = corpo?.acao;
  const extensao = typeof corpo?.extensao === 'string' ? corpo.extensao.toLowerCase() : '';
  const caminho = typeof corpo?.caminho === 'string' ? corpo.caminho : '';
  const formato = FORMATOS[extensao];
  if ((acao !== 'documento' && acao !== 'versao') || !formato || !new RegExp(`^envios/[0-9a-f-]{36}\\.${extensao}$`).test(caminho)) {
    return NextResponse.json({ erro: 'Envio inválido.' }, { status: 400 });
  }
  const descartar = async () => { await supabase.storage.from('documentos-admin').remove([caminho]); };

  const { data: blob, error: errBaixar } = await supabase.storage.from('documentos-admin').download(caminho);
  if (errBaixar || !blob) return NextResponse.json({ erro: 'Arquivo não encontrado no armazenamento.' }, { status: 400 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length === 0 || bytes.length > TAMANHO_MAXIMO_DOCUMENTO) { await descartar(); return NextResponse.json({ erro: 'O arquivo deve ter até 25 MB.' }, { status: 422 }); }
  if (!tipoRealConfere(extensao, bytes.slice(0, 8192))) { await descartar(); return NextResponse.json({ erro: `O conteúdo não é um ${formato.rotulo} válido (extensão não confere com o arquivo).` }, { status: 422 }); }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const pdf = extensao === 'pdf' ? inspecionarPdf(bytes) : { assinado: false, criptografado: false };

  if (acao === 'documento') {
    const nome = typeof corpo.nome === 'string' ? limparNome(corpo.nome) : '';
    const idPasta = typeof corpo.id_pasta === 'string' && UUID.test(corpo.id_pasta) ? corpo.id_pasta : null;
    if (!nomeValido(nome)) { await descartar(); return NextResponse.json({ erro: 'Nome do documento inválido.' }, { status: 400 }); }
    const { data: id, error: e } = await supabase.rpc('registrar_documento_admin', {
      p_id_pasta: idPasta, p_nome: nome, p_extensao: extensao, p_tipo_mime: formato.mime, p_caminho: caminho, p_tamanho: bytes.length, p_sha256: sha256, p_assinado: pdf.assinado,
    });
    if (e || !id) { await descartar(); return erro(e, 'Não foi possível registrar o documento.'); }
    return NextResponse.json({ id, versao: 1, assinado: pdf.assinado, criptografado: pdf.criptografado, sha256 });
  }

  const idDoc = typeof corpo.id_documento === 'string' && UUID.test(corpo.id_documento) ? corpo.id_documento : null;
  const base = Number.isInteger(corpo.versao_base) ? corpo.versao_base : null;
  if (!idDoc || base === null) { await descartar(); return NextResponse.json({ erro: 'Envio inválido.' }, { status: 400 }); }
  const { data: versao, error: e } = await supabase.rpc('registrar_versao_documento_admin', {
    p_id_documento: idDoc, p_versao_base: base, p_caminho: caminho, p_tamanho: bytes.length, p_sha256: sha256, p_tipo_mime: formato.mime,
    p_origem: corpo.origem === 'edicao' ? 'edicao' : 'upload', p_observacao: typeof corpo.observacao === 'string' ? corpo.observacao.slice(0, 300) : null,
    p_assinado: pdf.assinado, p_confirmar_protegido: corpo.confirmar_protegido === true,
  });
  if (e || !versao) { await descartar(); return erro(e, 'Não foi possível salvar a nova versão.'); }
  return NextResponse.json({ id: idDoc, versao, assinado: pdf.assinado, sha256 });
}
