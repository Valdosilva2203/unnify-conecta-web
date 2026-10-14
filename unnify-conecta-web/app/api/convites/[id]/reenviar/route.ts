import { NextResponse, type NextRequest } from 'next/server';
import { excedeuLimite } from '@/lib/limite-taxa';
import { clienteDoUsuario, enviarConvite, erroAmigavel, gerarToken, hashDoToken, origemConfiavel } from '@/lib/convites-servidor';

// Reenvio seguro: gera NOVO token (o anterior deixa de valer) e nova validade. Só quem pode gerir o convite (banco valida).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ erro: 'Convite inválido.' }, { status: 400 });
  const supabase = clienteDoUsuario(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Faça login para reenviar convites.' }, { status: 401 });
  if (excedeuLimite(`convites-reenvio:${user.id}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ erro: 'Muitos reenvios em pouco tempo. Aguarde alguns minutos.' }, { status: 429 });
  }
  const token = gerarToken();
  const { data, error } = await supabase.rpc('reenviar_convite', { p_id: id, p_hash: hashDoToken(token) });
  const destino = (data as { email_destino: string; nome_destino: string | null }[] | null)?.[0];
  if (error || !destino) return erroAmigavel(error, 'Não foi possível reenviar o convite.');
  const enviado = await enviarConvite(supabase, token, destino.nome_destino, destino.email_destino, origemConfiavel(req));
  await supabase.rpc('registrar_envio_convite', { p_id: id, p_ok: enviado });
  return NextResponse.json({ id, enviado });
}
