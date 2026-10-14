-- E0 — correções de segurança S1 (tipo de usuário), S2 (empresas) e S4 (privilégios do papel admin).
-- Gerado a partir das definições reais do banco em 13/10/2026 (scratchpad/gerar-e0.mjs).

-- Compatível com o código atualmente publicado: a rota antiga de tipo continua funcionando até o deploy (sem quebra).
-- ORDEM DE PUBLICAÇÃO: aplicar esta migration ANTES do deploy do código que remove /api/auth/update-tipo-usuario.
-- Reversão: supabase/migrations/rollback/20261013000029_seguranca_e0_reverter.sql

-- Pré-checagens: aborta se o banco não estiver no estado esperado
DO $$
BEGIN
  IF to_regprocedure('public.criar_empresa(text,text,text,text,text,text,text,text)') IS NULL
     OR to_regprocedure('public.is_admin_master(uuid)') IS NULL
     OR to_regprocedure('public.e_gestor_empresa(uuid)') IS NULL
     OR to_regclass('public.auditoria') IS NULL THEN
    RAISE EXCEPTION 'E0: objetos esperados não encontrados; nada foi alterado.';
  END IF;
END;
$$;

-- ===== S1 — tipo de usuário definido só no banco, uma única vez =====
CREATE OR REPLACE FUNCTION public.impedir_escalada_privilegio()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.funcao_global IS DISTINCT FROM OLD.funcao_global THEN
    IF NEW.funcao_global IN ('admin', 'admin_master') AND auth.uid() = NEW.id_usuario THEN
      RAISE EXCEPTION 'Users cannot elevate their own privileges';
    END IF;
  END IF;
  IF auth.uid() = NEW.id_usuario THEN
    -- E0/S1: o próprio usuário nunca escolhe/troca o tipo; só criar_empresa define (NULL -> tipo) pela flag interna
    IF NEW.tipo_usuario IS DISTINCT FROM OLD.tipo_usuario
       AND NOT (OLD.tipo_usuario IS NULL AND current_setting('unnify.definindo_tipo_usuario', true) = 'sim') THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.criar_empresa(p_cnpj text, p_razao_social text, p_telefone text, p_email_comercial text, p_cidade text, p_estado text, p_tipo_empresa text DEFAULT 'comum'::text, p_nome_comercial text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, sucesso boolean, mensagem text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id_empresa uuid;
  v_id_usuario uuid;
BEGIN
  v_id_usuario := auth.uid();

  IF v_id_usuario IS NULL THEN
    RETURN QUERY SELECT null::uuid, false, 'Usuário não autenticado'::text;
    RETURN;
  END IF;

  IF p_tipo_empresa NOT IN ('comum', 'escritorio_contabil') THEN
    RETURN QUERY SELECT null::uuid, false, 'Tipo de empresa inválido'::text;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.empresas e WHERE e.cnpj = p_cnpj) THEN
    RETURN QUERY SELECT null::uuid, false, 'CNPJ já cadastrado'::text;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.empresas (
      cnpj, razao_social, nome_comercial, telefone, email_comercial,
      cidade, estado, tipo_empresa, status_registro, criado_por
    ) VALUES (
      p_cnpj, p_razao_social, p_nome_comercial, p_telefone, p_email_comercial,
      p_cidade, p_estado, p_tipo_empresa, 'ATIVA', v_id_usuario
    )
    RETURNING empresas.id INTO v_id_empresa;

    INSERT INTO public.usuarios_empresas (id_usuario, id_empresa, tipo_vinculacao, ativo)
    VALUES (v_id_usuario, v_id_empresa, 'dono', true);

    -- E0/S1: o tipo do usuário é definido aqui (uma única vez), nunca por rota com service_role
    PERFORM set_config('unnify.definindo_tipo_usuario', 'sim', true);
    UPDATE public.perfis
       SET tipo_usuario = (CASE WHEN p_tipo_empresa = 'escritorio_contabil' THEN 'contador' ELSE 'empresa' END)::public.tipo_usuario_enum,
           atualizado_em = now()
     WHERE id_usuario = v_id_usuario AND tipo_usuario IS NULL;
    PERFORM set_config('unnify.definindo_tipo_usuario', '', true);

    RETURN QUERY SELECT v_id_empresa, true, 'Empresa criada com sucesso'::text;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN QUERY SELECT null::uuid, false, 'CNPJ já cadastrado'::text;
    WHEN OTHERS THEN
      RETURN QUERY SELECT null::uuid, false, SQLERRM::text;
  END;
END;
$function$;

-- ===== S2 — empresas =====
-- S2-a: nenhuma escrita direta em empresas pela API (criação só por criar_empresa; edição só por atualizar_dados_empresa)
DROP POLICY IF EXISTS "Users can update own companies" ON public.empresas;
DROP POLICY IF EXISTS "Users can delete own companies" ON public.empresas;
REVOKE ALL ON TABLE public.empresas FROM anon, authenticated;
GRANT SELECT ON TABLE public.empresas TO authenticated;

-- S2-b: defesa em profundidade — identidade e estrutura da empresa não mudam por usuário comum, por nenhum caminho
CREATE OR REPLACE FUNCTION public.proteger_campos_empresa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Sem usuário (service_role/manutenção) segue; com usuário, campos estruturais são imutáveis
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.cnpj IS DISTINCT FROM OLD.cnpj OR NEW.razao_social IS DISTINCT FROM OLD.razao_social
     OR NEW.tipo_empresa IS DISTINCT FROM OLD.tipo_empresa OR NEW.status_registro IS DISTINCT FROM OLD.status_registro
     OR NEW.criado_por IS DISTINCT FROM OLD.criado_por OR NEW.criado_em IS DISTINCT FROM OLD.criado_em THEN
    RAISE EXCEPTION 'CNPJ, razão social, tipo, situação e responsável pelo cadastro não podem ser alterados.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS proteger_campos_empresa ON public.empresas;
CREATE TRIGGER proteger_campos_empresa BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.proteger_campos_empresa();
CREATE OR REPLACE FUNCTION public.impedir_exclusao_empresa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Empresas não podem ser excluídas.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS impedir_exclusao_empresa ON public.empresas;
CREATE TRIGGER impedir_exclusao_empresa BEFORE DELETE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.impedir_exclusao_empresa();

-- S2-c: edição controlada dos dados permitidos (dono/sócio ativo). Contador e admin não editam.
CREATE OR REPLACE FUNCTION public.atualizar_dados_empresa(
  p_id_empresa uuid, p_nome_comercial text, p_telefone text, p_email_comercial text, p_cidade text, p_estado text, p_cnae_principal text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_antes public.empresas;
  v_tel text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_uf text := upper(btrim(coalesce(p_estado, '')));
  v_email text := lower(btrim(coalesce(p_email_comercial, '')));
  v_cnae text := nullif(btrim(coalesce(p_cnae_principal, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.e_gestor_empresa(p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para alterar os dados desta empresa.' USING ERRCODE = '42501';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(v_email) > 254 THEN
    RAISE EXCEPTION 'Informe um e-mail comercial válido.' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(btrim(coalesce(p_cidade, ''))) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION 'Informe a cidade.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_uf NOT IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO') THEN
    RAISE EXCEPTION 'Informe uma UF válida.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_tel IS NOT NULL AND char_length(v_tel) NOT BETWEEN 10 AND 11 THEN
    RAISE EXCEPTION 'Telefone deve ter DDD e 8 ou 9 dígitos.' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(coalesce(p_nome_comercial, '')) > 150 OR (v_cnae IS NOT NULL AND v_cnae !~ '^[0-9./-]{4,12}$') THEN
    RAISE EXCEPTION 'Nome comercial (até 150 caracteres) ou CNAE inválido.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_antes FROM public.empresas WHERE id = p_id_empresa FOR UPDATE;
  UPDATE public.empresas
     SET nome_comercial = nullif(btrim(coalesce(p_nome_comercial, '')), ''), telefone = v_tel, email_comercial = v_email,
         cidade = btrim(p_cidade), estado = v_uf, cnae_principal = v_cnae, atualizado_em = now()
   WHERE id = p_id_empresa;
  INSERT INTO public.auditoria (id_usuario, acao, nome_tabela, id_registro, valores_antigos, valores_novos)
  VALUES (auth.uid(), 'empresa_atualizada', 'empresas', p_id_empresa,
          jsonb_build_object('nome_comercial', v_antes.nome_comercial, 'telefone', v_antes.telefone, 'email_comercial', v_antes.email_comercial,
                             'cidade', v_antes.cidade, 'estado', v_antes.estado, 'cnae_principal', v_antes.cnae_principal),
          jsonb_build_object('nome_comercial', nullif(btrim(coalesce(p_nome_comercial, '')), ''), 'telefone', v_tel, 'email_comercial', v_email,
                             'cidade', btrim(p_cidade), 'estado', v_uf, 'cnae_principal', v_cnae));
END;
$$;
REVOKE ALL ON FUNCTION public.proteger_campos_empresa(), public.impedir_exclusao_empresa() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.atualizar_dados_empresa(uuid, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_dados_empresa(uuid, text, text, text, text, text, text) TO authenticated;

-- ===== S4 — papel admin sem acesso amplo (Admin Master mantém o acesso administrativo; tarefas da plataforma inalteradas) =====
ALTER POLICY "Admins can view all companies" ON public.empresas
  USING ((public.is_admin_master(auth.uid()) OR (criado_por = auth.uid())));

ALTER POLICY "Admin master delete any office" ON public.escritorios_contabeis
  USING (public.is_admin_master(auth.uid()));

ALTER POLICY "Admin master update any office" ON public.escritorios_contabeis
  USING (public.is_admin_master(auth.uid()))
  WITH CHECK (public.is_admin_master(auth.uid()));

ALTER POLICY "Admin master view all offices" ON public.escritorios_contabeis
  USING ((public.is_admin_master(auth.uid()) OR (id IN ( SELECT membros_escritorio.id_escritorio AS accounting_office_id
   FROM membros_escritorio
  WHERE (membros_escritorio.id_usuario = auth.uid())))));

ALTER POLICY "Admin master view all memberships" ON public.membros_escritorio
  USING ((public.is_admin_master(auth.uid()) OR (id_usuario = auth.uid())));

ALTER POLICY "Dono e admins veem o perfil profissional" ON public.perfis_profissionais
  USING (((id_usuario = auth.uid()) OR ((id_escritorio IS NOT NULL) AND e_gestor_empresa(id_escritorio)) OR public.is_admin_master(auth.uid())));

ALTER POLICY "Solicitações: dono e admins leem" ON public.solicitacoes_privacidade
  USING (((id_usuario = auth.uid()) OR public.is_admin_master(auth.uid())));

ALTER POLICY "Admins can view all company relationships" ON public.usuarios_empresas
  USING (public.is_admin_master(auth.uid()));

ALTER POLICY "Partes e admins veem vinculos" ON public.vinculos_contabeis
  USING (((id_contador = auth.uid()) OR e_gestor_empresa(id_empresa) OR ((id_escritorio IS NOT NULL) AND e_gestor_empresa(id_escritorio)) OR public.is_admin_master(auth.uid())));

CREATE OR REPLACE FUNCTION public.admin_vinculos_contabeis(p_id_empresa uuid DEFAULT NULL::uuid, p_id_contador uuid DEFAULT NULL::uuid, p_id_escritorio uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_limite integer DEFAULT 20, p_deslocamento integer DEFAULT 0)
 RETURNS TABLE(id uuid, id_empresa uuid, empresa_nome text, id_contador uuid, contador_nome text, id_escritorio uuid, escritorio_nome text, funcao text, status text, origem text, criado_em timestamp with time zone, aprovado_em timestamp with time zone, encerrado_em timestamp with time zone, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT v.id, v.id_empresa, COALESCE(e.nome_comercial, e.razao_social), v.id_contador, p.nome_completo,
           v.id_escritorio, COALESCE(esc.nome_comercial, esc.razao_social), v.funcao, v.status, v.origem,
           v.criado_em, v.aprovado_em, v.encerrado_em, count(*) OVER ()
      FROM public.vinculos_contabeis v
      JOIN public.empresas e ON e.id = v.id_empresa
      LEFT JOIN public.perfis p ON p.id_usuario = v.id_contador
      LEFT JOIN public.empresas esc ON esc.id = v.id_escritorio
     WHERE (p_id_empresa IS NULL OR v.id_empresa = p_id_empresa)
       AND (p_id_contador IS NULL OR v.id_contador = p_id_contador)
       AND (p_id_escritorio IS NULL OR v.id_escritorio = p_id_escritorio)
       AND (p_status IS NULL OR v.status = p_status)
     ORDER BY v.criado_em DESC
     LIMIT LEAST(GREATEST(p_limite, 1), 100) OFFSET GREATEST(p_deslocamento, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.empresas_do_escritorio(p_id_escritorio uuid, p_busca text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_limite integer DEFAULT 20, p_deslocamento integer DEFAULT 0)
 RETURNS TABLE(id_vinculo uuid, id_empresa uuid, razao_social text, nome_comercial text, cnpj text, cidade text, estado text, funcao text, status text, origem text, id_contador uuid, contador_nome text, criado_em timestamp with time zone, aprovado_em timestamp with time zone, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.e_gestor_empresa(p_id_escritorio) OR public.is_admin_master(auth.uid())) THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.foto_perfil_visivel(p_id_perfil text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.dono_do_perfil_profissional(p_id_perfil)
      OR public.is_admin_master(auth.uid())
      OR EXISTS (
           SELECT 1 FROM public.perfis_profissionais pp
            WHERE pp.id::text = p_id_perfil
              AND public.perfil_no_catalogo(pp.id)
              AND public.pode_ver_catalogo())
      OR EXISTS (
           SELECT 1 FROM public.perfis_profissionais pp
             JOIN public.vinculos_contabeis v
               ON (v.id_contador = pp.id_usuario OR v.id_escritorio = pp.id_escritorio)
            WHERE pp.id::text = p_id_perfil
              AND v.status IN ('pendente', 'ativo')
              AND public.e_gestor_empresa(v.id_empresa));
$function$;

CREATE OR REPLACE FUNCTION public.membros_do_escritorio(p_id_escritorio uuid)
 RETURNS TABLE(id_usuario uuid, nome text, tipo_vinculacao text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.e_gestor_empresa(p_id_escritorio) OR public.is_admin_master(auth.uid())) THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.pode_ver_catalogo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_admin_master(auth.uid()) OR EXISTS (
    SELECT 1
      FROM public.usuarios_empresas ue
      JOIN public.empresas e ON e.id = ue.id_empresa
     WHERE ue.id_usuario = auth.uid()
       AND ue.ativo
       AND ue.tipo_vinculacao IN ('dono', 'socio')
       AND e.tipo_empresa = 'comum'
       AND e.status_registro = 'ATIVA'
  );
$function$;

CREATE OR REPLACE FUNCTION public.vinculos_da_empresa(p_id_empresa uuid, p_status text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, funcao text, status text, permissoes text[], origem text, criado_em timestamp with time zone, aprovado_em timestamp with time zone, encerrado_em timestamp with time zone, motivo_encerramento text, id_contador uuid, contador_nome text, contador_email text, id_escritorio uuid, escritorio_nome text, nome_profissional text, crc text, cidade text, estado text, especialidades text[], foto_caminho text, email_comercial text, telefone_comercial text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.e_gestor_empresa(p_id_empresa) OR public.is_admin_master(auth.uid())) THEN
    RAISE EXCEPTION 'Você não tem permissão para ver os contadores desta empresa.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT v.id, v.funcao, v.status, v.permissoes, v.origem,
           v.criado_em, v.aprovado_em, v.encerrado_em, v.motivo_encerramento,
           v.id_contador, p.nome_completo,
           CASE WHEN v.status = 'ativo' THEN p.email END,
           v.id_escritorio, COALESCE(esc.nome_comercial, esc.razao_social),
           COALESCE(ppc.nome_profissional, ppe.nome_profissional),
           COALESCE(ppc.crc, ppe.crc),
           COALESCE(ppc.cidade, ppe.cidade),
           COALESCE(ppc.estado, ppe.estado)::text,
           COALESCE(ppc.especialidades, ppe.especialidades),
           COALESCE(ppc.foto_caminho, ppe.foto_caminho),
           CASE WHEN v.status = 'ativo' THEN
             COALESCE(CASE WHEN ppc.compartilhar_contatos THEN ppc.email_comercial END,
                      CASE WHEN ppe.compartilhar_contatos THEN ppe.email_comercial END) END,
           CASE WHEN v.status = 'ativo' THEN
             COALESCE(CASE WHEN ppc.compartilhar_contatos THEN ppc.telefone_comercial END,
                      CASE WHEN ppe.compartilhar_contatos THEN ppe.telefone_comercial END) END
      FROM public.vinculos_contabeis v
      LEFT JOIN public.perfis p ON p.id_usuario = v.id_contador
      LEFT JOIN public.empresas esc ON esc.id = v.id_escritorio
      LEFT JOIN public.perfis_profissionais ppc ON ppc.id_usuario = v.id_contador
      LEFT JOIN public.perfis_profissionais ppe ON ppe.id_escritorio = v.id_escritorio
     WHERE v.id_empresa = p_id_empresa
       AND (p_status IS NULL OR v.status = p_status)
     ORDER BY (v.status = 'ativo') DESC, (v.funcao = 'principal') DESC, v.criado_em DESC;
END;
$function$;

-- Pós-checagens: confirma o estado final antes do COMMIT
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND (coalesce(qual, '') || coalesce(with_check, '')) ~ '(^|[^_])is_admin\(') THEN
    RAISE EXCEPTION 'E0: ainda há política usando is_admin.';
  END IF;
  IF has_table_privilege('authenticated', 'public.empresas', 'UPDATE') OR has_table_privilege('authenticated', 'public.empresas', 'DELETE')
     OR has_table_privilege('anon', 'public.empresas', 'SELECT') THEN
    RAISE EXCEPTION 'E0: permissões de empresas não foram restringidas.';
  END IF;
END;
$$;
