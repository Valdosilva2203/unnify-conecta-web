import { getSupabaseAdmin } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const prefeituraId = request.nextUrl.searchParams.get("prefeitura_id");

    if (!prefeituraId) {
      return NextResponse.json(
        { error: "prefeitura_id required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("configuracao_prefeitura")
      .select("*")
      .eq("prefeitura_id", prefeituraId)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    return NextResponse.json({ data: data || null });
  } catch (error) {
    console.error("Erro ao buscar configuração:", error);
    return NextResponse.json({ data: null });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prefeitura_id, ...configuracao } = body;

    if (!prefeitura_id) {
      return NextResponse.json(
        { error: "prefeitura_id required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("configuracao_prefeitura")
      .upsert({
        prefeitura_id,
        ...configuracao,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Erro ao salvar configuração:", error);
    return NextResponse.json(
      { error: "Erro ao salvar configuração" },
      { status: 500 }
    );
  }
}
