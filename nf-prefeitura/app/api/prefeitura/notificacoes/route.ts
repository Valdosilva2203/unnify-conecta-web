import { getSupabaseAdmin } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

export async function GET(request: NextRequest) {
  try {
    const usuarioId = request.nextUrl.searchParams.get("usuario_id");
    const prefeituraId = request.nextUrl.searchParams.get("prefeitura_id");

    if (!usuarioId || !prefeituraId) {
      return NextResponse.json(
        { error: "usuario_id e prefeitura_id são obrigatórios" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("notificacoes")
      .select("*")
      .eq("usuario_id", usuarioId)
      .eq("tipo", "chamado_aguardando_confirmacao")
      .eq("lida", false)
      .eq("prefeitura_id", prefeituraId);

    if (error) {
      console.error("❌ Erro ao buscar notificações:", error);
      return NextResponse.json(
        { error: "Erro ao buscar notificações", details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({ notificacoes: data || [] });
  } catch (error) {
    console.error("Erro na API de notificações:", error);
    return NextResponse.json(
      { error: "Erro ao processar requisição" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { usuario_id, prefeitura_id, tipo, mensagem, referencia_id } = body;

    if (!usuario_id || !prefeitura_id || !tipo) {
      return NextResponse.json(
        { error: "usuario_id, prefeitura_id e tipo são obrigatórios" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("notificacoes")
      .insert([
        {
          id: uuidv4(),
          usuario_id,
          prefeitura_id,
          tipo,
          mensagem: mensagem || "",
          referencia_id: referencia_id || null,
          lida: false,
        },
      ])
      .select();

    if (error) {
      console.error("❌ Erro ao criar notificação:", error);
      return NextResponse.json(
        { error: "Erro ao criar notificação", details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({ notificacao: data?.[0] }, { status: 201 });
  } catch (error) {
    console.error("Erro na API de criação de notificação:", error);
    return NextResponse.json(
      { error: "Erro ao processar requisição" },
      { status: 500 }
    );
  }
}
