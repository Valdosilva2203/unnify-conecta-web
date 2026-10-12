import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { excedeuLimite, ipDaRequisicao } from '@/lib/limite-taxa';
import { enviarEmail, modeloEmail } from '@/lib/email';

// Resposta igual exista ou não a conta, para não revelar quais e-mails estão cadastrados.
const RESPOSTA_PADRAO = { success: true };

export async function POST(req: NextRequest) {
  try {
    if (excedeuLimite(`recuperacao:ip:${ipDaRequisicao(req.headers)}`, 5, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
        { status: 429 }
      );
    }

    const corpo = await req.json().catch(() => null);
    const email = typeof corpo?.email === 'string' ? corpo.email.trim().toLowerCase() : '';
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'E-mail inválido. Verifique e tente novamente.' }, { status: 400 });
    }

    if (excedeuLimite(`recuperacao:email:${email}`, 3, 60 * 60 * 1000)) {
      return NextResponse.json(RESPOSTA_PADRAO);
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await supabase.auth.admin.generateLink({ type: 'recovery', email });
    if (error || !data?.properties?.hashed_token) {
      // Conta inexistente cai aqui: não revelar ao usuário.
      if (error && error.status !== 404 && !/not found/i.test(error.message)) {
        console.error('Erro ao gerar link de recuperação:', error.code ?? error.name);
      }
      return NextResponse.json(RESPOSTA_PADRAO);
    }

    const link = `${req.nextUrl.origin}/reset-password?token_hash=${encodeURIComponent(
      data.properties.hashed_token
    )}&type=recovery`;

    const { data: perfil } = await supabase
      .from('perfis')
      .select('nome_completo')
      .eq('id_usuario', data.user.id)
      .maybeSingle();
    const primeiroNome = perfil?.nome_completo?.split(' ')[0];

    const enviado = await enviarEmail({
      para: email,
      assunto: 'Redefinir sua senha - Unnify Conecta',
      html: modeloEmail({
        titulo: 'Redefinir sua senha',
        saudacao: primeiroNome ? `Olá, ${primeiroNome}!` : 'Olá!',
        texto: 'Recebemos um pedido para redefinir a senha da sua conta no Unnify Conecta. Clique no botão abaixo para criar uma nova senha:',
        botao: 'Criar nova senha',
        link,
        rodape: 'O link expira em 1 hora e só pode ser usado uma vez. Se você não pediu a recuperação, ignore este e-mail — sua senha continua a mesma.',
      }),
    });

    if (!enviado) {
      return NextResponse.json(
        { error: 'Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos.' },
        { status: 502 }
      );
    }

    return NextResponse.json(RESPOSTA_PADRAO);
  } catch (err) {
    console.error('Erro inesperado na recuperação de senha:', err instanceof Error ? err.name : 'desconhecido');
    return NextResponse.json({ error: 'Erro ao processar a solicitação. Tente novamente.' }, { status: 500 });
  }
}
