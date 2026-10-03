import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { notaFiscalId } = await request.json();

    if (!notaFiscalId) {
      return NextResponse.json(
        { error: "ID da nota fiscal é obrigatório" },
        { status: 400 }
      );
    }

    // Buscar a nota fiscal
    const { data: notaFiscal, error: notaError } = await supabase
      .from("notas_fiscais")
      .select("arquivo")
      .eq("id", notaFiscalId)
      .single();

    if (notaError || !notaFiscal) {
      return NextResponse.json(
        { error: "Nota fiscal não encontrada" },
        { status: 404 }
      );
    }

    if (!notaFiscal.arquivo) {
      return NextResponse.json(
        { error: "Arquivo não encontrado" },
        { status: 404 }
      );
    }

    // Gerar URL assinada válida por 1 hora
    const { data, error } = await supabase.storage
      .from("notas-fiscais")
      .createSignedUrl(notaFiscal.arquivo, 3600);

    if (error) {
      return NextResponse.json(
        { error: "Erro ao gerar URL de download" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (error) {
    console.error("Erro:", error);
    return NextResponse.json(
      { error: "Erro ao processar requisição" },
      { status: 500 }
    );
  }
}
