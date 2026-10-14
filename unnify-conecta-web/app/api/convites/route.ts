import { NextResponse, type NextRequest } from 'next/server';
import { excedeuLimite } from '@/lib/limite-taxa';
import { clienteDoUsuario, enviarConvite, erroAmigavel, gerarToken, hashDoToken, origemConfiavel } from '@/lib/convites-servidor';

// Cria e envia um convite (cenários B e D). Grava COM A SESSÃO DO USUÁRIO — o banco valida quem pode convidar,
// limites, duplicidade e permissões. Nunca usa service_role. Falha no e-mail é registrada e informada (nunca "entregue").
export async function POST(req: NextRequest) {
  const supabase = clienteDoUsuario(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Faça login para enviar convites.' }, { status: 401 });
  if (excedeuLimite(`convites:${user.id}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ erro: 'Muitos convites em pouco tempo. Aguarde alguns minutos.' }, { status: 429 });
  }
  const corpo = await req.json().catch(() => null);
  const sentido = corpo?.sentido;
  if (sentido !== 'contador_para_empresa' && sentido !== 'empresa_para_contador') return NextResponse.json({ erro: 'Convite inválido.' }, { status: 400 });
  const texto = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const email = texto(corpo.email, 254);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ erro: 'Informe um e-mail válido.' }, { status: 400 });
  const idEmpresa = typeof corpo.id_empresa === 'string' && /^[0-9a-f-]{36}$/i.test(corpo.id_empresa) ? corpo.id_empresa : null;
  const permissoes = Array.isArray(corpo.permissoes) ? corpo.permissoes.filter((p: unknown) => typeof p === 'string').slice(0, 20) : null;

  const token = gerarToken();
  const { data: id, error } = await supabase.rpc('criar_convite_vinculo', {
    p_sentido: sentido, p_hash: hashDoToken(token), p_email: email, p_nome: texto(corpo.nome, 120), p_mensagem: texto(corpo.mensagem, 500),
    p_cnpj: texto(corpo.cnpj, 20), p_id_empresa: idEmpresa, p_funcao: texto(corpo.funcao, 30) ?? 'principal', p_permissoes: permissoes,
  });
  if (error || !id) return erroAmigavel(error, 'Não foi possível criar o convite. Tente novamente.');

  const enviado = await enviarConvite(supabase, token, texto(corpo.nome, 120), email, origemConfiavel(req));
  await supabase.rpc('registrar_envio_convite', { p_id: id, p_ok: enviado });
  return NextResponse.json({ id, enviado });
}
