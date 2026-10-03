import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function DELETE(request: NextRequest) {
  try {
    const { requisicaoId, nomeArquivo } = await request.json();

    if (!requisicaoId || !nomeArquivo) {
      return NextResponse.json(
        { error: "Dados incompletos" },
        { status: 400 }
      );
    }

    // Delete from storage
    const { error: deleteError } = await supabase.storage
      .from("notas-fiscais")
      .remove([nomeArquivo]);

    if (deleteError) {
      return NextResponse.json(
        { error: `Erro ao deletar arquivo: ${deleteError.message}` },
        { status: 500 }
      );
    }

    // Clear database fields
    const { error: updateError } = await supabase
      .from("requisicoes")
      .update({
        nota_fiscal_url: null,
        nota_fiscal_arquivo: null,
        nota_fiscal_enviado_em: null,
        nota_fiscal_enviado_por: null,
      })
      .eq("id", requisicaoId);

    if (updateError) {
      return NextResponse.json(
        { error: `Erro ao limpar banco: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro no endpoint:", error);
    return NextResponse.json(
      { error: "Erro ao processar solicitação" },
      { status: 500 }
    );
  }
}
