import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { tipo_usuario } = await request.json();

    if (!tipo_usuario) {
      return NextResponse.json(
        { error: 'tipo_usuario é obrigatório' },
        { status: 400 }
      );
    }

    if (!['empresa', 'contador'].includes(tipo_usuario)) {
      return NextResponse.json(
        { error: 'tipo_usuario deve ser "empresa" ou "contador"' },
        { status: 400 }
      );
    }

    // Get authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Token de autenticação não fornecido' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const supabase = await createClient();

    // Verificar user com token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user?.id) {
      console.error('❌ Erro de autenticação:', authError);
      return NextResponse.json(
        { error: 'Token inválido ou expirado', details: authError?.message },
        { status: 401 }
      );
    }

    // Update tipo_usuario in perfis table
    console.log('🔄 Atualizando tipo_usuario para:', {
      user_id: user.id,
      tipo_usuario,
    });

    const { data, error } = await supabase
      .from('perfis')
      .update({
        tipo_usuario,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id_usuario', user.id)
      .select();

    console.log('📊 Resultado da atualização:', { data, error });

    if (error) {
      console.error('❌ Erro ao atualizar tipo_usuario:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Tipo de usuário atualizado com sucesso',
      tipo_usuario,
    });
  } catch (error) {
    console.error('Erro no endpoint update-tipo-usuario:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
