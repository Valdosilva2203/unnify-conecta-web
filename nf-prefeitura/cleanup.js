const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://zubvmhvizvcnudognfqw.supabase.co",
  "sb_secret_Q8-GVyi4f5_VYgFUIBaY5Q_t3jezh3e"
);

(async () => {
  const fornecedorId = "772b41c9-5fd2-4ffc-9d98-3dde85b7d22d";

  // Deletar credenciais
  await supabase
    .from("fornecedor_credenciais")
    .delete()
    .eq("fornecedor_id", fornecedorId);

  // Deletar fornecedor
  await supabase
    .from("fornecedores")
    .delete()
    .eq("id", fornecedorId);

  console.log("✅ Fornecedor e credenciais deletados");

  // Deletar usuário prefeitura se existir
  await supabase
    .from("prefeitura_users")
    .delete()
    .eq("email", "suportedeepweb@gmail.com");

  console.log("✅ Usuário prefeitura deletado");
})();
