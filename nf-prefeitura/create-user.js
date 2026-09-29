const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://zubvmhvizvcnudognfqw.supabase.co",
  "sb_secret_Q8-GVyi4f5_VYgFUIBaY5Q_t3jezh3e"
);

(async () => {
  // Hash de "123456"
  const senhaHash = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
  
  // Pegar a primeira prefeitura
  const { data: prefeituras } = await supabase
    .from("prefeituras")
    .select("id")
    .limit(1);

  if (!prefeituras || prefeituras.length === 0) {
    console.error("❌ Nenhuma prefeitura encontrada");
    return;
  }

  const prefeituraId = prefeituras[0].id;
  console.log("🏛️  Prefeitura ID:", prefeituraId);

  // Criar novo usuário
  const { data, error } = await supabase
    .from("prefeitura_users")
    .insert({
      email: "suportedeepweb@gmail.com",
      nome: "Suporte Deepweb",
      senha: senhaHash,
      prefeitura_id: prefeituraId,
      role: "admin",
      status: "ativo"
    })
    .select();

  if (error) {
    console.error("❌ Erro ao criar usuário:", error);
  } else {
    console.log("✅ Usuário criado com sucesso!");
    console.log("📧 Email:", data[0].email);
    console.log("🔐 Senha: 123456");
    console.log("👤 Nome:", data[0].nome);
  }
})();
