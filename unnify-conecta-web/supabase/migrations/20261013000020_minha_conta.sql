-- Minha conta: dados pessoais, avatar, preferências e privacidade (identidade PESSOAL do usuário).
-- Não toca em empresas, escritórios, vínculos, perfil profissional nem em auth.users.

-- 1. Telefone pessoal (somente dígitos, DDD + número)
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS telefone text;
ALTER TABLE public.perfis DROP CONSTRAINT IF EXISTS perfis_telefone;
ALTER TABLE public.perfis ADD CONSTRAINT perfis_telefone CHECK (telefone IS NULL OR telefone ~ '^[0-9]{10,11}$');
ALTER TABLE public.perfis DROP CONSTRAINT IF EXISTS perfis_nome_completo;
ALTER TABLE public.perfis ADD CONSTRAINT perfis_nome_completo CHECK (nome_completo IS NULL OR char_length(nome_completo) <= 120) NOT VALID;

-- 2. O próprio usuário não altera papéis: funcao_global (já protegido), tipo_usuario só é
--    definido uma vez (onboarding) e status não muda por ele mesmo. Admin/serviço seguem iguais.
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
  IF auth.uid() = NEW.id_usuario THEN
    IF OLD.tipo_usuario IS NOT NULL AND NEW.tipo_usuario IS DISTINCT FROM OLD.tipo_usuario THEN
      RAISE EXCEPTION 'O tipo de usuário não pode ser alterado pelo próprio usuário.' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'O status da conta não pode ser alterado pelo próprio usuário.' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.id_usuario IS DISTINCT FROM OLD.id_usuario OR NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Identificadores não podem ser alterados.' USING ERRCODE = 'check_violation';
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

-- 3. Dados pessoais: único caminho de escrita da página (só nome e telefone, só da própria conta)
CREATE OR REPLACE FUNCTION public.atualizar_dados_pessoais(p_nome_completo text, p_telefone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome text := btrim(coalesce(p_nome_completo, ''));
  v_telefone text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_nome) < 3 OR char_length(v_nome) > 120 THEN
    RAISE EXCEPTION 'Informe o nome completo (3 a 120 caracteres).' USING ERRCODE = 'check_violation';
  END IF;
  IF v_telefone IS NOT NULL AND v_telefone !~ '^[0-9]{10,11}$' THEN
    RAISE EXCEPTION 'Telefone inválido. Use DDD + número.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.perfis
     SET nome_completo = v_nome, telefone = v_telefone, atualizado_em = now()
   WHERE id_usuario = auth.uid();
END;
$$;

-- 4. Avatar: bucket privado; cada usuário só mexe na própria pasta <id_usuario>/
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatares', 'avatares', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatar: dono lê" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatares' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Avatar: dono envia" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatares' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Avatar: dono atualiza" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatares' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatares' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Avatar: dono remove" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatares' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE OR REPLACE FUNCTION public.definir_avatar(p_caminho text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;
  IF p_caminho IS NOT NULL AND (
       split_part(p_caminho, '/', 1) <> auth.uid()::text
       OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'avatares' AND name = p_caminho)) THEN
    RAISE EXCEPTION 'Foto inválida.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.perfis SET url_avatar = p_caminho, atualizado_em = now() WHERE id_usuario = auth.uid();
END;
$$;

-- 5. Preferências pessoais (notificações + exibição). Uma linha por usuário.
CREATE TABLE IF NOT EXISTS public.preferencias_usuario (
  id_usuario uuid PRIMARY KEY REFERENCES public.perfis(id_usuario) ON DELETE CASCADE,
  notificacoes jsonb NOT NULL DEFAULT '{}'::jsonb,
  reduzir_animacoes boolean NOT NULL DEFAULT false,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT preferencias_notificacoes_objeto CHECK (jsonb_typeof(notificacoes) = 'object' AND pg_column_size(notificacoes) <= 4096)
);

ALTER TABLE public.preferencias_usuario ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.preferencias_usuario FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.preferencias_usuario TO authenticated;

CREATE POLICY "Preferências: dono lê" ON public.preferencias_usuario FOR SELECT TO authenticated
  USING (id_usuario = auth.uid());
CREATE POLICY "Preferências: dono cria" ON public.preferencias_usuario FOR INSERT TO authenticated
  WITH CHECK (id_usuario = auth.uid());
CREATE POLICY "Preferências: dono altera" ON public.preferencias_usuario FOR UPDATE TO authenticated
  USING (id_usuario = auth.uid()) WITH CHECK (id_usuario = auth.uid());

-- 6. Solicitações de privacidade (exclusão de conta): processadas pela administração.
--    Nada é excluído automaticamente; dados fiscais/contábeis seguem as regras de retenção legal.
CREATE TABLE IF NOT EXISTS public.solicitacoes_privacidade (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario uuid NOT NULL REFERENCES public.perfis(id_usuario) ON DELETE CASCADE,
  tipo text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  motivo text,
  resposta text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  CONSTRAINT solicitacoes_privacidade_tipo CHECK (tipo IN ('exclusao_conta')),
  CONSTRAINT solicitacoes_privacidade_status CHECK (status IN ('pendente', 'em_analise', 'concluida', 'recusada', 'cancelada')),
  CONSTRAINT solicitacoes_privacidade_motivo CHECK (motivo IS NULL OR char_length(motivo) <= 1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS solicitacoes_privacidade_uma_aberta
  ON public.solicitacoes_privacidade (id_usuario, tipo) WHERE status IN ('pendente', 'em_analise');

ALTER TABLE public.solicitacoes_privacidade ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.solicitacoes_privacidade FROM anon, authenticated;
GRANT SELECT ON public.solicitacoes_privacidade TO authenticated;

CREATE POLICY "Solicitações: dono e admins leem" ON public.solicitacoes_privacidade FOR SELECT TO authenticated
  USING (id_usuario = auth.uid() OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.solicitar_exclusao_conta(p_motivo text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.solicitacoes_privacidade (id_usuario, tipo, motivo)
  VALUES (auth.uid(), 'exclusao_conta', nullif(left(btrim(coalesce(p_motivo, '')), 1000), ''))
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Você já tem uma solicitação de exclusão em andamento.' USING ERRCODE = 'unique_violation';
END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_solicitacao_privacidade(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.solicitacoes_privacidade
     SET status = 'cancelada', atualizado_em = now(), concluido_em = now()
   WHERE id = p_id AND id_usuario = auth.uid() AND status = 'pendente';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada ou já em análise.' USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- 7. Exportação imediata dos PRÓPRIOS dados pessoais (sem dados de terceiros nem documentos)
CREATE OR REPLACE FUNCTION public.exportar_meus_dados()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'gerado_em', now(),
    'conta', (SELECT jsonb_build_object('email', u.email, 'criado_em', u.created_at, 'ultimo_acesso', u.last_sign_in_at,
                                        'email_confirmado_em', u.email_confirmed_at)
                FROM auth.users u WHERE u.id = v_uid),
    'perfil', (SELECT jsonb_build_object('nome_completo', p.nome_completo, 'email', p.email, 'telefone', p.telefone,
                                         'tipo_usuario', p.tipo_usuario, 'funcao_global', p.funcao_global, 'status', p.status,
                                         'criado_em', p.criado_em)
                 FROM public.perfis p WHERE p.id_usuario = v_uid),
    'preferencias', (SELECT to_jsonb(pr) - 'id_usuario' FROM public.preferencias_usuario pr WHERE pr.id_usuario = v_uid),
    'empresas_vinculadas', coalesce((SELECT jsonb_agg(jsonb_build_object('empresa', coalesce(e.nome_comercial, e.razao_social),
                                                                         'papel', ue.tipo_vinculacao, 'ativo', ue.ativo))
                                       FROM public.usuarios_empresas ue JOIN public.empresas e ON e.id = ue.id_empresa
                                      WHERE ue.id_usuario = v_uid), '[]'::jsonb),
    'perfil_profissional', (SELECT to_jsonb(pp) - 'id' - 'id_usuario' - 'id_escritorio'
                              FROM public.perfis_profissionais pp WHERE pp.id_usuario = v_uid),
    'solicitacoes_privacidade', coalesce((SELECT jsonb_agg(jsonb_build_object('tipo', s.tipo, 'status', s.status, 'criado_em', s.criado_em))
                                            FROM public.solicitacoes_privacidade s WHERE s.id_usuario = v_uid), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_dados_pessoais(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.definir_avatar(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.solicitar_exclusao_conta(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancelar_solicitacao_privacidade(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.exportar_meus_dados() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_dados_pessoais(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.definir_avatar(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.solicitar_exclusao_conta(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_solicitacao_privacidade(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exportar_meus_dados() TO authenticated;
