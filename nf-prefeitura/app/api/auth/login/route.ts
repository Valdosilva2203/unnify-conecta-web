import { NextRequest, NextResponse } from "next/server";
import {
  isRateLimited,
  recordFailedAttempt,
  recordSuccessfulAttempt,
  getRemainingTime,
  getClientIp,
} from "@/lib/rateLimiter";
import { loginAdmin } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const { email, senha } = await request.json();

    if (!email || !senha) {
      return NextResponse.json(
        { sucesso: false, erro: "Email e senha são obrigatórios" },
        { status: 400 }
      );
    }

    const ip = getClientIp(request);

    // Verificar se o IP está rate limitado
    if (isRateLimited(ip)) {
      const remainingTime = getRemainingTime(ip);
      return NextResponse.json(
        {
          sucesso: false,
          erro: `Muitas tentativas de login. Tente novamente em ${remainingTime} segundos.`,
          rateLimited: true,
        },
        { status: 429 }
      );
    }

    // Tentar fazer login
    const resultado = await loginAdmin(email, senha);

    if (!resultado.sucesso) {
      // Registrar tentativa falhada
      const attempts = recordFailedAttempt(ip);

      // Se atingiu o limite, informar o bloqueio
      if (attempts >= 5) {
        return NextResponse.json(
          {
            sucesso: false,
            erro: "Muitas tentativas de login. Tente novamente em 15 minutos.",
            rateLimited: true,
          },
          { status: 429 }
        );
      }

      // Verificar se é usuário de prefeitura
      const { data: prefeituraUser } = await supabase
        .from("prefeitura_users")
        .select("prefeitura_id")
        .eq("email", email)
        .single();

      if (prefeituraUser) {
        return NextResponse.json(
          {
            sucesso: false,
            erro: "Este email pertence a um usuário de prefeitura",
            redirect: "/login",
          }
        );
      }

      return NextResponse.json(
        {
          sucesso: false,
          erro: "Email ou senha incorretos",
          tentativasRestantes: 5 - attempts,
        }
      );
    }

    // Login bem-sucedido, limpar o registro de rate limiting
    recordSuccessfulAttempt(ip);

    return NextResponse.json({
      sucesso: true,
      mensagem: "Login realizado com sucesso",
      admin: resultado.admin,
    });
  } catch (error) {
    console.error("Erro ao processar login:", error);
    return NextResponse.json(
      { sucesso: false, erro: "Erro ao processar requisição" },
      { status: 500 }
    );
  }
}
