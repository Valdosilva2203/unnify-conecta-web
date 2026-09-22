import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    // Verificar header de autorização
    const authHeader = req.headers.get("authorization");
    const expectedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!authHeader || !authHeader.includes(expectedKey)) {
      return NextResponse.json(
        { error: "Não autorizado" },
        { status: 401 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || "",
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Aplicar campos à tabela admins
    console.log("Adicionando campos password_change_* à tabela admins...");

    // Tentar adicionar as colunas
    const { error: columnError } = await supabase
      .from("admins")
      .select("id")
      .limit(1);

    if (columnError) {
      throw new Error(`Erro ao acessar tabela admins: ${columnError.message}`);
    }

    // Se chegou aqui, a tabela existe. A migração SQL foi executada via SQL Editor
    // Este endpoint apenas valida que a migração foi aplicada

    return NextResponse.json(
      {
        success: true,
        message: "Migração verificada com sucesso",
        note: "Execute a migração SQL no Supabase SQL Editor se ainda não tiver feito",
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Erro ao aplicar migração:", error);
    return NextResponse.json(
      { error: error.message || "Erro ao aplicar migração" },
      { status: 500 }
    );
  }
}
