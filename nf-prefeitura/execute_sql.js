const { Pool } = require("pg");

// Desabilitar verificação de certificado SSL
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const pool = new Pool({
  host: "aws-0-sa-east-1.pooler.supabase.com",
  port: 6543,
  database: "postgres",
  user: "postgres.zubvmhvizvcnudognfqw",
  password: "!@#VV220390220390vv#@!",
  ssl: true,
});

const sql = `
ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS requisicao_id UUID UNIQUE;
ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS nome VARCHAR(255) DEFAULT 'Minhas certidões';
ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS arquivo VARCHAR(500);
ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS url_assinada TEXT;
ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS criado_por UUID;

CREATE TABLE IF NOT EXISTS notas_fiscais_secretarias(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_fiscal_id UUID NOT NULL REFERENCES notas_fiscais(id) ON DELETE CASCADE,
  secretaria_id UUID NOT NULL REFERENCES secretarias(id) ON DELETE CASCADE,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(nota_fiscal_id, secretaria_id)
);

CREATE INDEX IF NOT EXISTS idx_notas_fiscais_requisicao ON notas_fiscais(requisicao_id);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_secretarias_nota ON notas_fiscais_secretarias(nota_fiscal_id);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_secretarias_secretaria ON notas_fiscais_secretarias(secretaria_id);
`;

(async () => {
  const client = await pool.connect();
  try {
    console.log("🔗 Conectando ao Supabase...");
    console.log("🔄 Criando tabelas...\n");

    // Executar cada statement
    const statements = sql.split(';').filter(s => s.trim());
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (stmt) {
        try {
          await client.query(stmt);
          console.log(`  OK [${i+1}/${statements.length}]`);
        } catch (err) {
          console.log(`  ${err.message.substring(0, 60)}`);
        }
      }
    }

    console.log("\n✅ Setup concluído!");
    console.log("\n📊 Configurado:");
    console.log("  - Colunas adicionadas a notas_fiscais");
    console.log("  - Tabela notas_fiscais_secretarias criada");
    console.log("  - Indices para performance");

  } catch (error) {
    console.error("❌ Erro:", error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
