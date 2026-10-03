import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { requisicaoId, secretariaIds, fornecedorId } = await request.json();

    if (!requisicaoId || !secretariaIds || secretariaIds.length === 0 || !fornecedorId) {
      return NextResponse.json(
        { error: "Dados incompletos" },
        { status: 400 }
      );
    }

    // Buscar a nota fiscal existente
    const { data: requisicao, error: reqError } = await supabase
      .from("requisicoes")
      .select("nota_fiscal_arquivo, nota_fiscal_url, numero_requisicao")
      .eq("id", requisicaoId)
      .single();

    if (reqError || !requisicao) {
      return NextResponse.json(
        { error: "Requisição não encontrada" },
        { status: 404 }
      );
    }

    if (!requisicao.nota_fiscal_arquivo || !requisicao.nota_fiscal_url) {
      return NextResponse.json(
        { error: "Nota fiscal não foi anexada a esta requisição" },
        { status: 400 }
      );
    }

    // Criar registro em notas_fiscais
    const { data: notaFiscal, error: notaError } = await supabase
      .from("notas_fiscais")
      .insert({
        requisicao_id: requisicaoId,
        nome: "Minhas certidões",
        arquivo: requisicao.nota_fiscal_arquivo,
        url_assinada: requisicao.nota_fiscal_url,
        criado_por: fornecedorId,
      })
      .select()
      .single();

    if (notaError || !notaFiscal) {
      return NextResponse.json(
        { error: `Erro ao criar nota fiscal: ${notaError?.message}` },
        { status: 500 }
      );
    }

    // Vincular secretarias
    const secretariaLinks = secretariaIds.map((secretariaId: string) => ({
      nota_fiscal_id: notaFiscal.id,
      secretaria_id: secretariaId,
    }));

    const { error: linkError } = await supabase
      .from("notas_fiscais_secretarias")
      .insert(secretariaLinks);

    if (linkError) {
      return NextResponse.json(
        { error: `Erro ao vincular secretarias: ${linkError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      notaFiscalId: notaFiscal.id,
      message: `Nota enviada para ${secretariaIds.length} secretaria(s)`,
    });
  } catch (error) {
    console.error("Erro no endpoint:", error);
    return NextResponse.json(
      { error: "Erro ao processar requisição" },
      { status: 500 }
    );
  }
}
