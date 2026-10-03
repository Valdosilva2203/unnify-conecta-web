import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const requisicaoId = formData.get("requisicaoId") as string;
    const fornecedorId = formData.get("fornecedorId") as string;

    if (!file || !requisicaoId || !fornecedorId) {
      return NextResponse.json(
        { error: "Dados incompletos" },
        { status: 400 }
      );
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Apenas arquivos PDF são permitidos" },
        { status: 400 }
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Arquivo muito grande. Máximo 5MB" },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const nomeArquivo = `${requisicaoId}/${timestamp}-${randomId}.pdf`;

    const { data, error: uploadError } = await supabase.storage
      .from("notas-fiscais")
      .upload(nomeArquivo, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Upload falhou: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from("notas-fiscais")
      .createSignedUrl(nomeArquivo, 3600);

    if (signedError) {
      return NextResponse.json(
        { error: `Erro ao gerar URL: ${signedError.message}` },
        { status: 500 }
      );
    }

    const { error: updateError } = await supabase
      .from("requisicoes")
      .update({
        nota_fiscal_url: signedData.signedUrl,
        nota_fiscal_arquivo: nomeArquivo,
        nota_fiscal_enviado_em: new Date().toISOString(),
        nota_fiscal_enviado_por: fornecedorId,
      })
      .eq("id", requisicaoId);

    if (updateError) {
      return NextResponse.json(
        { error: `Erro ao salvar: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      url: signedData.signedUrl,
    });
  } catch (error) {
    console.error("Erro no endpoint:", error);
    return NextResponse.json(
      { error: "Erro ao processar upload" },
      { status: 500 }
    );
  }
}
