import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { excedeuLimite } from '@/lib/limite-taxa';
import { enviarEmail, modeloEmail } from '@/lib/email';
import { clienteDoUsuario, origemConfiavel } from '@/lib/convites-servidor';

// Processa a fila de e-mails de AVISO (solicitação recebida/aceita/recusada, vínculo ativado, convite recusado).
// A fila é preenchida pelo banco (gatilhos/funções); usuários não leem nem escrevem nela. Este processador é o carteiro do
// sistema: usa a chave de serviço SÓ para reservar e concluir itens da fila — não lê dados de empresas nem decide acesso.
// Disparo: após ações do usuário (qualquer usuário logado, com limite) ou agendado (GET com CRON_SECRET).
async function processar(req: NextRequest) {
  const servico = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await servico.rpc('reservar_emails_pendentes', { p_limite: 10 });
  if (error) return NextResponse.json({ processados: 0 }, { status: 503 });
  const origem = origemConfiavel(req);
  let enviados = 0;
  for (const item of (data ?? []) as { id: string; email: string; assunto: string; titulo: string; texto: string; link: string }[]) {
    let ok = false;
    try {
      ok = await enviarEmail({
        para: item.email,
        assunto: item.assunto,
        html: modeloEmail({
          titulo: item.titulo, saudacao: 'Olá!', texto: item.texto, botao: 'Abrir o Unnify Conecta', link: `${origem}${item.link}`,
          rodape: 'Você recebeu este aviso porque tem uma conta no Unnify Conecta. Se não reconhece esta ação, ignore este e-mail.',
        }),
      });
    } catch { ok = false; }
    if (ok) enviados++;
    await servico.rpc('concluir_email', { p_id: item.id, p_ok: ok, p_erro: ok ? null : 'falha no envio' });
  }
  return NextResponse.json({ processados: (data ?? []).length, enviados });
}

export async function POST(req: NextRequest) {
  const { data: { user } } = await clienteDoUsuario(req).auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
  if (excedeuLimite(`fila-emails:${user.id}`, 6, 60 * 1000)) return NextResponse.json({ processados: 0 }, { status: 429 });
  return processar(req);
}

export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get('authorization') !== `Bearer ${segredo}`) return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  // Agendado: gera os alertas de vencimento de certidões (idempotente; vira notificação no sino) antes de enviar a fila
  await createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    .rpc('processar_alertas_certidoes').then(() => {});
  return processar(req);
}
