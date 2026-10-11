-- Padronização PT-BR de tabelas/colunas/índices/restrições/gatilhos
-- e status_registro = 'ATIVA' ao concluir o cadastro.

-- 1. Gatilho de novo usuário sem a tabela de depuração
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.perfis (id_usuario, email, nome_completo, funcao_global, status, criado_em, atualizado_em)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.email),
    'user',
    'active',
    NOW(),
    NOW()
  )
  ON CONFLICT (id_usuario) DO UPDATE SET
    email = EXCLUDED.email,
    nome_completo = EXCLUDED.nome_completo,
    atualizado_em = NOW();
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() RENAME TO tratar_novo_usuario;
ALTER FUNCTION public.prevent_privilege_escalation() RENAME TO impedir_escalada_privilegio;
ALTER TRIGGER enforce_privilege_immutability ON public.perfis RENAME TO impedir_alteracao_funcao;

DROP TABLE public.trigger_debug;

-- 2. empresas
ALTER TABLE public.empresas RENAME COLUMN city TO cidade;
ALTER TABLE public.empresas RENAME COLUMN state TO estado;
ALTER TABLE public.empresas RENAME CONSTRAINT companies_pkey TO empresas_pkey;
ALTER TABLE public.empresas RENAME CONSTRAINT companies_cnpj_key TO empresas_cnpj_key;
ALTER TABLE public.empresas RENAME CONSTRAINT companies_created_by_fkey TO empresas_criado_por_fkey;
ALTER TABLE public.empresas RENAME CONSTRAINT valid_cnpj TO empresas_cnpj_valido;
ALTER TABLE public.empresas RENAME CONSTRAINT valid_email TO empresas_email_valido;
ALTER TABLE public.empresas RENAME CONSTRAINT valid_state TO empresas_estado_valido;
ALTER INDEX public.idx_companies_created_by RENAME TO idx_empresas_criado_por;
ALTER INDEX public.idx_companies_cnpj RENAME TO idx_empresas_cnpj;
ALTER INDEX public.idx_companies_created_at RENAME TO idx_empresas_criado_em;

UPDATE public.empresas SET status_registro = 'ATIVA' WHERE status_registro IS NULL;
ALTER TABLE public.empresas ALTER COLUMN status_registro SET DEFAULT 'ATIVA';
ALTER TABLE public.empresas
  ADD CONSTRAINT empresas_status_registro_valido
  CHECK (status_registro IN ('ATIVA', 'PENDENTE', 'SUSPENSA'));

-- 3. escritorios_contabeis
ALTER TABLE public.escritorios_contabeis RENAME COLUMN city TO cidade;
ALTER TABLE public.escritorios_contabeis RENAME COLUMN state TO estado;
ALTER TABLE public.escritorios_contabeis RENAME CONSTRAINT accounting_offices_pkey TO escritorios_contabeis_pkey;
ALTER TABLE public.escritorios_contabeis RENAME CONSTRAINT accounting_offices_cnpj_key TO escritorios_contabeis_cnpj_key;
ALTER TABLE public.escritorios_contabeis RENAME CONSTRAINT accounting_offices_created_by_fkey TO escritorios_contabeis_criado_por_fkey;
ALTER TABLE public.escritorios_contabeis RENAME CONSTRAINT valid_cnpj TO escritorios_contabeis_cnpj_valido;
ALTER TABLE public.escritorios_contabeis RENAME CONSTRAINT valid_email TO escritorios_contabeis_email_valido;
ALTER TABLE public.escritorios_contabeis RENAME CONSTRAINT valid_state TO escritorios_contabeis_estado_valido;
ALTER INDEX public.idx_accounting_offices_created_by RENAME TO idx_escritorios_contabeis_criado_por;

-- 4. membros_escritorio (tabela vazia)
ALTER TABLE public.membros_escritorio DROP CONSTRAINT valid_role;
ALTER TABLE public.membros_escritorio RENAME COLUMN role TO funcao;
ALTER TABLE public.membros_escritorio ALTER COLUMN funcao SET DEFAULT 'membro';
ALTER TABLE public.membros_escritorio
  ADD CONSTRAINT membros_escritorio_funcao_valida
  CHECK (funcao IN ('dono', 'membro', 'visualizador'));
ALTER TABLE public.membros_escritorio RENAME CONSTRAINT user_accounting_office_memberships_pkey TO membros_escritorio_pkey;
ALTER TABLE public.membros_escritorio RENAME CONSTRAINT unique_user_office_membership TO membros_escritorio_usuario_escritorio_unico;
ALTER TABLE public.membros_escritorio RENAME CONSTRAINT user_accounting_office_memberships_accounting_office_id_fkey TO membros_escritorio_id_escritorio_fkey;
ALTER TABLE public.membros_escritorio RENAME CONSTRAINT user_accounting_office_memberships_user_id_fkey TO membros_escritorio_id_usuario_fkey;
ALTER INDEX public.idx_user_accounting_office_memberships_user_id RENAME TO idx_membros_escritorio_id_usuario;
ALTER INDEX public.idx_user_accounting_office_memberships_accounting_office_id RENAME TO idx_membros_escritorio_id_escritorio;

-- 5. audit_logs -> auditoria (tabela vazia)
ALTER TABLE public.audit_logs RENAME TO auditoria;
ALTER TABLE public.auditoria RENAME COLUMN user_id TO id_usuario;
ALTER TABLE public.auditoria RENAME COLUMN action TO acao;
ALTER TABLE public.auditoria RENAME COLUMN table_name TO nome_tabela;
ALTER TABLE public.auditoria RENAME COLUMN record_id TO id_registro;
ALTER TABLE public.auditoria RENAME COLUMN old_values TO valores_antigos;
ALTER TABLE public.auditoria RENAME COLUMN new_values TO valores_novos;
ALTER TABLE public.auditoria RENAME COLUMN "timestamp" TO criado_em;
ALTER TABLE public.auditoria RENAME CONSTRAINT audit_logs_pkey TO auditoria_pkey;
ALTER TABLE public.auditoria RENAME CONSTRAINT audit_logs_user_id_fkey TO auditoria_id_usuario_fkey;
ALTER INDEX public.idx_audit_user RENAME TO idx_auditoria_id_usuario;
ALTER INDEX public.idx_audit_table RENAME TO idx_auditoria_nome_tabela;

-- 6. perfis
ALTER TABLE public.perfis RENAME CONSTRAINT profiles_pkey TO perfis_pkey;
ALTER TABLE public.perfis RENAME CONSTRAINT profiles_user_id_key TO perfis_id_usuario_key;
ALTER TABLE public.perfis RENAME CONSTRAINT profiles_global_role_check TO perfis_funcao_global_check;
ALTER TABLE public.perfis RENAME CONSTRAINT profiles_status_check TO perfis_status_check;
ALTER INDEX public.idx_profiles_global_role RENAME TO idx_perfis_funcao_global;
ALTER INDEX public.idx_profiles_mfa_enabled RENAME TO idx_perfis_autenticacao_dupla;
ALTER INDEX public.idx_profiles_status RENAME TO idx_perfis_status;

-- 7. Função de cadastro em PT-BR; o cadastro concluído já nasce ATIVA
DROP FUNCTION public.create_company(text, text, text, text, text, text, character varying);
DROP FUNCTION public.create_company(text, text, text, text, text, text, text, text);
DROP FUNCTION public.create_accounting_office_with_owner_membership(text, text, text, text, text, text, character varying);

CREATE FUNCTION public.criar_empresa(
  p_cnpj text,
  p_razao_social text,
  p_telefone text,
  p_email_comercial text,
  p_cidade text,
  p_estado text,
  p_tipo_empresa text DEFAULT 'comum',
  p_nome_comercial text DEFAULT NULL
)
RETURNS TABLE(id uuid, sucesso boolean, mensagem text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

    RETURN QUERY SELECT v_id_empresa, true, 'Empresa criada com sucesso'::text;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN QUERY SELECT null::uuid, false, 'CNPJ já cadastrado'::text;
    WHEN OTHERS THEN
      RETURN QUERY SELECT null::uuid, false, SQLERRM::text;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_empresa(text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_empresa(text, text, text, text, text, text, text, text) TO authenticated;
