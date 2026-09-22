#!/usr/bin/env node

/**
 * Script para aplicar migração que adiciona campos password_change_* à tabela admins
 * Execute: node apply-migration-admins.js
 */

const https = require("https");

// Obter credenciais das variáveis de ambiente
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Erro: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados");
  process.exit(1);
}

const sql = `
-- Adicionar campos para confirmação de mudança de senha à tabela admins
ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS password_change_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS password_change_token_expires TIMESTAMP,
  ADD COLUMN IF NOT EXISTS password_change_hash VARCHAR(255);

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_admins_password_change_token
  ON admins(password_change_token);
`;

async function applyMigration() {
  return new Promise((resolve, reject) => {
    // URL da API do Supabase
    const url = new URL(supabaseUrl);
    const hostname = url.hostname;
    const path = "/rest/v1/rpc/sql";

    const postData = JSON.stringify({
      query: sql,
    });

    const options = {
      hostname,
      port: 443,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    };

    console.log("📡 Conectando ao Supabase...");

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (res.statusCode === 200) {
          console.log("✅ Migração aplicada com sucesso!");
          resolve(true);
        } else if (res.statusCode === 204) {
          console.log("✅ Migração aplicada com sucesso (sem conteúdo)!");
          resolve(true);
        } else {
          console.error(`❌ Erro: Status ${res.statusCode}`);
          console.error("Resposta:", data);
          reject(new Error(`Status ${res.statusCode}`));
        }
      });
    });

    req.on("error", (error) => {
      console.error("❌ Erro de conexão:", error.message);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

applyMigration()
  .then(() => {
    console.log("\n✨ Tudo pronto! Agora você pode usar a mudança de senha para usuários master.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n⚠️  Erro ao aplicar migração:", error.message);
    console.log("\n💡 Alternativa: Execute manualmente no Supabase SQL Editor:");
    console.log("═".repeat(70));
    console.log(sql);
    console.log("═".repeat(70));
    process.exit(1);
  });
