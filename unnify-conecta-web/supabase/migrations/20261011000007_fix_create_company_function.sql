-- Fix create_company function to use correct table name (empresas not companies)

DROP FUNCTION IF EXISTS public.create_company();

CREATE OR REPLACE FUNCTION public.create_company(
  p_cnpj TEXT,
  p_legal_name TEXT,
  p_phone TEXT,
  p_commercial_email TEXT,
  p_city TEXT,
  p_state TEXT,
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

  -- Validate user is authenticated
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT null::UUID, false, 'Usuário não autenticado'::TEXT;
    RETURN;
  END IF;

  -- Check for duplicate CNPJ
  IF EXISTS (SELECT 1 FROM public.empresas WHERE cnpj = p_cnpj) THEN
    RETURN QUERY SELECT null::UUID, false, 'CNPJ já cadastrado'::TEXT;
    RETURN;
  END IF;

  -- Insert company and return result
  BEGIN
    INSERT INTO public.empresas (
      cnpj, nome_legal, nome_fantasia, telefone,
      email_comercial, cidade, estado, criado_por
    ) VALUES (
      p_cnpj, p_legal_name, p_trade_name, p_phone,
      p_commercial_email, p_city, p_state, v_user_id
    )
    RETURNING id INTO v_company_id;

    RETURN QUERY SELECT v_company_id, true, 'Empresa criada com sucesso'::TEXT;

  EXCEPTION
    WHEN unique_violation THEN
      RETURN QUERY SELECT null::UUID, false, 'CNPJ já cadastrado'::TEXT;
    WHEN check_violation THEN
      RETURN QUERY SELECT null::UUID, false, 'Dados inválidos'::TEXT;
    WHEN OTHERS THEN
      RETURN QUERY SELECT null::UUID, false, SQLERRM::TEXT;
  END;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.create_company TO authenticated, anon, service_role;
