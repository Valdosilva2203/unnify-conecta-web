-- Alteração de e-mail de acesso: perfis.email espelha SOMENTE o e-mail confirmado no Supabase Auth.
-- 1. Ninguém grava em perfis.email um valor diferente do e-mail real da conta (antes o próprio
--    usuário podia trocar esse campo pela API e exibir um e-mail falso nos vínculos).
-- 2. Quando o Supabase Auth conclui a troca (após as confirmações), perfis.email é atualizado.
-- Não altera id_usuario, papéis, permissões nem vínculos.

CREATE OR REPLACE FUNCTION public.impedir_escalada_privilegio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.funcao_global IS DISTINCT FROM OLD.funcao_global THEN
    IF NEW.funcao_global IN ('admin', 'admin_master') AND auth.uid() = NEW.id_usuario THEN
      RAISE EXCEPTION 'Users cannot elevate their own privileges';
    END IF;
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email
     AND NEW.email IS DISTINCT FROM (SELECT u.email FROM auth.users u WHERE u.id = NEW.id_usuario) THEN
    RAISE EXCEPTION 'O e-mail do perfil só muda pela alteração confirmada do e-mail de acesso.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sincronizar_email_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.perfis
     SET email = NEW.email, atualizado_em = now()
   WHERE id_usuario = NEW.id AND email IS DISTINCT FROM NEW.email;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca impedir a confirmação no Auth; a divergência fica registrada no log do banco.
  RAISE WARNING 'sincronizar_email_perfil falhou para %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sincronizar_email_perfil() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (NEW.email IS DISTINCT FROM OLD.email)
  EXECUTE FUNCTION public.sincronizar_email_perfil();
