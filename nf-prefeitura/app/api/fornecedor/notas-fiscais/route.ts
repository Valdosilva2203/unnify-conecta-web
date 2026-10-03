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

    // Buscar notas fiscais e suas requisições associadas
    const { data: notasFiscais, error } = await supabaseAdmin
      .from("notas_fiscais")
      .select(
        `
        id,
        numero,
        arquivo,
        created_at,
        requisicao_id,
        requisicoes!inner(numero_requisicao, titulo, fornecedor_id)
      `
      )
      .eq("requisicoes.fornecedor_id", fornecedorId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Erro ao buscar notas fiscais:", error);
      return NextResponse.json(
        { error: "Erro ao buscar notas fiscais", details: error },
        { status: 500 }
      );
    }

    // Mapear dados para o formato esperado
    const notasFormatadas = (notasFiscais || []).map((nf: any) => ({
      id: nf.id,
      numero: nf.numero,
      arquivo: nf.arquivo,
      created_at: nf.created_at,
      requisicao_id: nf.requisicao_id,
      numero_requisicao: nf.requisicoes?.numero_requisicao,
      titulo: nf.requisicoes?.titulo,
      fornecedor_id: nf.requisicoes?.fornecedor_id,
    }));

    return NextResponse.json({ notasFiscais: notasFormatadas });
  } catch (error) {
    console.error("Erro na API de notas fiscais:", error);
    return NextResponse.json(
      { error: "Erro ao processar requisição" },
      { status: 500 }
    );
  }
}
