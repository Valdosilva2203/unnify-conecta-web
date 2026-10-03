import { getSupabaseAdmin } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    // Buscar um registro vazio só para ver os campos
    const { data, error } = await supabaseAdmin
      .from("chamados")
      .select("*")
      .limit(1);

    if (error) {
      return NextResponse.json({ error: error.message });
    }

    // Pegar os campos do primeiro registro
    const campos = data && data.length > 0 ? Object.keys(data[0]) : [];

    return NextResponse.json({
      campos: campos,
      total_campos: campos.length,
      exemplo: data?.[0] || null
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) });
  }
}
