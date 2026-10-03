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
      // Buscar todos os chamados da prefeitura - EXATAMENTE COMO O DASHBOARD
      const { data: chamados, error } = await supabaseAdmin
        .from("chamados")
        .select("*, secretarias(nome)")
        .eq("prefeitura_id", prefeituraId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("❌ Erro ao buscar chamados:", JSON.stringify(error, null, 2));
        return NextResponse.json({ chamados: [] });
      }

      return NextResponse.json({ chamados });
    } catch (catchError) {
      console.error("❌ Exception ao buscar chamados:", catchError);
      return NextResponse.json({ chamados: [] });
    }
  } catch (error) {
    console.error("Erro na API de chamados:", error);
    return NextResponse.json(
      { error: "Erro ao processar requisição", details: String(error) },
      { status: 500 }
    );
  }
}
