-- Fix trigger to execute as service_role explicitly
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET role = 'service_role'
AS $$
DECLARE
  v_funcao_global public.funcao_global;
BEGIN
  v_funcao_global := 'user'::public.funcao_global;

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
  RAISE LOG 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
