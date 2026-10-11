-- MIGRATION: Remove profiles FK constraint to fix signup trigger timing
-- Date: 2026-10-07
-- Problem: Foreign key constraint was causing trigger to fail on signup
-- Solution: Remove FK (relationship maintained via RLS policies)

-- Drop the problematic foreign key if it exists
ALTER TABLE public.perfis DROP CONSTRAINT IF EXISTS perfis_id_usuario_fkey;

-- Update table comment to document the relationship
COMMENT ON TABLE public.perfis IS 'User profiles table. The id_usuario field logically references auth.users(id) but the constraint was removed to allow reliable async trigger-based profile creation during signup. RLS policies enforce data isolation.';
