-- Admins precisam ver todos os vínculos para contar membros de empresas/escritórios
CREATE POLICY "Admins can view all company relationships"
  ON public.usuarios_empresas FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
