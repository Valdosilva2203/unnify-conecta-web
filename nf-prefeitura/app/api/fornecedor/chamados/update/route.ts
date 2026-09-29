import { getSupabaseAdmin } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(request: NextRequest) {
  try {
    const { id, status, justificativa } = await request.json();

    if (!id || !status) {
      return NextResponse.json(
        { error: "Missing id or status" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === "finalizada") {
      updateData.data_finalizacao = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from("chamados")
      .update(updateData)
      .eq("id", id)
      .select();

    if (error) {
      console.error("❌ Erro ao atualizar chamado:", error);
      return NextResponse.json(
        { error: "Erro ao atualizar chamado", details: error },
        { status: 500 }
      );
    }

    if (justificativa && status === "finalizada") {
      await supabaseAdmin
        .from("justificativas_chamados")
        .insert({
          chamado_id: id,
          texto: justificativa,
          criado_em: new Date().toISOString(),
        });
    }

    return NextResponse.json({ sucesso: true, chamado: data?.[0] });
  } catch (error) {
    console.error("Erro na API de atualização:", error);
    return NextResponse.json(
      { error: "Erro ao processar requisição" },
      { status: 500 }
    );
  }
}
