const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://zubvmhvizvcnudognfqw.supabase.co",
  "sb_secret_Q8-GVyi4f5_VYgFUIBaY5Q_t3jezh3e"
);

(async () => {
  const senhaHash = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
  const cnpj = "52.690.438/0001-42";
  
  // Pegar primeira prefeitura
  const { data: prefeituras } = await supabase
    .from("prefeituras")
    .select("id")
    .limit(1);

  if (!prefeituras || prefeituras.length === 0) {
    console.error("❌ Nenhuma prefeitura");
    return;
  }

  const prefeituraId = prefeituras[0].id;
  console.log("🏛️  Prefeitura:", prefeituraId);

  // Criar fornecedor
  const { data: fornecedor, error: fornecedorError } = await supabase
    .from("fornecedores")
    .insert({
      nome: "Suporte Deepweb Ltda",
      email: "suportedeepweb@gmail.com",
      cnpj_cpf: cnpj,
      telefone: "(00) 99999-9999",
      endereco: "Rua Teste, 123",
      cidade: "Tocantins",
      estado: "TO",
      bairro: "Centro",
      prefeitura_id: prefeituraId
    })
    .select();

  if (fornecedorError) {
    console.error("❌ Erro ao criar fornecedor:", fornecedorError);
    return;
  }

  const fornecedorId = fornecedor[0].id;
  console.log("✅ Fornecedor criado!");
  console.log("📦 ID:", fornecedorId);

  // Criar credenciais
  const { data: cred, error: credError } = await supabase
    .from("fornecedor_credenciais")
    .insert({
      fornecedor_id: fornecedorId,
      cnpj: cnpj,
      senha: senhaHash,
      status: "ativo"
    })
    .select();

  if (credError) {
    console.error("❌ Erro ao criar credenciais:", credError);
  } else {
    console.log("✅ Credenciais criadas!");
    console.log("🔐 CNPJ: 52.690.438/0001-42");
    console.log("🔑 Senha: 123456");
  }
})();
