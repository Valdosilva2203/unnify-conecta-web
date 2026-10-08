-- Add policy allowing admins to view all companies
-- This policy allows admin_master and admin roles to read all companies
-- while preserving the original policy that restricts regular users to their own companies

CREATE POLICY "Admins can view all companies"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    (SELECT global_role FROM public.profiles WHERE id = auth.uid()) IN ('admin_master', 'admin')
    OR created_by = auth.uid()
  );

-- Comment for audit trail
COMMENT ON POLICY "Admins can view all companies" ON public.companies
IS 'Allows admin_master and admin roles to view all companies. Regular users can only view their own.';
