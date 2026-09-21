import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Gerar CNPJ único com timestamp e random
function gerarCNPJUnico(): string {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, "0");
  const numeros = (timestamp + random).slice(0, 14);

  return `${numeros.slice(0, 2)}.${numeros.slice(2, 5)}.${numeros.slice(5, 8)}/${numeros.slice(8, 12)}-${numeros.slice(12, 14)}`;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const prefeituraId = formData.get("prefeituraId") as string;

    if (!file) {
      return NextResponse.json(
        { erro: "Arquivo não fornecido" },
        { status: 400 }
      );
    }

    if (!prefeituraId) {
      return NextResponse.json(
        { erro: "ID da prefeitura não fornecido" },
        { status: 400 }
      );
    }

    // Ler conteúdo do arquivo CSV
    const conteudo = await file.text();
    const linhas = conteudo.split("\n").filter((linha) => linha.trim());

    if (linhas.length < 2) {
      return NextResponse.json(
        { erro: "Arquivo CSV vazio ou inválido" },
        { status: 400 }
      );
    }

    // Parse do CSV (pulando o cabeçalho)
    const cabecalho = linhas[0].split(",").map((col) => col.trim());
    const indicePorColuna = {
      nome: cabecalho.indexOf("nome"),
      razao_social: cabecalho.indexOf("razao_social"),
      email: cabecalho.indexOf("email"),
      telefone: cabecalho.indexOf("telefone"),
      endereco: cabecalho.indexOf("endereco"),
      cidade: cabecalho.indexOf("cidade"),
      estado: cabecalho.indexOf("estado"),
      cnpj_cpf: cabecalho.indexOf("cnpj_cpf"),
    };

    // Aceitar tanto 'nome' quanto 'razao_social'
    const indiceNome = indicePorColuna.nome !== -1 ? indicePorColuna.nome : indicePorColuna.razao_social;

    // Validar se as colunas obrigatórias existem
    if (indiceNome === -1 || indicePorColuna.email === -1) {
      return NextResponse.json(
        { erro: "Formato CSV inválido. Colunas obrigatórias: nome (ou razao_social), email" },
        { status: 400 }
      );
    }

    const fornecedores = [];
    for (let i = 1; i < linhas.length; i++) {
      const valores = linhas[i].split(",").map((v) => v.trim());

      const nome = valores[indiceNome];
      const email = valores[indicePorColuna.email];
      const telefone = valores[indicePorColuna.telefone];
      const endereco = valores[indicePorColuna.endereco];
      const cidade = valores[indicePorColuna.cidade];
      const estado = valores[indicePorColuna.estado];
      const cnpj_cpf = valores[indicePorColuna.cnpj_cpf];

      if (nome && email) {
        fornecedores.push({
          nome: nome,
          email: email.toLowerCase(),
          telefone: telefone || null,
          endereco: endereco || null,
          cidade: cidade || null,
          estado: estado || null,
          cnpj_cpf: cnpj_cpf || gerarCNPJUnico(),
          prefeitura_id: prefeituraId,
          tipo: "PJ",
        });
      }
    }

    if (fornecedores.length === 0) {
      return NextResponse.json(
        { erro: "Nenhum fornecedor válido encontrado no arquivo" },
        { status: 400 }
      );
    }

    // Buscar fornecedores existentes
    const { data: existentes } = await supabase
      .from("fornecedores")
      .select("email, nome")
      .eq("prefeitura_id", prefeituraId);

    const mapExistentes = new Set(
      (existentes || []).map((f) => `${f.email}|${f.nome}`)
    );

    // Separar novos e duplicados
    const novos = fornecedores.filter(
      (f) => !mapExistentes.has(`${f.email}|${f.nome}`)
    );
    const duplicados = fornecedores.length - novos.length;

    let inseridos = 0;
    let erros = 0;

    // Inserir novos fornecedores
    if (novos.length > 0) {
      const { error } = await supabase.from("fornecedores").insert(novos);

      if (error) {
        erros = novos.length;
        return NextResponse.json(
          {
            sucesso: false,
            mensagem: "Erro ao importar fornecedores",
            erro: error.message,
            resumo: {
              total: fornecedores.length,
              inseridos: 0,
              duplicados,
              erros,
            },
          },
          { status: 500 }
        );
      }

      inseridos = novos.length;
    }

    return NextResponse.json({
      sucesso: true,
      mensagem: `Importação concluída com sucesso!`,
      resumo: {
        total: fornecedores.length,
        inseridos,
        duplicados,
        erros,
      },
    });
  } catch (erro) {
    console.error("Erro ao importar fornecedores:", erro);
    return NextResponse.json(
      { erro: "Erro interno ao processar arquivo" },
      { status: 500 }
    );
  }
}
