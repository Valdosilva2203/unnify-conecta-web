-- Relacionamento N:N entre empresas e contadores/escritórios.
-- Regras: ver CLAUDE.md, seção "Relacionamento empresas ↔ contadores".

-- 0. usuarios_empresas: qualquer usuário conseguia se inserir como dono de qualquer empresa.
--    A escrita passa a ser só por funções do servidor (criar_empresa etc.).
DROP POLICY IF EXISTS "Users can insert their own relationships" ON public.usuarios_empresas;
DROP POLICY IF EXISTS "Users can update their own relationships" ON public.usuarios_empresas;

-- 1. Funções auxiliares
CREATE OR REPLACE FUNCTION public.e_gestor_empresa(p_id_empresa uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios_empresas
     WHERE id_usuario = auth.uid()
       AND id_empresa = p_id_empresa
       AND ativo
       AND tipo_vinculacao IN ('dono', 'socio')
  );
$$;

-- 2. Tabela associativa
CREATE TABLE public.vinculos_contabeis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  id_contador uuid REFERENCES public.perfis(id_usuario) ON DELETE CASCADE,
  id_escritorio uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  funcao text NOT NULL DEFAULT 'principal',
  status text NOT NULL DEFAULT 'pendente',
  permissoes text[] NOT NULL DEFAULT '{}',
  origem text NOT NULL,
  solicitado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  aprovado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  encerrado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  motivo_encerramento text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  aprovado_em timestamptz,
  encerrado_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vinculos_contabeis_funcao_valida
    CHECK (funcao IN ('principal', 'fiscal', 'folha_pagamento', 'consultoria', 'auxiliar')),
  CONSTRAINT vinculos_contabeis_status_valido
    CHECK (status IN ('pendente', 'ativo', 'recusado', 'encerrado')),
  CONSTRAINT vinculos_contabeis_origem_valida
    CHECK (origem IN ('empresa', 'contador', 'escritorio')),
  CONSTRAINT vinculos_contabeis_permissoes_validas
    CHECK (permissoes <@ ARRAY['ver_dados_cadastrais', 'ver_documentos', 'enviar_documentos',
                              'ver_financeiro', 'gerenciar_obrigacoes', 'ver_folha']::text[]),
  CONSTRAINT vinculos_contabeis_alvo_definido
    CHECK (id_contador IS NOT NULL OR id_escritorio IS NOT NULL),
  CONSTRAINT vinculos_contabeis_ativo_completo
    CHECK (status <> 'ativo' OR (id_contador IS NOT NULL AND aprovado_em IS NOT NULL)),
  CONSTRAINT vinculos_contabeis_fechado_datado
    CHECK (status NOT IN ('recusado', 'encerrado') OR encerrado_em IS NOT NULL),
  CONSTRAINT vinculos_contabeis_escritorio_diferente
    CHECK (id_escritorio IS NULL OR id_escritorio <> id_empresa),
  CONSTRAINT vinculos_contabeis_motivo_tamanho
    CHECK (motivo_encerramento IS NULL OR char_length(motivo_encerramento) <= 500)
);

-- Só um responsável principal ativo por empresa (garantido pelo banco, inclusive em concorrência)
CREATE UNIQUE INDEX vinculos_contabeis_um_principal_ativo
  ON public.vinculos_contabeis (id_empresa)
  WHERE funcao = 'principal' AND status = 'ativo';

-- Sem duplicidade de vínculo pendente/ativo para a mesma relação
CREATE UNIQUE INDEX vinculos_contabeis_sem_duplicidade_contador
  ON public.vinculos_contabeis (id_empresa, id_contador)
  WHERE id_contador IS NOT NULL AND status IN ('pendente', 'ativo');
CREATE UNIQUE INDEX vinculos_contabeis_sem_duplicidade_escritorio
  ON public.vinculos_contabeis (id_empresa, id_escritorio)
  WHERE id_contador IS NULL AND status = 'pendente';

CREATE INDEX idx_vinculos_contabeis_empresa ON public.vinculos_contabeis (id_empresa, status);
CREATE INDEX idx_vinculos_contabeis_contador ON public.vinculos_contabeis (id_contador, status);
CREATE INDEX idx_vinculos_contabeis_escritorio ON public.vinculos_contabeis (id_escritorio, status)
  WHERE id_escritorio IS NOT NULL;

-- 3. Histórico
CREATE TABLE public.historico_vinculos_contabeis (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_vinculo uuid NOT NULL REFERENCES public.vinculos_contabeis(id) ON DELETE CASCADE,
  acao text NOT NULL,
  status_anterior text,
  status_novo text,
  funcao_anterior text,
  funcao_nova text,
  permissoes_anteriores text[],
  permissoes_novas text[],
  id_contador uuid,
  alterado_por uuid,
  alterado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_historico_vinculos_vinculo ON public.historico_vinculos_contabeis (id_vinculo, alterado_em);

-- 4. Validação de integridade (tipos e participação no escritório)
CREATE OR REPLACE FUNCTION public.validar_vinculo_contabil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id_empresa <> OLD.id_empresa
       OR NEW.origem <> OLD.origem
       OR NEW.criado_em <> OLD.criado_em
       OR NEW.id_escritorio IS DISTINCT FROM OLD.id_escritorio
       OR (OLD.id_contador IS NOT NULL AND NEW.id_contador IS DISTINCT FROM OLD.id_contador) THEN
      RAISE EXCEPTION 'Os participantes do vínculo não podem ser alterados.' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status IN ('recusado', 'encerrado') AND NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'Vínculo encerrado não pode ser reaberto. Solicite um novo vínculo.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.atualizado_em := now();
  END IF;

  IF NEW.status IN ('pendente', 'ativo')
     AND (TG_OP = 'INSERT' OR NEW.status <> OLD.status OR NEW.id_contador IS DISTINCT FROM OLD.id_contador) THEN
    IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = NEW.id_empresa AND tipo_empresa = 'comum') THEN
      RAISE EXCEPTION 'A empresa informada não é válida.' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.id_escritorio IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = NEW.id_escritorio AND tipo_empresa = 'escritorio_contabil') THEN
      RAISE EXCEPTION 'O escritório informado não é válido.' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.id_contador IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.perfis
                      WHERE id_usuario = NEW.id_contador AND tipo_usuario = 'contador' AND status = 'active') THEN
        RAISE EXCEPTION 'O contador informado não é válido.' USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.id_escritorio IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.usuarios_empresas
                          WHERE id_usuario = NEW.id_contador AND id_empresa = NEW.id_escritorio AND ativo) THEN
        RAISE EXCEPTION 'O contador não é membro deste escritório.' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validar_vinculo_contabil
  BEFORE INSERT OR UPDATE ON public.vinculos_contabeis
  FOR EACH ROW EXECUTE FUNCTION public.validar_vinculo_contabil();

CREATE OR REPLACE FUNCTION public.registrar_historico_vinculo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.historico_vinculos_contabeis
      (id_vinculo, acao, status_novo, funcao_nova, permissoes_novas, id_contador, alterado_por)
    VALUES (NEW.id, 'solicitado', NEW.status, NEW.funcao, NEW.permissoes, NEW.id_contador, auth.uid());
  ELSIF NEW.status IS DISTINCT FROM OLD.status
        OR NEW.funcao IS DISTINCT FROM OLD.funcao
        OR NEW.permissoes IS DISTINCT FROM OLD.permissoes
        OR NEW.id_contador IS DISTINCT FROM OLD.id_contador THEN
    INSERT INTO public.historico_vinculos_contabeis
      (id_vinculo, acao, status_anterior, status_novo, funcao_anterior, funcao_nova,
       permissoes_anteriores, permissoes_novas, id_contador, alterado_por)
    VALUES (NEW.id,
            CASE WHEN NEW.status <> OLD.status THEN NEW.status ELSE 'alterado' END,
            OLD.status, NEW.status, OLD.funcao, NEW.funcao, OLD.permissoes, NEW.permissoes,
            NEW.id_contador, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER registrar_historico_vinculo
  AFTER INSERT OR UPDATE ON public.vinculos_contabeis
  FOR EACH ROW EXECUTE FUNCTION public.registrar_historico_vinculo();

-- 5. RLS: leitura só pelas partes e admins; escrita só pelas funções abaixo
ALTER TABLE public.vinculos_contabeis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_vinculos_contabeis ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vinculos_contabeis, public.historico_vinculos_contabeis FROM anon, authenticated;
GRANT SELECT ON public.vinculos_contabeis, public.historico_vinculos_contabeis TO authenticated;

CREATE POLICY "Partes e admins veem vinculos"
  ON public.vinculos_contabeis FOR SELECT TO authenticated
  USING (
    id_contador = auth.uid()
    OR public.e_gestor_empresa(id_empresa)
    OR (id_escritorio IS NOT NULL AND public.e_gestor_empresa(id_escritorio))
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Partes e admins veem historico"
  ON public.historico_vinculos_contabeis FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vinculos_contabeis v WHERE v.id = id_vinculo));

-- 6. Acesso do contador às empresas atendidas
CREATE OR REPLACE FUNCTION public.empresas_atendidas_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id_empresa FROM public.vinculos_contabeis WHERE id_contador = auth.uid() AND status = 'ativo';
$$;

CREATE POLICY "Contadores veem empresas atendidas"
  ON public.empresas FOR SELECT TO authenticated
  USING (id IN (SELECT public.empresas_atendidas_ids()));

CREATE OR REPLACE FUNCTION public.contador_pode(p_id_empresa uuid, p_permissao text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vinculos_contabeis
     WHERE id_empresa = p_id_empresa
       AND id_contador = auth.uid()
       AND status = 'ativo'
       AND p_permissao = ANY (permissoes)
  );
$$;

-- 7. Operações (únicas portas de escrita)
CREATE OR REPLACE FUNCTION public.solicitar_vinculo_contabil(
  p_id_empresa uuid,
  p_id_contador uuid DEFAULT NULL,
  p_id_escritorio uuid DEFAULT NULL,
  p_funcao text DEFAULT 'principal',
  p_permissoes text[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_origem text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '28000';
  END IF;

  IF public.e_gestor_empresa(p_id_empresa) THEN
    v_origem := 'empresa';
  ELSIF p_id_contador = v_uid THEN
    v_origem := 'contador';
  ELSIF p_id_escritorio IS NOT NULL AND public.e_gestor_empresa(p_id_escritorio) THEN
    v_origem := 'escritorio';
  ELSE
    RAISE EXCEPTION 'Você não tem permissão para solicitar este vínculo.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.vinculos_contabeis
    (id_empresa, id_contador, id_escritorio, funcao, permissoes, origem, solicitado_por)
  VALUES (
    p_id_empresa, p_id_contador, p_id_escritorio, p_funcao,
    COALESCE(p_permissoes,
      CASE WHEN p_funcao = 'principal'
        THEN ARRAY['ver_dados_cadastrais', 'ver_documentos', 'enviar_documentos',
                   'ver_financeiro', 'gerenciar_obrigacoes', 'ver_folha']
        ELSE ARRAY['ver_dados_cadastrais', 'ver_documentos']
      END),
    v_origem, v_uid
  )
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe um vínculo pendente ou ativo para esta relação.' USING ERRCODE = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION public.responder_vinculo_contabil(
  p_id_vinculo uuid,
  p_aceitar boolean,
  p_id_contador uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v public.vinculos_contabeis%ROWTYPE;
  v_pode boolean;
  v_contador uuid;
BEGIN
  SELECT * INTO v FROM public.vinculos_contabeis WHERE id = p_id_vinculo FOR UPDATE;
  IF NOT FOUND OR v_uid IS NULL THEN
    RAISE EXCEPTION 'Vínculo não encontrado.' USING ERRCODE = '42501';
  END IF;

  IF v.origem = 'empresa' THEN
    v_pode := v.id_contador = v_uid
              OR (v.id_escritorio IS NOT NULL AND public.e_gestor_empresa(v.id_escritorio));
  ELSE
    v_pode := public.e_gestor_empresa(v.id_empresa);
  END IF;
  IF NOT COALESCE(v_pode, false) THEN
    RAISE EXCEPTION 'Você não tem permissão para responder a este vínculo.' USING ERRCODE = '42501';
  END IF;

  IF v.status <> 'pendente' THEN
    RAISE EXCEPTION 'Este vínculo não está mais pendente.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_aceitar THEN
    IF v.id_contador IS NOT NULL AND p_id_contador IS NOT NULL AND p_id_contador <> v.id_contador THEN
      RAISE EXCEPTION 'O contador deste vínculo já foi definido.' USING ERRCODE = 'check_violation';
    END IF;
    v_contador := COALESCE(v.id_contador, p_id_contador);
    IF v_contador IS NULL THEN
      RAISE EXCEPTION 'Informe qual contador do escritório será o responsável.' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.vinculos_contabeis
       SET status = 'ativo', id_contador = v_contador, aprovado_em = now(), aprovado_por = v_uid
     WHERE id = p_id_vinculo;
  ELSE
    UPDATE public.vinculos_contabeis
       SET status = 'recusado', encerrado_em = now(), encerrado_por = v_uid
     WHERE id = p_id_vinculo;
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM LIKE '%um_principal_ativo%' THEN
      RAISE EXCEPTION 'A empresa já possui um contador principal ativo. Encerre o atual ou altere a função deste vínculo.' USING ERRCODE = '23505';
    END IF;
    RAISE EXCEPTION 'Já existe um vínculo pendente ou ativo para esta relação.' USING ERRCODE = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION public.alterar_vinculo_contabil(
  p_id_vinculo uuid,
  p_funcao text DEFAULT NULL,
  p_permissoes text[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.vinculos_contabeis%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.vinculos_contabeis WHERE id = p_id_vinculo FOR UPDATE;
  IF NOT FOUND OR NOT public.e_gestor_empresa(v.id_empresa) THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar este vínculo.' USING ERRCODE = '42501';
  END IF;
  IF v.status NOT IN ('pendente', 'ativo') THEN
    RAISE EXCEPTION 'Vínculo encerrado não pode ser alterado.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.vinculos_contabeis
     SET funcao = COALESCE(p_funcao, funcao),
         permissoes = COALESCE(p_permissoes, permissoes)
   WHERE id = p_id_vinculo;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A empresa já possui um contador principal ativo. Encerre o atual antes de definir outro.' USING ERRCODE = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION public.encerrar_vinculo_contabil(p_id_vinculo uuid, p_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v public.vinculos_contabeis%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.vinculos_contabeis WHERE id = p_id_vinculo FOR UPDATE;
  IF NOT FOUND OR v_uid IS NULL OR NOT (
       public.e_gestor_empresa(v.id_empresa)
       OR v.id_contador = v_uid
       OR (v.id_escritorio IS NOT NULL AND public.e_gestor_empresa(v.id_escritorio))
     ) THEN
    RAISE EXCEPTION 'Você não tem permissão para encerrar este vínculo.' USING ERRCODE = '42501';
  END IF;
  IF v.status NOT IN ('pendente', 'ativo') THEN
    RAISE EXCEPTION 'Este vínculo já está encerrado.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.vinculos_contabeis
     SET status = 'encerrado', encerrado_em = now(), encerrado_por = v_uid,
         motivo_encerramento = NULLIF(left(btrim(COALESCE(p_motivo, '')), 500), '')
   WHERE id = p_id_vinculo;
END;
$$;

-- 8. Consultas bidirecionais (paginadas)
CREATE OR REPLACE FUNCTION public.vinculos_da_empresa(p_id_empresa uuid, p_status text DEFAULT NULL)
RETURNS TABLE (
  id uuid, funcao text, status text, permissoes text[], origem text,
  criado_em timestamptz, aprovado_em timestamptz, encerrado_em timestamptz, motivo_encerramento text,
  id_contador uuid, contador_nome text, contador_email text,
  id_escritorio uuid, escritorio_nome text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.e_gestor_empresa(p_id_empresa) OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Você não tem permissão para ver os contadores desta empresa.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT v.id, v.funcao, v.status, v.permissoes, v.origem,
           v.criado_em, v.aprovado_em, v.encerrado_em, v.motivo_encerramento,
           v.id_contador, p.nome_completo, p.email,
           v.id_escritorio, COALESCE(esc.nome_comercial, esc.razao_social)
      FROM public.vinculos_contabeis v
      LEFT JOIN public.perfis p ON p.id_usuario = v.id_contador
      LEFT JOIN public.empresas esc ON esc.id = v.id_escritorio
     WHERE v.id_empresa = p_id_empresa
       AND (p_status IS NULL OR v.status = p_status)
     ORDER BY (v.status = 'ativo') DESC, (v.funcao = 'principal') DESC, v.criado_em DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.empresas_do_contador(
  p_busca text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limite integer DEFAULT 20,
  p_deslocamento integer DEFAULT 0
)
RETURNS TABLE (
  id_vinculo uuid, id_empresa uuid, razao_social text, nome_comercial text, cnpj text,
  cidade text, estado text, funcao text, status text, permissoes text[], origem text,
  escritorio_nome text, criado_em timestamptz, aprovado_em timestamptz, total bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id, e.id, e.razao_social, e.nome_comercial, e.cnpj, e.cidade, e.estado::text,
         v.funcao, v.status, v.permissoes, v.origem,
         COALESCE(esc.nome_comercial, esc.razao_social), v.criado_em, v.aprovado_em,
         count(*) OVER ()
    FROM public.vinculos_contabeis v
    JOIN public.empresas e ON e.id = v.id_empresa
    LEFT JOIN public.empresas esc ON esc.id = v.id_escritorio
   WHERE v.id_contador = auth.uid()
     AND (p_status IS NULL OR v.status = p_status)
     AND (p_busca IS NULL OR p_busca = ''
          OR e.razao_social ILIKE '%' || p_busca || '%'
          OR e.nome_comercial ILIKE '%' || p_busca || '%'
          OR e.cnpj LIKE '%' || p_busca || '%')
   ORDER BY (v.status = 'pendente') DESC, (v.status = 'ativo') DESC, e.razao_social
   LIMIT LEAST(GREATEST(p_limite, 1), 100) OFFSET GREATEST(p_deslocamento, 0);
$$;

CREATE OR REPLACE FUNCTION public.empresas_do_escritorio(
  p_id_escritorio uuid,
  p_busca text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limite integer DEFAULT 20,
  p_deslocamento integer DEFAULT 0
)
RETURNS TABLE (
  id_vinculo uuid, id_empresa uuid, razao_social text, nome_comercial text, cnpj text,
  cidade text, estado text, funcao text, status text, id_contador uuid, contador_nome text,
  criado_em timestamptz, aprovado_em timestamptz, total bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.e_gestor_empresa(p_id_escritorio) OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Você não tem permissão para ver as empresas deste escritório.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT v.id, e.id, e.razao_social, e.nome_comercial, e.cnpj, e.cidade, e.estado::text,
           v.funcao, v.status, v.id_contador, p.nome_completo, v.criado_em, v.aprovado_em,
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
$$;

CREATE OR REPLACE FUNCTION public.admin_vinculos_contabeis(
  p_id_empresa uuid DEFAULT NULL,
  p_id_contador uuid DEFAULT NULL,
  p_id_escritorio uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limite integer DEFAULT 20,
  p_deslocamento integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, id_empresa uuid, empresa_nome text, id_contador uuid, contador_nome text,
  id_escritorio uuid, escritorio_nome text, funcao text, status text, origem text,
  criado_em timestamptz, aprovado_em timestamptz, encerrado_em timestamptz, total bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
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
$$;

-- 9. Permissões de execução: nada para anônimos
REVOKE ALL ON FUNCTION public.validar_vinculo_contabil() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_historico_vinculo() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.e_gestor_empresa(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.empresas_atendidas_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contador_pode(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.solicitar_vinculo_contabil(uuid, uuid, uuid, text, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.responder_vinculo_contabil(uuid, boolean, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.alterar_vinculo_contabil(uuid, text, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.encerrar_vinculo_contabil(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.vinculos_da_empresa(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.empresas_do_contador(text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.empresas_do_escritorio(uuid, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_vinculos_contabeis(uuid, uuid, uuid, text, integer, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.e_gestor_empresa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.empresas_atendidas_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.contador_pode(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.solicitar_vinculo_contabil(uuid, uuid, uuid, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.responder_vinculo_contabil(uuid, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.alterar_vinculo_contabil(uuid, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.encerrar_vinculo_contabil(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vinculos_da_empresa(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.empresas_do_contador(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.empresas_do_escritorio(uuid, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_vinculos_contabeis(uuid, uuid, uuid, text, integer, integer) TO authenticated;
