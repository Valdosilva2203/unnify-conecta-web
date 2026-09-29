import { getSupabaseAdmin } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const fornecedorId = request.nextUrl.searchParams.get("fornecedor_id");
    const prefeituraId = request.nextUrl.searchParams.get("prefeitura_id");

    console.log("🔍 Chamados API - Buscar chamados:", { fornecedorId, prefeituraId });

    if (!fornecedorId || !prefeituraId) {
      return NextResponse.json(
        { error: "Missing fornecedor_id or prefeitura_id" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: chamados, error } = await supabaseAdmin
      .from("chamados")
      .select("*, secretarias(nome)")
      .eq("fornecedor_id", fornecedorId)
      .eq("prefeitura_id", prefeituraId)
      .order("created_at", { ascending: false });

    console.log("✅ Chamados retornados:", chamados?.length || 0, "| Erro:", error);

    if (error) {
      console.error("❌ Erro ao buscar chamados:", error);
      return NextResponse.json(
        { error: "Erro ao buscar chamados", details: error },
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
