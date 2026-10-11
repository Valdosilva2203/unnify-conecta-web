-- Migration: Create perfis table (replacing profiles)
-- Date: 2026-10-11
-- This table holds user profiles with Portuguese column names

-- Drop old profiles table if it exists
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Drop old enums if they exist
DROP TYPE IF EXISTS public.global_role CASCADE;

-- Create funcao_global enum (Portuguese for global role)
CREATE TYPE public.funcao_global AS ENUM ('admin_master', 'admin', 'user');

-- Create perfis table with Portuguese naming conventions
CREATE TABLE IF NOT EXISTS public.perfis (
  id_usuario UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  nome_completo TEXT,
  funcao_global public.funcao_global NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS on perfis
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can read their own perfil
CREATE POLICY "Users can read own perfil"
  ON public.perfis
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id_usuario);

-- RLS Policy: Users cannot modify their own funcao_global
CREATE POLICY "Users cannot modify funcao_global"
  ON public.perfis
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id_usuario)
  WITH CHECK (funcao_global = (SELECT funcao_global FROM public.perfis WHERE id_usuario = auth.uid()));

-- RLS Policy: Service role can do anything
CREATE POLICY "Service role bypass"
  ON public.perfis
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create index for email lookups
CREATE INDEX idx_perfis_email ON public.perfis(email);

-- Comments
COMMENT ON TABLE public.perfis IS 'User profiles table with Portuguese naming conventions (id_usuario, funcao_global, etc)';
COMMENT ON COLUMN public.perfis.funcao_global IS 'Global platform role. admin_master and admin can only be set via database operations, never from frontend.';
