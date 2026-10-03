import { getSupabaseAdmin } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const fornecedorId = request.nextUrl.searchParams.get("fornecedor_id");
    const prefeituraId = request.nextUrl.searchParams.get("prefeitura_id");

    if (!fornecedorId || !prefeituraId) {
      return NextResponse.json(
        { error: "Missing fornecedor_id or prefeitura_id" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    try {
      // Buscar todos os chamados da prefeitura
      const { data: chamados, error } = await supabaseAdmin
        .from("chamados")
        .select("*")
        .eq("prefeitura_id", prefeituraId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("❌ Erro ao buscar chamados:", JSON.stringify(error, null, 2));
        // Se a tabela não existe ou há erro, retornar array vazio
        return NextResponse.json({ chamados: [] });
      }

      // Para cada chamado, buscar a secretaria e o nome do criador
      const chamadosComSecretarias = await Promise.all(
        (chamados || []).map(async (ch: any) => {
          let secretaria_nome = null;
          let criador_nome = null;

          if (ch.secretaria_id) {
            const { data: secretaria } = await supabaseAdmin
              .from("secretarias")
              .select("nome")
              .eq("id", ch.secretaria_id)
              .single();

            secretaria_nome = secretaria?.nome;
          }

          if (ch.criado_por) {
            // Tentar buscar em prefeitura_users primeiro
            const { data: prefeituraUser } = await supabaseAdmin
              .from("prefeitura_users")
              .select("nome")
              .eq("id", ch.criado_por)
              .single()
              .catch(() => ({ data: null }));

            if (prefeituraUser?.nome) {
              criador_nome = prefeituraUser.nome;
            } else {
              // Se não encontrar, tentar em fornecedores
              const { data: fornecedor } = await supabaseAdmin
                .from("fornecedores")
                .select("nome")
                .eq("id", ch.criado_por)
                .single()
                .catch(() => ({ data: null }));

              if (fornecedor?.nome) {
                criador_nome = fornecedor.nome;
              } else {
                // Fallback: retornar os primeiros caracteres do UUID
                criador_nome = ch.criado_por.substring(0, 8);
              }
            }
          }

          return {
            id: ch.id,
            titulo: ch.titulo,
            descricao: ch.descricao,
            status: ch.status,
            prioridade: ch.prioridade,
            created_at: ch.created_at,
            updated_at: ch.updated_at,
            numero_chamado: ch.numero_chamado,
            criado_por: criador_nome,
            secretaria_nome: secretaria_nome,
          };
        })
      );

      return NextResponse.json({ chamados: chamadosComSecretarias });
    } catch (catchError) {
      console.error("❌ Exception ao buscar chamados:", catchError);
      // Retornar array vazio em caso de exceção (tabela não existe)
      return NextResponse.json({ chamados: [] });
    }
  } catch (error) {
    console.error("Erro na API de chamados:", error);
    return NextResponse.json(
      { error: "Erro ao processar requisição", details: String(error) },
      { status: 500 }
    );
  }
}
