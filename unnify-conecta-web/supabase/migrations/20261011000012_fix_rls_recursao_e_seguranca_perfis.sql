-- 1. Recursão infinita na policy de SELECT de usuarios_empresas
CREATE OR REPLACE FUNCTION public.minhas_empresas_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id_empresa FROM public.usuarios_empresas WHERE id_usuario = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.minhas_empresas_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minhas_empresas_ids() TO authenticated;

DROP POLICY IF EXISTS "Users can view their own company relationships" ON public.usuarios_empresas;
CREATE POLICY "Users can view their own company relationships"
  ON public.usuarios_empresas FOR SELECT TO authenticated
  USING (id_usuario = auth.uid() OR id_empresa IN (SELECT public.minhas_empresas_ids()));

-- 2. is_admin / is_admin_master ainda liam a tabela antiga "profiles"
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT funcao_global IN ('admin_master', 'admin')
       FROM public.perfis
      WHERE id_usuario = COALESCE(p_user_id, auth.uid())),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_master(p_user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT funcao_global = 'admin_master'
       FROM public.perfis
      WHERE id_usuario = COALESCE(p_user_id, auth.uid())),
    false
  );
$$;

-- 3. Policies abertas a qualquer pessoa (inclusive anônimos) em perfis.
--    O service_role já tem a policy "Service role bypass".
DROP POLICY IF EXISTS "Service role insert and update" ON public.perfis;
DROP POLICY IF EXISTS "Service role update" ON public.perfis;

-- 4. Perfil deve ser apagado junto com o usuário
ALTER TABLE public.perfis
  ADD CONSTRAINT perfis_id_usuario_fkey
  FOREIGN KEY (id_usuario) REFERENCES auth.users(id) ON DELETE CASCADE;
