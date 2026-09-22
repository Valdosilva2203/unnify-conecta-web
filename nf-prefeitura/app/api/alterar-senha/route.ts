import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { userId, senhaAtual, novaSenha, tabela } = await req.json();

    if (!userId || !senhaAtual || !novaSenha || !tabela) {
      return NextResponse.json(
        { error: "userId, senhaAtual, novaSenha e tabela são obrigatórios" },
        { status: 400 }
      );
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Chave API Resend não configurada" },
        { status: 500 }
      );
    }

    const resend = new Resend(apiKey);

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

    // Buscar usuário atual
    let usuario: any = null;
    let tabelaEncontrada = tabela;

    const { data: usuarioTabela } = await supabase
      .from(tabela)
      .select("id, email, senha")
      .eq("id", userId)
      .single();

    if (usuarioTabela) {
      usuario = usuarioTabela;
    } else if (tabela === "prefeitura_users") {
      const { data: usuarioFunc } = await supabase
        .from("funcionarios")
        .select("id, email, senha")
        .eq("id", userId)
        .single();
      if (usuarioFunc) {
        usuario = usuarioFunc;
        tabelaEncontrada = "funcionarios";
      } else {
        const { data: usuarioAdmin } = await supabase
          .from("admins")
          .select("id, email, senha")
          .eq("id", userId)
          .single();
        if (usuarioAdmin) {
          usuario = usuarioAdmin;
          tabelaEncontrada = "admins";
        }
      }
    } else if (tabela === "funcionarios") {
      const { data: usuarioPref } = await supabase
        .from("prefeitura_users")
        .select("id, email, senha")
        .eq("id", userId)
        .single();
      if (usuarioPref) {
        usuario = usuarioPref;
        tabelaEncontrada = "prefeitura_users";
      } else {
        const { data: usuarioAdmin } = await supabase
          .from("admins")
          .select("id, email, senha")
          .eq("id", userId)
          .single();
        if (usuarioAdmin) {
          usuario = usuarioAdmin;
          tabelaEncontrada = "admins";
        }
      }
    } else if (tabela === "admins") {
      const { data: usuarioPref } = await supabase
        .from("prefeitura_users")
        .select("id, email, senha")
        .eq("id", userId)
        .single();
      if (usuarioPref) {
        usuario = usuarioPref;
        tabelaEncontrada = "prefeitura_users";
      } else {
        const { data: usuarioFunc } = await supabase
          .from("funcionarios")
          .select("id, email, senha")
          .eq("id", userId)
          .single();
        if (usuarioFunc) {
          usuario = usuarioFunc;
          tabelaEncontrada = "funcionarios";
        }
      }
    }

    if (!usuario) {
      console.error(`Usuário ${userId} não encontrado`);
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 404 }
      );
    }

    // Validar senha atual
    const senhaAtualHash = crypto
      .createHash("sha256")
      .update(senhaAtual)
      .digest("hex");

    if (senhaAtualHash !== usuario.senha) {
      return NextResponse.json(
        { error: "Senha atual incorreta" },
        { status: 401 }
      );
    }

    // Gerar token de confirmação
    const tokenAleatorio = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(tokenAleatorio).digest("hex");
    const expiresAt = new Date(Date.now() + 3600000); // 1 hora

    // Hash da nova senha
    const novaSenhaHash = crypto
      .createHash("sha256")
      .update(novaSenha)
      .digest("hex");

    // Armazenar token e novo hash temporário
    const { error: updateError } = await supabase
      .from(tabelaEncontrada)
      .update({
        password_change_token: tokenHash,
        password_change_token_expires: expiresAt.toISOString(),
        password_change_hash: novaSenhaHash,
      })
      .eq("id", userId);

    if (updateError) {
      console.error("Erro ao gerar token:", updateError);
      return NextResponse.json(
        { error: "Erro ao processar mudança de senha" },
        { status: 400 }
      );
    }

    // Construir link de confirmação
    const confirmLink = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3003"}/confirmar-mudanca-senha?token=${tokenAleatorio}`;

    // Em development, só envia email se for o proprietário
    if (process.env.NODE_ENV === "development" && usuario.email !== "unnifybr@gmail.com") {
      console.log("🔐 [DEV MODE] Link de confirmação de senha:", confirmLink);
      return NextResponse.json(
        {
          success: true,
          message: "Em modo desenvolvimento: verifique o console do servidor para o link de confirmação",
          confirmLink: confirmLink,
        },
        { status: 200 }
      );
    }

    // Enviar email
    const response = await resend.emails.send({
      from: "noreply@unnifyconecta.com.br",
      to: usuario.email,
      subject: "Confirmar Mudança de Senha - NF Prefeitura",
      html: `
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #0d9488;">Confirmar Mudança de Senha</h2>

              <p>Recebemos uma solicitação para alterar sua senha.</p>

              <p><strong>⚠️ IMPORTANTE:</strong> Se você não solicitou esta mudança, <strong>ignore este email</strong>.</p>

              <p>Se foi você, clique no botão abaixo para confirmar a mudança de senha:</p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${confirmLink}"
                   style="background-color: #0d9488; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                  Confirmar Mudança de Senha
                </a>
              </div>

              <p>Ou copie este link:</p>
              <p style="background-color: #f3f4f6; padding: 10px; border-left: 3px solid #0d9488; word-break: break-all;">
                ${confirmLink}
              </p>

              <p style="color: #666; font-size: 12px;">
                <strong>⏱️ Este link expira em 1 hora.</strong><br>
                Após confirmar, você precisará fazer login novamente com a nova senha.
              </p>

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">

              <p style="font-size: 12px; color: #666;">
                <strong>NF Prefeitura - Gestão de Notas Fiscais</strong><br>
                Este é um email automático. Não responda.
              </p>
            </div>
          </body>
        </html>
      `,
    });

    if (response.error) {
      console.error("Erro ao enviar email Resend:", JSON.stringify(response.error));
      return NextResponse.json(
        { error: `Erro ao enviar email: ${response.error?.message || "Erro desconhecido"}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Email de confirmação enviado! Verifique sua caixa de entrada.",
        confirmLink: process.env.NODE_ENV === "development" ? confirmLink : undefined,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Erro ao processar alteração de senha:", error);
    return NextResponse.json(
      { error: error.message || "Erro ao processar alteração de senha" },
      { status: 500 }
    );
  }
}
