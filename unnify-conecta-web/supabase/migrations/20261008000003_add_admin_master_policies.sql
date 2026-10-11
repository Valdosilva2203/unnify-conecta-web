-- Add admin_master access policies for profiles, accounting_offices, and memberships
-- Uses the existing is_admin() function for consistency

-- Policy for perfis: Admin master can view all perfis
DROP POLICY IF EXISTS "Admin master view all perfis" ON public.perfis;
CREATE POLICY "Admin master view all perfis"
  ON public.perfis
  FOR SELECT
  TO authenticated
  USING (
    is_admin(auth.uid())
    OR auth.uid() = id_usuario
  );

-- Policy for accounting_offices: Admin master can view all offices
DROP POLICY IF EXISTS "Admin master view all offices" ON public.accounting_offices;
CREATE POLICY "Admin master view all offices"
  ON public.accounting_offices
  FOR SELECT
  TO authenticated
  USING (
    is_admin(auth.uid())
    OR id IN (
      SELECT accounting_office_id
      FROM public.user_accounting_office_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Policy for accounting_offices: Admin master can update any office
DROP POLICY IF EXISTS "Admin master update any office" ON public.accounting_offices;
CREATE POLICY "Admin master update any office"
  ON public.accounting_offices
  FOR UPDATE
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Policy for accounting_offices: Admin master can delete any office
DROP POLICY IF EXISTS "Admin master delete any office" ON public.accounting_offices;
CREATE POLICY "Admin master delete any office"
  ON public.accounting_offices
  FOR DELETE
  TO authenticated
  USING (is_admin(auth.uid()));

-- Policy for memberships: Admin master can view all memberships
DROP POLICY IF EXISTS "Admin master view all memberships" ON public.user_accounting_office_memberships;
CREATE POLICY "Admin master view all memberships"
  ON public.user_accounting_office_memberships
  FOR SELECT
  TO authenticated
  USING (
    is_admin(auth.uid())
    OR user_id = auth.uid()
  );

-- Comments for audit trail
COMMENT ON POLICY "Admin master view all perfis" ON public.perfis
IS 'Allows admin_master and admin roles to view all user perfis. Regular users can only view their own.';

COMMENT ON POLICY "Admin master view all offices" ON public.accounting_offices
IS 'Allows admin_master and admin roles to view all accounting offices (contadores).';

COMMENT ON POLICY "Admin master update any office" ON public.accounting_offices
IS 'Allows admin_master and admin roles to update any accounting office.';

COMMENT ON POLICY "Admin master delete any office" ON public.accounting_offices
IS 'Allows admin_master and admin roles to delete any accounting office.';

COMMENT ON POLICY "Admin master view all memberships" ON public.user_accounting_office_memberships
IS 'Allows admin_master and admin roles to view all office memberships.';
