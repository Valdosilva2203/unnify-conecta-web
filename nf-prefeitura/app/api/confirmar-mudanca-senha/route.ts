import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Token não fornecido" },
        { status: 400 }
      );
    }

    // Hash do token
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Usar service_role key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || "",
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Procurar token em prefeitura_users
    let usuario: any = null;
    let tabela = "";

    const { data: usuarioPref } = await supabase
      .from("prefeitura_users")
      .select("id, password_change_hash, password_change_token_expires")
      .eq("password_change_token", tokenHash)
      .single();

    if (usuarioPref) {
      usuario = usuarioPref;
      tabela = "prefeitura_users";
    } else {
      // Procurar em funcionarios
      const { data: usuarioFunc } = await supabase
        .from("funcionarios")
        .select("id, password_change_hash, password_change_token_expires")
        .eq("password_change_token", tokenHash)
        .single();

      if (usuarioFunc) {
        usuario = usuarioFunc;
        tabela = "funcionarios";
      }
    }

    if (!usuario) {
      return NextResponse.json(
        { error: "Token inválido ou expirado" },
        { status: 401 }
      );
    }

    // Validar expiração
    const agora = new Date();
    const expira = new Date(usuario.password_change_token_expires);

    if (agora > expira) {
      return NextResponse.json(
        { error: "Token expirado" },
        { status: 401 }
      );
    }

    // Atualizar senha e limpar campos temporários
    const { error: updateError } = await supabase
      .from(tabela)
      .update({
        senha: usuario.password_change_hash,
        password_change_token: null,
        password_change_token_expires: null,
        password_change_hash: null,
      })
      .eq("id", usuario.id);

    if (updateError) {
      console.error("Erro ao atualizar senha:", updateError);
      return NextResponse.json(
        { error: "Erro ao confirmar mudança de senha" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Senha alterada com sucesso! Redirecionando...",
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Erro ao confirmar mudança de senha:", error);
    return NextResponse.json(
      { error: error.message || "Erro ao processar confirmação" },
      { status: 500 }
    );
  }
}
