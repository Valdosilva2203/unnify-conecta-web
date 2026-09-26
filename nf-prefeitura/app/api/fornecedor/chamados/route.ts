import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const fornecedorId = request.nextUrl.searchParams.get("fornecedor_id");
    const prefeituraId = request.nextUrl.searchParams.get("prefeitura_id");

    if (!fornecedorId || !prefeituraId) {
      return NextResponse.json(
        { error: "Missing fornecedor_id or prefeitura_id" },
        { status: 400 }
      );
    }

    const { data: chamados, error } = await supabase
      .from("chamados")
      .select("*")
      .eq("fornecedor_id", fornecedorId)
      .eq("prefeitura_id", prefeituraId)
      .order("data_criacao", { ascending: false });

    if (error) {
      console.error("Erro ao buscar chamados:", error);
      return NextResponse.json(
        { error: "Erro ao buscar chamados" },
        { status: 500 }
      );
    }

    return NextResponse.json({ chamados });
  } catch (error) {
    console.error("Erro na API de chamados:", error);
    return NextResponse.json(
      { error: "Erro ao processar requisição" },
      { status: 500 }
    );
  }
}
