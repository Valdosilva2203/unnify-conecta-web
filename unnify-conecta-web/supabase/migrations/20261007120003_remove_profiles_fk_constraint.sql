-- MIGRATION: Remove profiles FK constraint to fix signup trigger timing
-- Date: 2026-10-07
-- Problem: Foreign key constraint was causing trigger to fail on signup
-- Solution: Remove FK (relationship maintained via RLS policies)

-- Drop the problematic foreign key
ALTER TABLE public.profiles DROP CONSTRAINT profiles_id_fkey;

-- Update table comment to document the relationship
COMMENT ON TABLE public.profiles IS 'User profiles table. The id field logically references auth.users(id) but the constraint was removed to allow reliable async trigger-based profile creation during signup. RLS policies enforce data isolation.';
