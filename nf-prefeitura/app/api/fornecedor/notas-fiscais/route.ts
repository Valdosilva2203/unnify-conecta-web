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

    // Buscar notas fiscais
    const { data: notasFiscais, error } = await supabaseAdmin
      .from("notas_fiscais")
      .select("id, numero, arquivo, created_at, requisicao_id")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Erro ao buscar notas fiscais:", error);
      return NextResponse.json(
        { error: "Erro ao buscar notas fiscais", details: error },
        { status: 500 }
      );
    }

    // Para cada nota fiscal, buscar a requisição associada
    const notasComRequisicoes = await Promise.all(
      (notasFiscais || []).map(async (nf: any) => {
        const { data: requisicao } = await supabaseAdmin
          .from("requisicoes")
          .select("numero_requisicao, titulo, fornecedor_id")
          .eq("id", nf.requisicao_id)
          .single();

        // Filtrar apenas notas do fornecedor solicitado
        if (requisicao?.fornecedor_id !== fornecedorId) {
          return null;
        }

        return {
          id: nf.id,
          numero: nf.numero,
          arquivo: nf.arquivo,
          created_at: nf.created_at,
          requisicao_id: nf.requisicao_id,
          numero_requisicao: requisicao?.numero_requisicao,
          titulo: requisicao?.titulo,
          fornecedor_id: requisicao?.fornecedor_id,
        };
      })
    );

    const notasFormatadas = notasComRequisicoes.filter((nf) => nf !== null);

    return NextResponse.json({ notasFiscais: notasFormatadas });
  } catch (error) {
    console.error("Erro na API de notas fiscais:", error);
    return NextResponse.json(
      { error: "Erro ao processar requisição" },
      { status: 500 }
    );
  }
}
