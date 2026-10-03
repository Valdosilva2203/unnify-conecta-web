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

    try {
      // Buscar certidões do fornecedor
      const { data: certidoes, error } = await supabaseAdmin
        .from("certidoes")
        .select("id, tipo, data_emissao, data_vencimento, status, arquivo_url")
        .eq("fornecedor_id", fornecedorId)
        .eq("prefeitura_id", prefeituraId)
        .order("data_vencimento", { ascending: true });

      if (error) {
        console.error("❌ Erro ao buscar certidões:", error);
        // Se a tabela não existe ou há erro, retornar array vazio
        if (error.message?.includes("relation") || error.message?.includes("does not exist")) {
          return NextResponse.json({ certidoes: [] });
        }
        return NextResponse.json(
          { error: "Erro ao buscar certidões", details: error },
          { status: 500 }
        );
      }

      return NextResponse.json({ certidoes: certidoes || [] });
    } catch (catchError) {
      console.error("❌ Exception ao buscar certidões:", catchError);
      // Retornar array vazio em caso de exceção (tabela não existe)
      return NextResponse.json({ certidoes: [] });
    }
  } catch (error) {
    console.error("Erro na API de certidões:", error);
    return NextResponse.json(
      { error: "Erro ao processar requisição", details: String(error) },
      { status: 500 }
    );
  }
}
