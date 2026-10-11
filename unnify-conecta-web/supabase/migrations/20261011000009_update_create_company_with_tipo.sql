-- Update create_company function to:
-- 1. Accept tipo_empresa parameter
-- 2. Create empresa with tipo_empresa
-- 3. Automatically create usuarios_empresas relationship as 'dono'

DROP FUNCTION IF EXISTS public.create_company(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_company(
  p_cnpj TEXT,
  p_legal_name TEXT,
  p_phone TEXT,
  p_commercial_email TEXT,
  p_city TEXT,
  p_state TEXT,
  p_tipo_empresa TEXT DEFAULT 'comum',
  p_trade_name TEXT DEFAULT NULL
)
RETURNS TABLE(id UUID, success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT null::UUID, false, 'Usuário não autenticado'::TEXT;
    RETURN;
  END IF;

  -- Validate tipo_empresa
  IF p_tipo_empresa NOT IN ('comum', 'escritorio_contabil') THEN
    RETURN QUERY SELECT null::UUID, false, 'Tipo de empresa inválido'::TEXT;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.empresas WHERE cnpj = p_cnpj) THEN
    RETURN QUERY SELECT null::UUID, false, 'CNPJ já cadastrado'::TEXT;
    RETURN;
  END IF;

  BEGIN
    -- Create company
    INSERT INTO public.empresas (
      cnpj, razao_social, nome_comercial, telefone,
      email_comercial, city, state, tipo_empresa, criado_por
    ) VALUES (
      p_cnpj, p_legal_name, p_trade_name, p_phone,
      p_commercial_email, p_city, p_state, p_tipo_empresa, v_user_id
    )
    RETURNING id INTO v_company_id;

    -- Create automatic relationship: creator is 'dono' (owner)
    INSERT INTO public.usuarios_empresas (
      id_usuario, id_empresa, tipo_vinculacao, ativo
    ) VALUES (
      v_user_id, v_company_id, 'dono', true
    );

    RETURN QUERY SELECT v_company_id, true, 'Empresa criada com sucesso'::TEXT;

  EXCEPTION
    WHEN unique_violation THEN
      RETURN QUERY SELECT null::UUID, false, 'CNPJ já cadastrado'::TEXT;
    WHEN OTHERS THEN
      RETURN QUERY SELECT null::UUID, false, SQLERRM::TEXT;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_company(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
TO authenticated, anon, service_role;
