import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { Resend } from "resend";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    console.log("RESEND_API_KEY existe?", !!apiKey);

    if (!apiKey) {
      return NextResponse.json(
        { error: "Chave API Resend não configurada" },
        { status: 500 }
      );
    }

    const resend = new Resend(apiKey);
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email é obrigatório" },
        { status: 400 }
      );
    }

    const emailTrimmed = email.trim().toLowerCase();

    // Procurar em prefeitura_users
    let user: any = null;
    let userTable = "";

    const { data: prefeituraUser } = await supabase
      .from("prefeitura_users")
      .select("id, email")
      .eq("email", emailTrimmed)
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
        .eq("email", emailTrimmed)
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
        .eq("email", emailTrimmed)
        .single();

      if (admin) {
        user = admin;
        userTable = "admins";
      }
    }

    if (!user) {
      // Não revelar se o email existe ou não (segurança)
      return NextResponse.json(
        {
          success: true,
          message: "Se o email existir, você receberá um link de recuperação",
        },
        { status: 200 }
      );
    }

    // Gerar token único
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 3600000); // 1 hora

    // Salvar token no banco
    const { error: updateError } = await supabase
      .from(userTable)
      .update({
        reset_token: tokenHash,
        reset_token_expires: expiresAt.toISOString(),
      })
      .eq("id", user.id);

    if (updateError) throw updateError;

    // Construir link de reset
    const resetLink = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3003"}/resetar-senha?token=${token}`;

    // Enviar email com Resend
    const response = await resend.emails.send({
      from: "noreply@unnifyconecta.com.br",
      to: email,
      subject: "Recuperar Senha - NF Prefeitura",
      html: `
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #0d9488;">Recuperar Senha</h2>

              <p>Recebemos um pedido para recuperar sua senha.</p>

              <p>Clique no botão abaixo para redefinir sua senha:</p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetLink}"
                   style="background-color: #0d9488; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                  Redefinir Senha
                </a>
              </div>

              <p>Ou copie este link no seu navegador:</p>
              <p style="background-color: #f3f4f6; padding: 10px; border-left: 3px solid #0d9488; word-break: break-all;">
                ${resetLink}
              </p>

              <p style="color: #666; font-size: 12px;">
                <strong>⚠️ Este link expira em 1 hora.</strong><br>
                Se você não solicitou esta recuperação, ignore este email.
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
      console.error("Erro Resend completo:", JSON.stringify(response.error));
      console.error("Detalhes:", response.error);
      throw new Error(`Erro Resend: ${response.error.message}`);
    }

    console.log("Email enviado com sucesso:", response);

    return NextResponse.json(
      {
        success: true,
        message: "Email de recuperação enviado com sucesso",
        resetLink: process.env.NODE_ENV === "development" ? resetLink : undefined,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Erro ao recuperar senha:", error);
    console.error("Mensagem do erro:", error.message);
    return NextResponse.json(
      { error: error.message || "Erro ao processar recuperação de senha" },
      { status: 500 }
    );
  }
}
