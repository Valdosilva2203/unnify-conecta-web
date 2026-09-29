const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://zubvmhvizvcnudognfqw.supabase.co",
  "sb_secret_Q8-GVyi4f5_VYgFUIBaY5Q_t3jezh3e"
);

(async () => {
  // Deletar credenciais antigas se existirem
  await supabase
    .from("fornecedor_credenciais")
    .delete()
    .eq("email", "suportedeepweb@gmail.com");

  // Criar novas credenciais
  const senhaHash = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
  const fornecedorId = "772b41c9-5fd2-4ffc-9d98-3dde85b7d22d";

  const { data: cred, error } = await supabase
    .from("fornecedor_credenciais")
    .insert({
      fornecedor_id: fornecedorId,
      email: "suportedeepweb@gmail.com",
      senha_hash: senhaHash,
      status: "ativo"
    })
    .select();

  if (error) {
    console.error("❌ Erro:", error);
  } else {
    console.log("✅ Credenciais criadas com sucesso!");
    console.log("📧 Email: suportedeepweb@gmail.com");
    console.log("🔐 Senha: 123456");
    console.log("");
    console.log("⚠️  IMPORTANTE: Use EMAIL como login (não CNPJ)");
    console.log("Ou use CNPJ: 52.690.438/0001-42");
  }
})();
