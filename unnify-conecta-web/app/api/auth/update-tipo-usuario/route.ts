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

    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json(
        { error: 'Não autenticado' },
        { status: 401 }
      );
    }

    // Update tipo_usuario in perfis table
    const { error } = await supabase
      .from('perfis')
      .update({
        tipo_usuario,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id_usuario', user.id);

    if (error) {
      console.error('Erro ao atualizar tipo_usuario:', error);
      return NextResponse.json(
        { error: error.message },
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
