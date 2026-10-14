import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { excedeuLimite } from '@/lib/limite-taxa';
import { CATEGORIAS_DOCUMENTO, detectarTipo, extensaoDoNome, nomeSeguro, pdfTemConteudoAtivo, tamanhoMaximoBytes } from '@/lib/documentos';

// Envio de documento da empresa. Valida o arquivo no SERVIDOR (tipo real pelo conteúdo, extensão, tamanho, PDF sem
// conteúdo ativo) e grava COM A SESSÃO DO PRÓPRIO USUÁRIO (anon key + cookies): Storage e banco aplicam RLS e as
// permissões do vínculo contábil. Nunca usa service_role. Se o registro falhar, o arquivo enviado é removido (sem órfão).
export async function POST(req: NextRequest) {
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Faça login para enviar documentos.' }, { status: 401 });
  if (excedeuLimite(`documentos:${user.id}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ erro: 'Muitos envios em pouco tempo. Aguarde alguns minutos.' }, { status: 429 });
  }

  let dados: FormData;
  try {
    dados = await req.formData();
  } catch {
    return NextResponse.json({ erro: 'Envio inválido.' }, { status: 400 });
  }
  const arquivo = dados.get('arquivo');
  const idEmpresa = String(dados.get('id_empresa') ?? '');
  const categoria = String(dados.get('categoria') ?? 'outros');
  const compartilhar = dados.get('compartilhar') === 'true';
  if (!(arquivo instanceof File) || !/^[0-9a-f-]{36}$/.test(idEmpresa)) return NextResponse.json({ erro: 'Envio inválido.' }, { status: 400 });
  if (!(categoria in CATEGORIAS_DOCUMENTO)) return NextResponse.json({ erro: 'Categoria inválida.' }, { status: 400 });
  const maximo = tamanhoMaximoBytes();
  if (arquivo.size === 0 || arquivo.size > maximo) {
    return NextResponse.json({ erro: `O arquivo deve ter até ${Math.round(maximo / 1024 / 1024)} MB.` }, { status: 400 });
  }

  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const tipo = detectarTipo(bytes);
  const extensao = extensaoDoNome(arquivo.name);
  if (!tipo || !extensao) return NextResponse.json({ erro: 'Envie PDF, JPG, JPEG ou PNG.' }, { status: 400 });
  if (tipo.extensao !== extensao) return NextResponse.json({ erro: 'A extensão do arquivo não corresponde ao conteúdo.' }, { status: 400 });
  if (tipo.mime === 'application/pdf' && pdfTemConteudoAtivo(bytes)) {
    return NextResponse.json({ erro: 'PDF com conteúdo ativo (scripts ou arquivos embutidos) não é aceito.' }, { status: 400 });
  }

  const nomeOriginal = nomeSeguro(arquivo.name, 'documento');
  const nome = nomeSeguro(String(dados.get('nome') ?? ''), nomeOriginal.replace(/\.[^.]+$/, ''));
  // Caminho gerado aqui (nada do nome do usuário): <empresa>/<uuid>.<ext> — sem sobrescrita (upsert desligado)
  const caminho = `${idEmpresa}/${randomUUID()}.${tipo.extensao}`;
  const envio = await supabase.storage.from('documentos-empresas').upload(caminho, bytes, { contentType: tipo.mime, upsert: false });
  if (envio.error) {
    return NextResponse.json({ erro: 'Não foi possível enviar o arquivo. Verifique sua permissão para esta empresa.' }, { status: 403 });
  }
  const { data: id, error } = await supabase.rpc('registrar_documento', {
    p_id_empresa: idEmpresa, p_caminho: caminho, p_nome: nome, p_categoria: categoria, p_compartilhar: compartilhar, p_nome_original: nomeOriginal,
  });
  if (error) {
    await supabase.storage.from('documentos-empresas').remove([caminho]);
    const mensagem = /[áéíóúãõç]/i.test(error.message ?? '') && (error.message ?? '').length < 200 ? error.message : 'Não foi possível registrar o documento.';
    return NextResponse.json({ erro: mensagem }, { status: error.code === '42501' ? 403 : 400 });
  }
  return NextResponse.json({ id });
}
