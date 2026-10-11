import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { excedeuLimite, ipDaRequisicao } from '@/lib/limite-taxa';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const resendApiKey = process.env.RESEND_API_KEY!;
const EMAIL_FROM = 'Unnify Conecta <noreply@unnifyconecta.com.br>';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function confirmationEmailHtml(nome: string, link: string) {
  return `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;color:#111">
  <h1 style="font-size:24px;margin:0 0 16px">Confirme seu e-mail</h1>
  <p style="font-size:15px;line-height:1.5">Olá, ${escapeHtml(nome)}!</p>
  <p style="font-size:15px;line-height:1.5">Falta pouco para começar a usar o Unnify Conecta. Clique no botão abaixo para confirmar seu e-mail:</p>
  <p style="margin:28px 0">
    <a href="${link}" style="background:#ea580c;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;display:inline-block">Confirmar meu e-mail</a>
  </p>
  <p style="font-size:13px;color:#555;line-height:1.5">O link expira em 1 hora. Se você não criou uma conta, ignore este e-mail.</p>
</div>`;
}

function validarCadastro(email: unknown, password: unknown, fullName: unknown): string | null {
  if (typeof email !== 'string' || typeof password !== 'string' || typeof fullName !== 'string') {
    return 'Preencha todos os campos.';
  }
  const nome = fullName.trim();
  if (nome.length < 2 || nome.length > 120) return 'Informe seu nome completo.';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'E-mail inválido.';
  if (
    password.length < 8 ||
    password.length > 72 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    return 'A senha deve ter de 8 a 72 caracteres, com letras maiúsculas, minúsculas, números e um símbolo.';
  }
  return null;
}

function muitasTentativas() {
  return NextResponse.json(
    { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
    { status: 429 }
  );
}

export async function POST(req: NextRequest) {
  try {
    if (excedeuLimite(`cadastro:ip:${ipDaRequisicao(req.headers)}`, 5, 15 * 60 * 1000)) {
      return muitasTentativas();
    }

    const corpo = await req.json().catch(() => null);
    const erroValidacao = validarCadastro(corpo?.email, corpo?.password, corpo?.fullName);
    if (erroValidacao) {
      return NextResponse.json({ error: erroValidacao }, { status: 400 });
    }

    const email = (corpo.email as string).trim().toLowerCase();
    const password = corpo.password as string;
    const fullName = (corpo.fullName as string).trim();

    if (excedeuLimite(`cadastro:email:${email}`, 3, 60 * 60 * 1000)) {
      return muitasTentativas();
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'signup',
      email,
      password,
      options: {
        data: { nome_completo: fullName },
      },
    });

    if (error || !data?.user) {
      console.error('Erro ao criar usuário:', error?.code ?? error?.name);
      const jaExiste = error?.message?.toLowerCase().includes('already');
      return NextResponse.json(
        { error: jaExiste ? 'Este e-mail já está cadastrado.' : 'Não foi possível criar a conta. Tente novamente.' },
        { status: 400 }
      );
    }

    const userId = data.user.id;

    const { error: profileError } = await supabase
      .from('perfis')
      .upsert(
        {
          id_usuario: userId,
          email,
          nome_completo: fullName,
          funcao_global: 'user',
          status: 'active',
        },
        { onConflict: 'id_usuario' }
      );

    if (profileError) {
      console.error('❌ Erro ao criar perfil:', profileError.message);
    }

    const link = `${req.nextUrl.origin}/auth/callback?token_hash=${encodeURIComponent(
      data.properties.hashed_token
    )}&type=email`;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: email,
        subject: 'Confirme seu e-mail - Unnify Conecta',
        html: confirmationEmailHtml(fullName, link),
      }),
    });

    if (!emailRes.ok) {
      console.error('❌ Erro ao enviar e-mail de confirmação:', await emailRes.text());
      // Remove the unconfirmed account so the user can retry with the same e-mail
      await supabase.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { error: 'Não foi possível enviar o e-mail de confirmação. Tente novamente.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, user: { id: userId, email } });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
