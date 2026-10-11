-- MIGRATION: Fix handle_new_user() - Use correct column name
-- Date: 2026-10-07
-- Problem: Function was using 'user_metadata' which doesn't exist
-- Reality: Actual column is 'raw_user_meta_data' (JSONB)
-- Impact: This was causing HTTP 500 on signup

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  RAISE LOG 'handle_new_user: Creating profile for id_usuario=%, email=%', NEW.id, NEW.email;

  INSERT INTO public.perfis (id_usuario, funcao_global, nome_completo, email, status)
  VALUES (
    NEW.id,
    'user',
    COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.email),
    NEW.email,
    'active'
  )
  ON CONFLICT (id_usuario) DO NOTHING;

  RAISE LOG 'handle_new_user: Profile created successfully for id_usuario=%', NEW.id;

  RETURN NEW;

EXCEPTION WHEN unique_violation THEN
  RAISE LOG 'handle_new_user: Unique violation for id_usuario=% (expected due to ON CONFLICT)', NEW.id;
  RETURN NEW;
WHEN OTHERS THEN
  RAISE LOG 'handle_new_user: ERROR for id_usuario=%, email=%, error=%', NEW.id, NEW.email, SQLERRM;
  RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';
