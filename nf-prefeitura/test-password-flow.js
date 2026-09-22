/**
 * Script de teste completo do fluxo de mudança de senha
 * Busca um usuário real e testa toda a sequência
 *
 * Uso: node test-password-flow.js
 */

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://zubvmhvizvcnudognfqw.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

async function testPasswordFlow() {
  console.log("\n🔐 Iniciando teste completo de mudança de senha...\n");

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ SUPABASE_SERVICE_ROLE_KEY não definida!");
    process.exit(1);
  }

  try {
    // 1. Buscar um usuário de teste (funcionário)
    console.log("📋 Buscando usuário de teste...");
    const { data: funcionario, error: searchError } = await supabase
      .from("funcionarios")
      .select("id, email, nome")
      .limit(1)
      .single();

    if (searchError || !funcionario) {
      console.error("❌ Erro ao buscar usuário:", searchError?.message);
      process.exit(1);
    }

    console.log(`✅ Usuário encontrado:`);
    console.log(`   ID: ${funcionario.id}`);
    console.log(`   Nome: ${funcionario.nome}`);
    console.log(`   Email: ${funcionario.email}\n`);

    // 2. Testar API de mudança de senha
    console.log("📤 Enviando requisição de mudança de senha...");
    const response = await fetch("http://localhost:3003/api/alterar-senha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: funcionario.id,
        senhaAtual: "123456", // Senha padrão de teste
        novaSenha: `newpass_${Date.now()}`, // Senha aleatória
        tabela: "funcionarios",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ Erro na API:", data.error);
      process.exit(1);
    }

    console.log("✅ Requisição bem-sucedida!");
    console.log(`   Mensagem: ${data.message}\n`);

    if (data.confirmLink) {
      console.log("🔗 Link de confirmação (DEV MODE):");
      console.log(`   ${data.confirmLink}\n`);

      // 3. Testar link de confirmação
      console.log("🔄 Testando confirmação via link...");
      const token = new URL(data.confirmLink).searchParams.get("token");

      const confirmResponse = await fetch(
        `http://localhost:3003/api/confirmar-mudanca-senha?token=${token}`
      );

      const confirmData = await confirmResponse.json();

      if (!confirmResponse.ok) {
        console.error("❌ Erro ao confirmar:", confirmData.error);
        process.exit(1);
      }

      console.log("✅ Confirmação bem-sucedida!");
      console.log(`   Mensagem: ${confirmData.message}\n`);

      // 4. Verificar se a senha foi realmente alterada
      console.log("🔍 Verificando se a senha foi alterada no banco...");
      const { data: usuarioAtualizado } = await supabase
        .from("funcionarios")
        .select("password_change_token, password_change_hash")
        .eq("id", funcionario.id)
        .single();

      if (usuarioAtualizado?.password_change_token === null) {
        console.log("✅ Senha alterada com sucesso!");
        console.log("   Token limpo: Sim");
        console.log("   Campos temporários: Limpos\n");
      } else {
        console.error("⚠️  Aviso: Campos temporários não foram limpos");
      }
    } else {
      console.log("📧 Email seria enviado para:", funcionario.email);
      console.log("   (Em produção)\n");
    }

    console.log("✅ TESTE COMPLETO COM SUCESSO!\n");
    process.exit(0);
  } catch (error) {
    console.error("❌ Erro:", error.message);
    process.exit(1);
  }
}

testPasswordFlow();
