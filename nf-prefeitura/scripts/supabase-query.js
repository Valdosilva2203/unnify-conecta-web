#!/usr/bin/env node

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Erro: SUPABASE_URL ou SUPABASE_SERVICE_KEY não configurados");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const args = process.argv.slice(2);
const command = args[0];
const table = args[1];
let jsonData = null;
if (command !== "select" && command !== "delete" && args[2]) {
  jsonData = JSON.parse(args[2]);
}

async function run() {
  try {
    if (command === "select") {
      const { data, error } = await supabase
        .from(table)
        .select(args[2] || "*")
        .limit(args[3] ? parseInt(args[3]) : 100);
      if (error) throw error;
      console.log(JSON.stringify(data, null, 2));
    } else if (command === "insert") {
      const { data, error } = await supabase
        .from(table)
        .insert(jsonData)
        .select();
      if (error) throw error;
      console.log("✅ Inserido:", JSON.stringify(data, null, 2));
    } else if (command === "update") {
      const whereKey = args[3];
      const whereValue = args[4];
      const { data, error } = await supabase
        .from(table)
        .update(jsonData)
        .eq(whereKey, whereValue)
        .select();
      if (error) throw error;
      console.log("✅ Atualizado:", JSON.stringify(data, null, 2));
    } else if (command === "delete") {
      const whereKey = args[2];
      const whereValue = args[3];
      const { data, error } = await supabase
        .from(table)
        .delete()
        .eq(whereKey, whereValue)
        .select();
      if (error) throw error;
      console.log("✅ Deletado:", JSON.stringify(data, null, 2));
    } else if (command === "tables") {
      const { data, error } = await supabase.rpc("get_tables");
      if (error) {
        // Se não houver função RPC, tenta outra abordagem
        console.error("❌ Erro:", error.message);
        console.log("\n📝 Tabelas conhecidas no projeto:");
        const tables = ["requisicoes", "chamados", "secretarias", "prefeituras", "usuarios", "funcionarios", "objetos_contratos", "contratos", "consumo_objetos", "solicitacoes_vinculacao", "justificativas"];
        console.log(JSON.stringify(tables, null, 2));
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
    } else if (command === "schema") {
      const { data, error } = await supabase
        .from("information_schema.tables")
        .select("*")
        .eq("table_schema", "public");
      if (error) throw error;
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(`
Uso:
  node scripts/supabase-query.js select <tabela> [colunas] [limite]
  node scripts/supabase-query.js insert <tabela> '<json>'
  node scripts/supabase-query.js update <tabela> '<json>' <coluna> <valor>
  node scripts/supabase-query.js delete <tabela> <coluna> <valor>
  node scripts/supabase-query.js schema

Exemplos:
  node scripts/supabase-query.js select requisicoes
  node scripts/supabase-query.js select requisicoes "id,titulo" 10
  node scripts/supabase-query.js insert requisicoes '{"titulo":"Teste"}'
      `);
    }
  } catch (error) {
    console.error("❌ Erro:", error.message);
    process.exit(1);
  }
}

run();
