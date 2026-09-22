/**
 * Script de teste para mudança de senha com confirmação via email
 *
 * Uso:
 * NODE_ENV=production node test-password-change.js <userId> <senhaAtual> <novaSenha> <tabela>
 *
 * Exemplo:
 * NODE_ENV=production node test-password-change.js "12345" "123456" "novasenha123" "funcionarios"
 */

const crypto = require("crypto");

async function testPasswordChange() {
  const [, , userId, senhaAtual, novaSenha, tabela] = process.argv;

  if (!userId || !senhaAtual || !novaSenha || !tabela) {
    console.error("❌ Uso: node test-password-change.js <userId> <senhaAtual> <novaSenha> <tabela>");
    console.error("Exemplo: node test-password-change.js 12345 123456 novasenha123 funcionarios");
    process.exit(1);
  }

  console.log(`\n🔐 Testando mudança de senha...`);
  console.log(`   User ID: ${userId}`);
  console.log(`   Tabela: ${tabela}`);
  console.log(`   Ambiente: ${process.env.NODE_ENV || "development"}\n`);

  try {
    const response = await fetch("http://localhost:3003/api/alterar-senha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        senhaAtual,
        novaSenha,
        tabela,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ Erro na requisição:");
      console.error(`   Status: ${response.status}`);
      console.error(`   Erro: ${data.error}`);
      process.exit(1);
    }

    console.log("✅ Requisição bem-sucedida!");
    console.log(`   Mensagem: ${data.message}`);

    if (data.confirmLink) {
      console.log(`\n🔗 Link de confirmação (DEV MODE):`);
      console.log(`   ${data.confirmLink}`);
      console.log(`\n📋 Próximos passos:`);
      console.log(`   1. Copie o link acima`);
      console.log(`   2. Cole no navegador`);
      console.log(`   3. A senha será alterada`);
      console.log(`   4. Faça login com a nova senha\n`);
    } else {
      console.log(`\n📧 Email de confirmação enviado!`);
      console.log(`   Verifique a caixa de entrada de: ${userId}`);
      console.log(`\n📋 Próximos passos:`);
      console.log(`   1. Clique no link no email`);
      console.log(`   2. A senha será alterada`);
      console.log(`   3. Faça login com a nova senha\n`);
    }
  } catch (error) {
    console.error("❌ Erro ao conectar com servidor:", error.message);
    process.exit(1);
  }
}

testPasswordChange();
