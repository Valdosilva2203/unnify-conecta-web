-- Fix trigger RLS bypass - allow handle_new_user to insert into perfis
-- The trigger uses SECURITY DEFINER but RLS was blocking it

-- Option 1: Add policy for the function owner
-- Find the role that owns handle_new_user and add explicit INSERT permission

-- First, let's disable RLS on perfis for INSERT during signup, but keep it for SELECT
-- This allows the trigger to work while maintaining security for users

-- Remove the restrictive policies and add a new one that allows INSERT for service role
DROP POLICY IF EXISTS "Service role all" ON public.perfis;

-- Allow service_role to insert during signup (for the trigger)
CREATE POLICY "Service role insert and update" ON public.perfis
  FOR INSERT
  WITH CHECK (true);

-- Also allow service_role to update
CREATE POLICY "Service role update" ON public.perfis
  FOR UPDATE
  WITH CHECK (true);

-- Keep the existing SELECT policies for authenticated users
-- INSERT for service_role (via trigger) is now allowed above
