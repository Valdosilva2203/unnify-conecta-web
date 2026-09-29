const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://zubvmhvizvcnudognfqw.supabase.co",
  "sb_secret_Q8-GVyi4f5_VYgFUIBaY5Q_t3jezh3e"
);

(async () => {
  const { data, error } = await supabase
    .from("fornecedor_credenciais")
    .select("*")
    .limit(1);

  if (error) {
    console.error("Erro:", error);
  } else if (data.length === 0) {
    console.log("Tabela vazia, mas consultável");
  } else {
    console.log("Colunas:", Object.keys(data[0]));
  }
})();
