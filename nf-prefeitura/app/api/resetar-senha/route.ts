import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import crypto from "crypto";

async function hashPassword(password: string): Promise<string> {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const { token, novaSenha } = await req.json();

    if (!token || !novaSenha) {
      return NextResponse.json(
        { error: "Token e nova senha são obrigatórios" },
        { status: 400 }
      );
    }

    if (novaSenha.length < 6) {
      return NextResponse.json(
        { error: "Senha deve ter no mínimo 6 caracteres" },
        { status: 400 }
      );
    }

    // Hash do token recebido
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Procurar em prefeitura_users
    let user: any = null;
    let userTable = "";

    const { data: prefeituraUser } = await supabase
      .from("prefeitura_users")
      .select("id, email")
      .eq("reset_token", tokenHash)
      .gt("reset_token_expires", new Date().toISOString())
      .single();

    if (prefeituraUser) {
      user = prefeituraUser;
      userTable = "prefeitura_users";
    }

    // Se não encontrou, procurar em funcionarios
    if (!user) {
      const { data: funcionario } = await supabase
        .from("funcionarios")
        .select("id, email")
        .eq("reset_token", tokenHash)
        .gt("reset_token_expires", new Date().toISOString())
        .single();

      if (funcionario) {
        user = funcionario;
        userTable = "funcionarios";
      }
    }

    // Se não encontrou, procurar em admins (compatibilidade)
    if (!user) {
      const { data: admin } = await supabase
        .from("admins")
        .select("id, email")
        .eq("reset_token", tokenHash)
        .gt("reset_token_expires", new Date().toISOString())
        .single();

      if (admin) {
        user = admin;
        userTable = "admins";
      }
    }

    if (!user) {
      return NextResponse.json(
        { error: "Link expirado ou inválido" },
        { status: 400 }
      );
    }

    // Hash da nova senha
    const senhaHash = await hashPassword(novaSenha);

    // Atualizar senha e limpar tokens
    const { error: updateError } = await supabase
      .from(userTable)
      .update({
        senha: senhaHash,
        reset_token: null,
        reset_token_expires: null,
      })
      .eq("id", user.id);

    if (updateError) throw updateError;

    return NextResponse.json(
      {
        success: true,
        message: "Senha resetada com sucesso",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao resetar senha:", error);
    return NextResponse.json(
      { error: "Erro ao processar resetar senha" },
      { status: 500 }
    );
  }
}
