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

    // Buscar requisições do fornecedor
    const { data: requisicoes, error: reqError } = await supabaseAdmin
      .from("requisicoes")
      .select("id, numero_requisicao, titulo, fornecedor_id")
      .eq("fornecedor_id", fornecedorId)
      .eq("prefeitura_id", prefeituraId);

    if (reqError) {
      console.error("❌ Erro ao buscar requisições:", reqError);
      return NextResponse.json(
        { error: "Erro ao buscar requisições", details: reqError },
        { status: 500 }
      );
    }

    // Para cada requisição, buscar sua nota fiscal
    const notasComRequisicoes = await Promise.all(
      (requisicoes || []).map(async (req: any) => {
        const { data: notaFiscal } = await supabaseAdmin
          .from("notas_fiscais")
          .select("id, numero, arquivo, created_at, requisicao_id")
          .eq("requisicao_id", req.id)
          .single();

        if (!notaFiscal) {
          return null;
        }

        return {
          id: notaFiscal.id,
          numero: notaFiscal.numero,
          arquivo: notaFiscal.arquivo,
          created_at: notaFiscal.created_at,
          requisicao_id: notaFiscal.requisicao_id,
          numero_requisicao: req.numero_requisicao,
          titulo: req.titulo,
          fornecedor_id: req.fornecedor_id,
        };
      })
    );

    const notasFormatadas = notasComRequisicoes.filter((nf) => nf !== null);

    return NextResponse.json({ notasFiscais: notasFormatadas });
  } catch (error) {
    console.error("Erro na API de notas fiscais:", error);
    return NextResponse.json(
      { error: "Erro ao processar requisição", details: String(error) },
      { status: 500 }
    );
  }
}
