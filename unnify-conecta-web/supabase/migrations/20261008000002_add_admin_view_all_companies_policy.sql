-- Safe function to check if user is admin (reusable across multiple tables)
-- SECURITY DEFINER ensures the function runs with creator privileges
-- This prevents privilege escalation through RLS bypass
CREATE FUNCTION public.is_admin(p_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_role global_role;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT global_role INTO v_role
  FROM public.profiles
  WHERE id = v_user_id;

  RETURN v_role IN ('admin_master', 'admin');
END;
$$;

-- Grant execution permission to authenticated users only
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;

-- Remove old policy if exists (idempotency - handles re-runs)
DROP POLICY IF EXISTS "Admins can view all companies" ON public.companies;

-- Add policy allowing admins to view all companies
-- This policy allows admin_master and admin roles to read all companies
-- while preserving the original policy that restricts regular users to their own companies
-- Uses the safe is_admin() function instead of inline subqueries for better performance
CREATE POLICY "Admins can view all companies"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    is_admin(auth.uid())
    OR created_by = auth.uid()
  );

-- Comment for audit trail
COMMENT ON POLICY "Admins can view all companies" ON public.companies
IS 'Allows admin_master and admin roles to view all companies. Regular users can only view their own.';

-- Comment on function for clarity
COMMENT ON FUNCTION public.is_admin(UUID) IS
'Safe function to verify if a user has admin privileges (admin_master or admin role).
Uses SECURITY DEFINER to prevent RLS bypass exploits. Reusable across policies and functions.';
