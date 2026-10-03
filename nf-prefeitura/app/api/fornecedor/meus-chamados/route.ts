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
      // Buscar todos os chamados da prefeitura com secretarias
      const { data: chamados, error } = await supabaseAdmin
        .from("chamados")
        .select(
          `
          id,
          titulo,
          descricao,
          status,
          prioridade,
          created_at,
          updated_at,
          numero_chamado,
          criado_por,
          secretaria_id,
          secretarias(id, nome)
        `
        )
        .eq("prefeitura_id", prefeituraId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("❌ Erro ao buscar chamados:", JSON.stringify(error, null, 2));
        // Se a tabela não existe ou há erro, retornar array vazio
        return NextResponse.json({ chamados: [] });
      }

      // Formatar dados
      const chamadosFormatados = (chamados || []).map((ch: any) => ({
        id: ch.id,
        titulo: ch.titulo,
        descricao: ch.descricao,
        status: ch.status,
        prioridade: ch.prioridade,
        created_at: ch.created_at,
        updated_at: ch.updated_at,
        numero_chamado: ch.numero_chamado,
        criado_por: ch.criado_por,
        secretaria_nome: ch.secretarias?.nome,
      }));

      return NextResponse.json({ chamados: chamadosFormatados });
    } catch (catchError) {
      console.error("❌ Exception ao buscar chamados:", catchError);
      // Retornar array vazio em caso de exceção (tabela não existe)
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
