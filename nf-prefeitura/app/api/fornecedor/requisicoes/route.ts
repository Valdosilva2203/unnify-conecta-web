import { getSupabaseAdmin } from "@/lib/supabase";
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

    const supabaseAdmin = getSupabaseAdmin();

    const { data: requisicoes, error } = await supabaseAdmin
      .from("requisicoes")
      .select("id, numero_requisicao, titulo, descricao, status, created_at, fornecedor_id, prefeitura_id")
      .eq("fornecedor_id", fornecedorId)
      .eq("prefeitura_id", prefeituraId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Erro ao buscar requisições:", error);
      return NextResponse.json(
        { error: "Erro ao buscar requisições", details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({ requisicoes });
  } catch (error) {
    console.error("Erro na API de requisições:", error);
    return NextResponse.json(
      { error: "Erro ao processar requisição" },
      { status: 500 }
    );
  }
}
