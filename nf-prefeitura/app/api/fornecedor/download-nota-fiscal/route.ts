import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { requisicaoId } = await request.json();

    if (!requisicaoId) {
      return NextResponse.json(
        { error: "ID da requisição é obrigatório" },
        { status: 400 }
      );
    }

    // Buscar a requisição para obter o arquivo
    const { data: requisicao, error: reqError } = await supabase
      .from("requisicoes")
      .select("nota_fiscal_arquivo")
      .eq("id", requisicaoId)
      .single();

    if (reqError || !requisicao) {
      return NextResponse.json(
        { error: "Requisição não encontrada" },
        { status: 404 }
      );
    }

    if (!requisicao.nota_fiscal_arquivo) {
      return NextResponse.json(
        { error: "Arquivo não encontrado" },
        { status: 404 }
      );
    }

    // Gerar URL assinada válida por 1 hora
    const { data, error } = await supabase.storage
      .from("notas-fiscais")
      .createSignedUrl(requisicao.nota_fiscal_arquivo, 3600);

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
