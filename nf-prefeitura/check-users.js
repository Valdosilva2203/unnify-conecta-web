const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://zubvmhvizvcnudognfqw.supabase.co",
  "sb_secret_Q8-GVyi4f5_VYgFUIBaY5Q_t3jezh3e"
);

(async () => {
  const { data, error } = await supabase
    .from("prefeitura_users")
    .select("email, nome, senha")
    .limit(10);

  if (error) {
    console.error("Erro:", error);
  } else {
    console.log("✅ Usuários encontrados:");
    data.forEach(u => {
      console.log(`  📧 ${u.email}`);
      console.log(`  👤 ${u.nome}`);
      console.log(`  🔐 Hash: ${u.senha.substring(0, 20)}...`);
      console.log("");
    });
  }
})();
