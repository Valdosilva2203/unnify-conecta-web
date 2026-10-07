-- Fix: Add INSERT policy for service_role to allow profile creation on signup
-- The trigger on_auth_user_created needs to insert profiles when new users sign up

-- Check if policy already exists before creating
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'profiles'
    AND policyname = 'Service role can insert profiles'
  ) THEN
    CREATE POLICY "Service role can insert profiles"
      ON public.profiles
      FOR INSERT
      TO service_role
      WITH CHECK (true);
  END IF;
END $$;
