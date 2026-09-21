import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

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
    const { email, prefeturaNome, prefeituraId, prefeito } = await req.json();

    if (!email || !prefeturaNome || !prefeituraId) {
      return NextResponse.json(
        { error: "Dados inválidos" },
        { status: 400 }
      );
    }

    const compartilhaLink = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3003"}/prefeituras/${prefeituraId}`;

    const emailHtml = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #0d9488;">Bem-vindo ao NF Prefeitura! 🎉</h1>

            <p>Olá ${prefeito},</p>

            <p>Você foi convidado para acompanhar as notas fiscais e gestão da prefeitura <strong>${prefeturaNome}</strong>.</p>

            <p>Clique no botão abaixo para acessar o dashboard:</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${compartilhaLink}"
                 style="background-color: #0d9488; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Acessar Dashboard
              </a>
            </div>

            <p>Ou copie este link no seu navegador:</p>
            <p style="background-color: #f3f4f6; padding: 10px; border-left: 3px solid #0d9488; word-break: break-all;">
              ${compartilhaLink}
            </p>

            <p>No dashboard você poderá:</p>
            <ul>
              <li>Acompanhar todas as notas fiscais em tempo real</li>
              <li>Visualizar estatísticas da prefeitura</li>
              <li>Gerenciar dados da administração</li>
              <li>Receber avisos e notificações importantes</li>
            </ul>

            <p>Se tiver dúvidas, entre em contato com o administrador da prefeitura.</p>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">

            <p style="font-size: 12px; color: #666;">
              <strong>NF Prefeitura - Gestão de Notas Fiscais</strong><br>
              Este é um email automático. Não responda.
            </p>
          </div>
        </body>
      </html>
    `;

    const response = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: email,
      subject: `Acesso ao Dashboard - ${prefeturaNome}`,
      html: emailHtml,
    });

    if (response.error) {
      console.error("Erro Resend:", response.error);
      throw new Error(response.error.message);
    }

    return NextResponse.json(
      {
        success: true,
        message: `Email enviado para ${email}`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao enviar email:", error);
    return NextResponse.json(
      { error: "Erro ao enviar email" },
      { status: 500 }
    );
  }
}
