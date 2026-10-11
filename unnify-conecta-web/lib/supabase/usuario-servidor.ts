import { createServerClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';

// Identifica o usuário a partir da sessão (cookies) validando o token no Supabase Auth.
export async function usuarioDaRequisicao(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: () => {},
      },
    }
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
