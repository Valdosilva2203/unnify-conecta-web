import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export async function POST(request: NextRequest) {
  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { erro: "Resend API key não configurado" },
        { status: 500 }
      );
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const body = await request.json();
    const { fornecedorId, fornecedorEmail, fornecedorNome, prefeituraId, prefeituraNome } = body;

    if (!fornecedorId || !fornecedorEmail || !prefeituraId) {
      return NextResponse.json(
        { erro: "Dados incompletos" },
        { status: 400 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3003";
    const linkCadastro = `${baseUrl}/fornecedor/cadastro?fornecedor_id=${fornecedorId}&prefeitura_id=${prefeituraId}&token=temp`;

    // Enviar email via Resend
    const emailResponse = await resend.emails.send({
      from: "noreply@unnifyconecta.com.br",
      to: fornecedorEmail,
      subject: `Convite para acessar ${prefeituraNome} - Unnify`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Bem-vindo, ${fornecedorNome}!</h2>
          <p>Você foi convidado a acessar a plataforma Unnify da <strong>${prefeituraNome}</strong>.</p>

          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>Informações Compartilhadas:</h3>
            <p><strong>Empresa:</strong> ${fornecedorNome}</p>
            <p><strong>Email:</strong> ${fornecedorEmail}</p>
            <p><strong>Prefeitura:</strong> ${prefeituraNome}</p>
          </div>

          <p>Para finalizar seu cadastro e criar sua senha, clique no botão abaixo:</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${linkCadastro}" style="display: inline-block; background: #0066cc; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Finalizar Cadastro
            </a>
          </div>

          <p>Ou copie e cole este link no seu navegador:</p>
          <p style="word-break: break-all; background: #f0f0f0; padding: 10px; border-radius: 4px;">
            ${linkCadastro}
          </p>

          <p style="color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 20px;">
            Este link expira em 24 horas. Se você não solicitou este acesso, por favor ignore este email.
          </p>
        </div>
      `,
    });

    if (emailResponse.error) {
      console.error("Erro ao enviar email com Resend:", emailResponse.error);
      return NextResponse.json(
        { erro: "Erro ao enviar email" },
        { status: 500 }
      );
    }

    console.log("✅ Email enviado com sucesso:");
    console.log(`- Para: ${fornecedorEmail}`);
    console.log(`- Fornecedor: ${fornecedorNome}`);
    console.log(`- Prefeitura: ${prefeituraNome}`);

    return NextResponse.json(
      {
        sucesso: true,
        mensagem: "Email de compartilhamento enviado com sucesso!"
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao processar compartilhamento:", error);
    return NextResponse.json(
      { erro: "Erro ao processar solicitação" },
      { status: 500 }
    );
  }
}
