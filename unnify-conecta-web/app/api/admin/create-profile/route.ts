import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { userId, globalRole = 'admin_master', email = '', fullName = '' } = await request.json();

    if (!userId) {
      return NextResponse.json({
        status: 'error',
        message: 'userId is required',
      });
    }

    // Use service role to insert profile
    const supabase = createClient();

    const { data, error } = await supabase
      .from('perfis')
      .insert({
        id_usuario: userId,
        global_role: globalRole,
        email: email || null,
        nome_completo: fullName || null,
        status: 'active',
        autenticacao_dupla_ativada: false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({
        status: 'error',
        message: 'Failed to create profile',
        error: error.message,
      });
    }

    return NextResponse.json({
      status: 'ok',
      message: 'Profile created successfully',
      profile: data,
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: String(error),
    });
  }
}
