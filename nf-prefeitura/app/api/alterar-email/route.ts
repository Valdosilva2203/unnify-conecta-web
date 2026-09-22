import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const { userId, novoEmail, tabela } = await req.json();

    if (!userId || !novoEmail || !tabela) {
      return NextResponse.json(
        { error: "userId, novoEmail e tabela são obrigatórios" },
        { status: 400 }
      );
    }

    // Usar service_role key para contornar RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || "",
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Atualizar email na tabela
    const { error } = await supabase
      .from(tabela)
      .update({ email: novoEmail })
      .eq("id", userId);

    if (error) {
      console.error("Erro ao alterar email:", error);
      return NextResponse.json(
        { error: error.message || "Erro ao alterar email" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Email alterado com sucesso",
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Erro ao processar alteração de email:", error);
    return NextResponse.json(
      { error: error.message || "Erro ao processar alteração de email" },
      { status: 500 }
    );
  }
}
