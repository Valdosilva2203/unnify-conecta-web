import { getSupabaseAdmin } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const chamadoId = params.id;

    if (!chamadoId) {
      return NextResponse.json(
        { error: "Missing chamado ID" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: justificativas, error } = await supabaseAdmin
      .from("justificativas_chamados")
      .select("*")
      .eq("chamado_id", chamadoId)
      .order("criado_em", { ascending: false });

    if (error) {
      console.error("❌ Erro ao buscar justificativas:", error);
      return NextResponse.json(
        { error: "Erro ao buscar justificativas", details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({ justificativas });
  } catch (error) {
    console.error("Erro na API de justificativas:", error);
    return NextResponse.json(
      { error: "Erro ao processar requisição" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const chamadoId = params.id;
    const { texto } = await request.json();

    if (!chamadoId || !texto) {
      return NextResponse.json(
        { error: "Missing chamado ID or text" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Verificar quantas justificativas já existem
    const { data: existentes } = await supabaseAdmin
      .from("justificativas_chamados")
      .select("id", { count: "exact" })
      .eq("chamado_id", chamadoId);

    if ((existentes?.length || 0) >= 3) {
      return NextResponse.json(
        { error: "Limite de 3 justificativas atingido" },
        { status: 400 }
      );
    }

    // Adicionar nova justificativa
    const { data, error } = await supabaseAdmin
      .from("justificativas_chamados")
      .insert({
        chamado_id: chamadoId,
        texto,
        criado_em: new Date().toISOString(),
      })
      .select();

    if (error) {
      console.error("❌ Erro ao adicionar justificativa:", error);
      return NextResponse.json(
        { error: "Erro ao adicionar justificativa", details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({ sucesso: true, justificativa: data?.[0] });
  } catch (error) {
    console.error("Erro na API de justificativas:", error);
    return NextResponse.json(
      { error: "Erro ao processar requisição" },
      { status: 500 }
    );
  }
}
