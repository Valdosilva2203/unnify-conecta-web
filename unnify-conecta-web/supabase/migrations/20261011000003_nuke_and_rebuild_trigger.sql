-- NUCLEAR OPTION: Completely rebuild the trigger from scratch
-- Drop EVERYTHING related to the old trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Verify perfis table structure
-- SELECT * FROM information_schema.columns WHERE table_name = 'perfis';

-- Create a simple, bulletproof function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_funcao_global public.funcao_global;
BEGIN
  -- Set role to user by default
  v_funcao_global := 'user'::public.funcao_global;

  -- Insert into perfis
  INSERT INTO public.perfis (
    id_usuario,
    email,
    nome_completo,
    funcao_global,
    status,
    criado_em,
    atualizado_em
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.email),
    v_funcao_global,
    'active',
    NOW(),
    NOW()
  )
  ON CONFLICT (id_usuario) DO UPDATE SET
    email = EXCLUDED.email,
    nome_completo = EXCLUDED.nome_completo,
    atualizado_em = NOW()
  WHERE perfis.id_usuario = NEW.id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log but don't fail - allow signup to continue
  RAISE LOG 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Ensure permissions are correct
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT INSERT ON public.perfis TO service_role;
GRANT UPDATE ON public.perfis TO service_role;
