import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { excedeuLimite, ipDaRequisicao } from '@/lib/limite-taxa';
import { enviarEmail, modeloEmail } from '@/lib/email';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

    const enviado = await enviarEmail({
      para: email,
      assunto: 'Confirme seu e-mail - Unnify Conecta',
      html: modeloEmail({
        titulo: 'Confirme seu e-mail',
        saudacao: `Olá, ${fullName}!`,
        texto: 'Falta pouco para começar a usar o Unnify Conecta. Clique no botão abaixo para confirmar seu e-mail:',
        botao: 'Confirmar meu e-mail',
        link,
        rodape: 'O link expira em 1 hora. Se você não criou uma conta, ignore este e-mail.',
      }),
    });

    if (!enviado) {
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
