-- Add tipo_usuario enum type and column to perfis table
-- This tracks whether a user is 'empresa' (company owner) or 'contador' (accountant)

CREATE TYPE public.tipo_usuario_enum AS ENUM ('empresa', 'contador');

ALTER TABLE public.perfis
ADD COLUMN tipo_usuario public.tipo_usuario_enum DEFAULT NULL;

-- Create function to update user type when onboarding completes
CREATE OR REPLACE FUNCTION public.update_tipo_usuario(
  p_tipo_usuario TEXT
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, 'Usuário não autenticado'::TEXT;
    RETURN;
  END IF;

  -- Validate tipo_usuario
  IF p_tipo_usuario NOT IN ('empresa', 'contador') THEN
    RETURN QUERY SELECT false, 'Tipo de usuário inválido'::TEXT;
    RETURN;
  END IF;

  -- Update user type
  UPDATE public.perfis
  SET tipo_usuario = p_tipo_usuario::public.tipo_usuario_enum,
      atualizado_em = NOW()
  WHERE id_usuario = v_user_id;

  IF FOUND THEN
    RETURN QUERY SELECT true, 'Tipo de usuário atualizado com sucesso'::TEXT;
  ELSE
    RETURN QUERY SELECT false, 'Usuário não encontrado'::TEXT;
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, SQLERRM::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_tipo_usuario(TEXT)
TO authenticated, anon, service_role;
