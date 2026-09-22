const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const migrationSQL = `
-- Adicionar campos para confirmação de mudança de senha
ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS password_change_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS password_change_token_expires TIMESTAMP,
  ADD COLUMN IF NOT EXISTS password_change_hash VARCHAR(255);

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_admins_password_change_token
  ON admins(password_change_token);
`;

async function runMigration() {
  try {
    console.log("Executando migração para tabela admins...");

    const { data, error } = await supabase.rpc("exec_sql", {
      sql: migrationSQL,
    });

    if (error) {
      // Se o RPC não existir, tenta com query direta
      console.log("RPC não disponível, tentando com query direta...");

      // Executar cada comando separadamente
      const commands = migrationSQL.split(";").filter(cmd => cmd.trim());

      for (const command of commands) {
        const trimmed = command.trim();
        if (!trimmed) continue;

        console.log(`Executando: ${trimmed.substring(0, 50)}...`);
        // Note: Supabase JS client não suporta raw SQL direto
        // Precisaremos fazer isso via SQL Editor no painel
      }

      console.log("⚠️  Migração manual necessária!");
      console.log("\nExecute o seguinte SQL no Supabase SQL Editor:");
      console.log("═".repeat(60));
      console.log(migrationSQL);
      console.log("═".repeat(60));
    } else {
      console.log("✅ Migração executada com sucesso!");
    }
  } catch (error) {
    console.error("Erro ao executar migração:", error.message);
    console.log("\n⚠️  Você precisa executar o seguinte SQL manualmente:");
    console.log("═".repeat(60));
    console.log(migrationSQL);
    console.log("═".repeat(60));
  }
}

runMigration();
