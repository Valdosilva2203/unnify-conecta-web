import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Execute the SQL to fix the database schema
    const sql = `
-- DROP existing problematic tables
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TYPE IF EXISTS public.global_role CASCADE;

-- Create funcao_global enum
CREATE TYPE public.funcao_global AS ENUM ('admin_master', 'admin', 'user');

-- Create perfis table with correct Portuguese naming
CREATE TABLE IF NOT EXISTS public.perfis (
  id_usuario UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  nome_completo TEXT,
  funcao_global public.funcao_global NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY IF NOT EXISTS "Users can read own perfil"
  ON public.perfis FOR SELECT TO authenticated
  USING (auth.uid() = id_usuario);

CREATE POLICY IF NOT EXISTS "Service role bypass"
  ON public.perfis FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Create/Update handle_new_user function
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfis (id_usuario, funcao_global, nome_completo, email, status)
  VALUES (
    NEW.id,
    'user',
    COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.email),
    NEW.email,
    'active'
  )
  ON CONFLICT (id_usuario) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Grants
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT INSERT ON public.perfis TO service_role;
    `;

    const { error } = await supabase.rpc('execute_sql', { sql });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
