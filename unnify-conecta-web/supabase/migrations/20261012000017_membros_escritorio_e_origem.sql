-- Membros do escritório (para o gestor designar quem atende) e origem nas empresas do escritório.

CREATE OR REPLACE FUNCTION public.membros_do_escritorio(p_id_escritorio uuid)
RETURNS TABLE (id_usuario uuid, nome text, tipo_vinculacao text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.e_gestor_empresa(p_id_escritorio) OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Você não tem permissão para ver os membros deste escritório.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT ue.id_usuario, COALESCE(p.nome_completo, p.email), ue.tipo_vinculacao
      FROM public.usuarios_empresas ue
      JOIN public.perfis p ON p.id_usuario = ue.id_usuario
     WHERE ue.id_empresa = p_id_escritorio
       AND ue.ativo
       AND p.tipo_usuario = 'contador'
       AND p.status = 'active'
     ORDER BY 2;
END;
$$;

DROP FUNCTION IF EXISTS public.empresas_do_escritorio(uuid, text, text, integer, integer);
CREATE FUNCTION public.empresas_do_escritorio(
  p_id_escritorio uuid,
  p_busca text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limite integer DEFAULT 20,
  p_deslocamento integer DEFAULT 0
)
RETURNS TABLE (
  id_vinculo uuid, id_empresa uuid, razao_social text, nome_comercial text, cnpj text,
  cidade text, estado text, funcao text, status text, origem text, id_contador uuid, contador_nome text,
  criado_em timestamptz, aprovado_em timestamptz, total bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.e_gestor_empresa(p_id_escritorio) OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Você não tem permissão para ver as empresas deste escritório.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT v.id, e.id, e.razao_social, e.nome_comercial, e.cnpj, e.cidade, e.estado::text,
           v.funcao, v.status, v.origem, v.id_contador, p.nome_completo, v.criado_em, v.aprovado_em,
           count(*) OVER ()
      FROM public.vinculos_contabeis v
      JOIN public.empresas e ON e.id = v.id_empresa
      LEFT JOIN public.perfis p ON p.id_usuario = v.id_contador
     WHERE v.id_escritorio = p_id_escritorio
       AND (p_status IS NULL OR v.status = p_status)
       AND (p_busca IS NULL OR p_busca = ''
            OR e.razao_social ILIKE '%' || p_busca || '%'
            OR e.nome_comercial ILIKE '%' || p_busca || '%'
            OR e.cnpj LIKE '%' || p_busca || '%')
     ORDER BY (v.status = 'pendente') DESC, e.razao_social
     LIMIT LEAST(GREATEST(p_limite, 1), 100) OFFSET GREATEST(p_deslocamento, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.membros_do_escritorio(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.empresas_do_escritorio(uuid, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.membros_do_escritorio(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.empresas_do_escritorio(uuid, text, text, integer, integer) TO authenticated;
