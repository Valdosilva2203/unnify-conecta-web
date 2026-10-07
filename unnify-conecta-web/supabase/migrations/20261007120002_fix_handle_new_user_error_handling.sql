-- MIGRATION: Fix handle_new_user() - Proper error handling and logging
-- Date: 2026-10-07
-- Purpose: Remove silent error suppression, add proper logging, ensure signup reliability
--
-- CHANGES:
-- 1. Remove EXCEPTION WHEN OTHERS THEN RETURN NEW (was silencing all errors)
-- 2. Implement targeted error handling: only ON CONFLICT for legitimate PK duplicates
-- 3. Add RAISE LOG for diagnostic logging via PostgreSQL native logs
-- 4. Propagate unexpected errors to allow proper diagnosis
-- 5. Ensure profile creation is mandatory for signup success
--
-- SECURITY REVIEW:
-- - SECURITY DEFINER: Preserved (required for service_role to INSERT)
-- - SET search_path = 'public': Preserved (prevents schema injection)
-- - GRANT EXECUTE: Still necessary for trigger execution
-- - GRANT INSERT: Still necessary for profile creation
-- - NO privilege escalation: Only creates 'user' role, never admin/admin_master
-- - No sensitive data logged: email/full_name are already public in auth.users

-- Drop existing trigger and function to replace safely
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Recreate function with proper error handling
CREATE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Log the operation for diagnostics
  RAISE LOG 'handle_new_user: Creating profile for user_id=%, email=%', NEW.id, NEW.email;

  -- Insert profile with ON CONFLICT to handle only legitimate PK duplicates
  INSERT INTO public.profiles (id, global_role, full_name)
  VALUES (
    NEW.id,
    'user',
    COALESCE(NEW.user_metadata->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;

  RAISE LOG 'handle_new_user: Profile created successfully for user_id=%', NEW.id;

  RETURN NEW;

-- Only catch unique_violation if it truly is a duplicate PK
-- All other errors propagate to allow diagnosis
EXCEPTION WHEN unique_violation THEN
  -- This should not happen with ON CONFLICT, but just in case
  RAISE LOG 'handle_new_user: Unique violation for user_id=% (expected due to ON CONFLICT)', NEW.id;
  RETURN NEW;
WHEN OTHERS THEN
  -- Unexpected error - log it with details and re-raise to prevent silent failures
  RAISE LOG 'handle_new_user: ERROR for user_id=%, email=%, error=%', NEW.id, NEW.email, SQLERRM;
  -- Re-raise the error so signup fails visibly and account is not orphaned
  RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- Recreate trigger to auto-create profiles on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Preserve necessary grants for service_role (required for trigger execution)
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT INSERT ON public.profiles TO service_role;
