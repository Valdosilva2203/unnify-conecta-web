import { getSupabaseAdmin } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { chamado_id, notificacao_id } = await request.json();

    if (!chamado_id || !notificacao_id) {
      return NextResponse.json(
        { error: "Campos obrigatórios: chamado_id, notificacao_id" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Atualizar status do chamado para em_requisicao
    const { error: updateStatusError } = await supabaseAdmin
      .from("chamados")
      .update({ status: "em_requisicao" })
      .eq("id", chamado_id);

    if (updateStatusError) throw updateStatusError;

    // 2. Marcar notificação como lida (ou deletar)
    const { error: updateNotifError } = await supabaseAdmin
      .from("notificacoes")
      .update({ lida: true })
      .eq("id", notificacao_id);

    if (updateNotifError) throw updateNotifError;

    return NextResponse.json({ success: true, message: "Finalização confirmada" });
  } catch (error) {
    console.error("Erro ao confirmar finalização:", error);
    return NextResponse.json(
      { error: "Erro ao processar confirmação", details: error },
      { status: 500 }
    );
  }
}
