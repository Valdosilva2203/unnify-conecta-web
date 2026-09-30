import { getSupabaseAdmin } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { chamado_id, notificacao_id, justificativa } = await request.json();

    if (!chamado_id || !notificacao_id || !justificativa) {
      return NextResponse.json(
        { error: "Campos obrigatórios: chamado_id, notificacao_id, justificativa" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Inserir justificativa
    const { error: insertError } = await supabaseAdmin
      .from("justificativas_chamados")
      .insert([{
        chamado_id,
        descricao: `[NEGAÇÃO] ${justificativa}`
      }]);

    if (insertError) throw insertError;

    // 2. Atualizar status do chamado para pendente
    const { error: updateStatusError } = await supabaseAdmin
      .from("chamados")
      .update({ status: "pendente" })
      .eq("id", chamado_id);

    if (updateStatusError) throw updateStatusError;

    // 3. Marcar notificação como lida
    const { error: updateNotifError } = await supabaseAdmin
      .from("notificacoes")
      .update({ lida: true })
      .eq("id", notificacao_id);

    if (updateNotifError) throw updateNotifError;

    return NextResponse.json({ success: true, message: "Chamado recusado com sucesso" });
  } catch (error) {
    console.error("Erro ao negar chamado:", error);
    return NextResponse.json(
      { error: "Erro ao processar recusa", details: error },
      { status: 500 }
    );
  }
}
