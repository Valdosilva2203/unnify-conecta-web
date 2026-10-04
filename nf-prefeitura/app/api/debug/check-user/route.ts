import { getSupabaseAdmin } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get("email");

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const emailLower = email.toLowerCase();
    const tables = ["prefeitura_users", "admins", "funcionarios", "fornecedor_credenciais"];
    const results: any = {};

    for (const table of tables) {
      const { data: users, error } = await supabaseAdmin
        .from(table)
        .select("*")
        .eq("email", emailLower);

      if (!error && users && users.length > 0) {
        results[table] = users.map((u: any) => ({
          ...u,
          senhaLength: u.senha ? u.senha.length : 0,
          senhaExists: !!u.senha
        }));
      }
    }

    if (Object.keys(results).length === 0) {
      return NextResponse.json({ error: "User not found in any table", found: false });
    }

    return NextResponse.json({ found: true, results });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
