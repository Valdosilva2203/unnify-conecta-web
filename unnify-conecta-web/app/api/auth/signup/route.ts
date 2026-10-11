import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { email, password, fullName } = await req.json();

    if (!email || !password || !fullName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Create user via admin API (bypasses email confirmation)
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Mark as confirmed immediately
      user_metadata: {
        nome_completo: fullName,
      },
    });

    if (error) {
      console.error('Error creating user:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // Create profile
    if (data?.user?.id) {
      console.log('📝 Criando perfil para usuário:', data.user.id);

      const { error: profileError, data: profileData } = await supabase
        .from('perfis')
        .upsert(
          {
            id_usuario: data.user.id,
            email,
            nome_completo: fullName,
            funcao_global: 'user',
            status: 'active',
          },
          { onConflict: 'id_usuario' }
        );

      if (profileError) {
        console.error('❌ Erro ao criar perfil:', {
          error: profileError.message,
          code: profileError.code,
          details: profileError.details,
        });
      } else {
        console.log('✅ Perfil criado com sucesso:', profileData);
      }
    }

    return NextResponse.json({
      success: true,
      user: { id: data?.user?.id, email },
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
