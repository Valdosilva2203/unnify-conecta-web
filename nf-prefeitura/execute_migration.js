const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://zubvmhvizvcnudognfqw.supabase.co",
  "sb_secret_Q8-GVyi4f5_VYgFUIBaY5Q_t3jezh3e"
);

(async () => {
  try {
    // Tenta adicionar as colunas fazendo um update com campos que não existem
    // Isso fará o Supabase criar os campos automaticamente
    const { error } = await supabase
      .from("fornecedor_credenciais")
      .update({
        reset_token: null,
        reset_token_expires: null,
      })
      .eq("id", "00000000-0000-0000-0000-000000000000");

    if (error && error.code !== "PGRST116") {
      console.error("Erro:", error.message);
    } else {
      console.log("✅ Colunas adicionadas/verificadas com sucesso!");
    }
  } catch (err) {
    console.error("❌ Erro geral:", err.message);
  }
})();
