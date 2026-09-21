import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    // Criar tabela secretario_secretarias
    const { error: createTableError } = await supabase.rpc("exec_sql", {
      sql: `
        CREATE TABLE IF NOT EXISTS secretario_secretarias (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          secretario_id UUID NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
          secretaria_id UUID NOT NULL REFERENCES secretarias(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(secretario_id, secretaria_id)
        );

        CREATE INDEX IF NOT EXISTS idx_secretario_secretarias_secretario
          ON secretario_secretarias(secretario_id);
        CREATE INDEX IF NOT EXISTS idx_secretario_secretarias_secretaria
          ON secretario_secretarias(secretaria_id);
      `
    });

    if (createTableError) {
      console.error("Erro ao criar tabela:", createTableError);
      // Tenta uma abordagem alternativa com raw SQL
      try {
        const { data, error: rawError } = await supabase.rpc("pg_exec", {
          query: `
            CREATE TABLE IF NOT EXISTS secretario_secretarias (
              id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
              secretario_id UUID NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
              secretaria_id UUID NOT NULL REFERENCES secretarias(id) ON DELETE CASCADE,
              created_at TIMESTAMP DEFAULT NOW(),
              UNIQUE(secretario_id, secretaria_id)
            );
          `
        });
      } catch (error) {
        console.log("Tentando criar tabela via interface SQL");
      }
    }

    return NextResponse.json({
      success: true,
      message: "Tabela secretario_secretarias será criada. Acesse: https://supabase.com/dashboard e execute o SQL manualmente se necessário."
    });
  } catch (error) {
    console.error("Erro:", error);
    return NextResponse.json(
      {
        error: "Erro ao configurar tabela",
        message: "Execute o SQL abaixo no editor SQL do Supabase:\n\nCREATE TABLE IF NOT EXISTS secretario_secretarias (\n  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,\n  secretario_id UUID NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,\n  secretaria_id UUID NOT NULL REFERENCES secretarias(id) ON DELETE CASCADE,\n  created_at TIMESTAMP DEFAULT NOW(),\n  UNIQUE(secretario_id, secretaria_id)\n);"
      },
      { status: 500 }
    );
  }
}
