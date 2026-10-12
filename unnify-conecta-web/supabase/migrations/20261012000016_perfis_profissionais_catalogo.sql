-- Catálogo de contadores e escritórios: perfil profissional publicável.
-- Regras: ver CLAUDE.md, seção "Catálogo de contadores".

-- 1. Perfil profissional (de um contador OU de um escritório)
CREATE TABLE public.perfis_profissionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario uuid UNIQUE REFERENCES public.perfis(id_usuario) ON DELETE CASCADE,
  id_escritorio uuid UNIQUE REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome_profissional text NOT NULL,
  crc text,
  cidade text,
  estado varchar(2),
  especialidades text[] NOT NULL DEFAULT '{}',
  servicos text[] NOT NULL DEFAULT '{}',
  descricao text,
  modalidade_atendimento text NOT NULL DEFAULT 'online_presencial',
  foto_caminho text,
  email_comercial text,
  telefone_comercial text,
  compartilhar_contatos boolean NOT NULL DEFAULT true,
  publicado boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT perfis_profissionais_um_dono CHECK ((id_usuario IS NULL) <> (id_escritorio IS NULL)),
  CONSTRAINT perfis_profissionais_nome CHECK (char_length(btrim(nome_profissional)) BETWEEN 2 AND 120),
  CONSTRAINT perfis_profissionais_crc CHECK (crc IS NULL OR char_length(crc) BETWEEN 3 AND 30),
  CONSTRAINT perfis_profissionais_cidade CHECK (cidade IS NULL OR char_length(cidade) <= 100),
  CONSTRAINT perfis_profissionais_estado CHECK (
    estado IS NULL OR estado IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
                                 'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  CONSTRAINT perfis_profissionais_descricao CHECK (descricao IS NULL OR char_length(descricao) <= 1500),
  CONSTRAINT perfis_profissionais_modalidade CHECK (modalidade_atendimento IN ('online', 'presencial', 'online_presencial')),
  CONSTRAINT perfis_profissionais_especialidades CHECK (
    especialidades <@ ARRAY['MEI', 'Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'Folha de Pagamento',
                            'Abertura de Empresas', 'Fiscal', 'Contábil', 'Trabalhista', 'BPO Financeiro',
                            'Planejamento Tributário', 'Imposto de Renda']::text[]),
  CONSTRAINT perfis_profissionais_servicos CHECK (
    cardinality(servicos) <= 15 AND char_length(array_to_string(servicos, '')) <= 1200),
  CONSTRAINT perfis_profissionais_email CHECK (
    email_comercial IS NULL OR email_comercial ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  CONSTRAINT perfis_profissionais_telefone CHECK (
    telefone_comercial IS NULL OR telefone_comercial ~ '^[0-9]{10,11}$'),
  CONSTRAINT perfis_profissionais_foto CHECK (foto_caminho IS NULL OR char_length(foto_caminho) <= 300),
  CONSTRAINT perfis_profissionais_publicavel CHECK (
    publicado = false OR (crc IS NOT NULL AND cidade IS NOT NULL AND estado IS NOT NULL))
);

CREATE INDEX idx_perfis_profissionais_publicados
  ON public.perfis_profissionais (estado, cidade) WHERE publicado;
CREATE INDEX idx_perfis_profissionais_especialidades
  ON public.perfis_profissionais USING gin (especialidades) WHERE publicado;

-- 2. Integridade: dono do tipo certo e imutável
CREATE OR REPLACE FUNCTION public.validar_perfil_profissional()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id_usuario IS DISTINCT FROM OLD.id_usuario OR NEW.id_escritorio IS DISTINCT FROM OLD.id_escritorio THEN
      RAISE EXCEPTION 'O dono do perfil não pode ser alterado.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.atualizado_em := now();
  END IF;
  IF NEW.id_usuario IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.perfis WHERE id_usuario = NEW.id_usuario AND tipo_usuario = 'contador') THEN
    RAISE EXCEPTION 'Somente contadores podem ter perfil profissional.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.id_escritorio IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = NEW.id_escritorio AND tipo_empresa = 'escritorio_contabil') THEN
    RAISE EXCEPTION 'O perfil de escritório deve pertencer a um escritório contábil.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.nome_profissional := btrim(NEW.nome_profissional);
  RETURN NEW;
END;
$$;

CREATE TRIGGER validar_perfil_profissional
  BEFORE INSERT OR UPDATE ON public.perfis_profissionais
  FOR EACH ROW EXECUTE FUNCTION public.validar_perfil_profissional();

-- 3. RLS: o dono gerencia; o catálogo só por funções (que omitem contatos)
ALTER TABLE public.perfis_profissionais ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.perfis_profissionais FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.perfis_profissionais TO authenticated;

CREATE POLICY "Dono e admins veem o perfil profissional"
  ON public.perfis_profissionais FOR SELECT TO authenticated
  USING (
    id_usuario = auth.uid()
    OR (id_escritorio IS NOT NULL AND public.e_gestor_empresa(id_escritorio))
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Dono cria o perfil profissional"
  ON public.perfis_profissionais FOR INSERT TO authenticated
  WITH CHECK (
    id_usuario = auth.uid()
    OR (id_escritorio IS NOT NULL AND public.e_gestor_empresa(id_escritorio))
  );

CREATE POLICY "Dono edita o perfil profissional"
  ON public.perfis_profissionais FOR UPDATE TO authenticated
  USING (
    id_usuario = auth.uid()
    OR (id_escritorio IS NOT NULL AND public.e_gestor_empresa(id_escritorio))
  )
  WITH CHECK (
    id_usuario = auth.uid()
    OR (id_escritorio IS NOT NULL AND public.e_gestor_empresa(id_escritorio))
  );

-- 4. Quem pode ver o catálogo: dono/sócio de empresa comum ativa (ou admin)
CREATE OR REPLACE FUNCTION public.pode_ver_catalogo()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin(auth.uid()) OR EXISTS (
    SELECT 1
      FROM public.usuarios_empresas ue
      JOIN public.empresas e ON e.id = ue.id_empresa
     WHERE ue.id_usuario = auth.uid()
       AND ue.ativo
       AND ue.tipo_vinculacao IN ('dono', 'socio')
       AND e.tipo_empresa = 'comum'
       AND e.status_registro = 'ATIVA'
  );
$$;

-- Perfil publicado e com dono ativo/elegível
CREATE OR REPLACE FUNCTION public.perfil_no_catalogo(p_id_perfil uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfis_profissionais pp
     WHERE pp.id = p_id_perfil
       AND pp.publicado
       AND (
         (pp.id_usuario IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.perfis p
             WHERE p.id_usuario = pp.id_usuario AND p.status = 'active' AND p.tipo_usuario = 'contador'))
         OR
         (pp.id_escritorio IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.empresas e
             WHERE e.id = pp.id_escritorio AND e.tipo_empresa = 'escritorio_contabil' AND e.status_registro = 'ATIVA'))
       )
  );
$$;

-- 5. Busca no catálogo (sem e-mail/telefone)
CREATE OR REPLACE FUNCTION public.buscar_catalogo_contadores(
  p_busca text DEFAULT NULL,
  p_estado text DEFAULT NULL,
  p_cidade text DEFAULT NULL,
  p_especialidade text DEFAULT NULL,
  p_modalidade text DEFAULT NULL,
  p_tipo text DEFAULT NULL,
  p_limite integer DEFAULT 12,
  p_deslocamento integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, tipo text, nome_profissional text, crc text, cidade text, estado text,
  especialidades text[], servicos text[], descricao text, modalidade_atendimento text,
  foto_caminho text, total bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.pode_ver_catalogo() THEN
    RAISE EXCEPTION 'O catálogo está disponível para empresas cadastradas e ativas.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT pp.id,
           CASE WHEN pp.id_usuario IS NOT NULL THEN 'contador' ELSE 'escritorio' END,
           pp.nome_profissional, pp.crc, pp.cidade, pp.estado::text, pp.especialidades, pp.servicos,
           left(pp.descricao, 300), pp.modalidade_atendimento, pp.foto_caminho,
           count(*) OVER ()
      FROM public.perfis_profissionais pp
     WHERE public.perfil_no_catalogo(pp.id)
       AND (p_estado IS NULL OR p_estado = '' OR pp.estado = p_estado)
       AND (p_cidade IS NULL OR p_cidade = '' OR pp.cidade ILIKE p_cidade)
       AND (p_especialidade IS NULL OR p_especialidade = '' OR p_especialidade = ANY (pp.especialidades))
       AND (p_modalidade IS NULL OR p_modalidade = ''
            OR pp.modalidade_atendimento = p_modalidade OR pp.modalidade_atendimento = 'online_presencial')
       AND (p_tipo IS NULL OR p_tipo = ''
            OR (p_tipo = 'contador' AND pp.id_usuario IS NOT NULL)
            OR (p_tipo = 'escritorio' AND pp.id_escritorio IS NOT NULL))
       AND (p_busca IS NULL OR p_busca = ''
            OR pp.nome_profissional ILIKE '%' || p_busca || '%'
            OR pp.cidade ILIKE '%' || p_busca || '%'
            OR array_to_string(pp.especialidades, ' ') ILIKE '%' || p_busca || '%'
            OR array_to_string(pp.servicos, ' ') ILIKE '%' || p_busca || '%')
     ORDER BY pp.nome_profissional
     LIMIT LEAST(GREATEST(p_limite, 1), 50) OFFSET GREATEST(p_deslocamento, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.perfil_do_catalogo(p_id_perfil uuid)
RETURNS TABLE (
  id uuid, tipo text, nome_profissional text, crc text, cidade text, estado text,
  especialidades text[], servicos text[], descricao text, modalidade_atendimento text,
  foto_caminho text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.pode_ver_catalogo() THEN
    RAISE EXCEPTION 'O catálogo está disponível para empresas cadastradas e ativas.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT pp.id,
           CASE WHEN pp.id_usuario IS NOT NULL THEN 'contador' ELSE 'escritorio' END,
           pp.nome_profissional, pp.crc, pp.cidade, pp.estado::text, pp.especialidades, pp.servicos,
           pp.descricao, pp.modalidade_atendimento, pp.foto_caminho
      FROM public.perfis_profissionais pp
     WHERE pp.id = p_id_perfil AND public.perfil_no_catalogo(pp.id);
END;
$$;

-- 6. Solicitar vínculo a partir do catálogo (só perfis publicados)
CREATE OR REPLACE FUNCTION public.solicitar_vinculo_pelo_catalogo(
  p_id_empresa uuid,
  p_id_perfil uuid,
  p_funcao text DEFAULT 'principal'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pp public.perfis_profissionais%ROWTYPE;
BEGIN
  IF NOT public.e_gestor_empresa(p_id_empresa) THEN
    RAISE EXCEPTION 'Você não tem permissão para solicitar vínculos para esta empresa.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.perfil_no_catalogo(p_id_perfil) THEN
    RAISE EXCEPTION 'Este perfil não está disponível no catálogo.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO pp FROM public.perfis_profissionais WHERE id = p_id_perfil;
  RETURN public.solicitar_vinculo_contabil(p_id_empresa, pp.id_usuario, pp.id_escritorio, p_funcao, NULL);
END;
$$;

-- 7. vinculos_da_empresa passa a trazer dados do perfil e, só com vínculo ATIVO e
--    compartilhamento autorizado, os contatos comerciais.
DROP FUNCTION IF EXISTS public.vinculos_da_empresa(uuid, text);
CREATE FUNCTION public.vinculos_da_empresa(p_id_empresa uuid, p_status text DEFAULT NULL)
RETURNS TABLE (
  id uuid, funcao text, status text, permissoes text[], origem text,
  criado_em timestamptz, aprovado_em timestamptz, encerrado_em timestamptz, motivo_encerramento text,
  id_contador uuid, contador_nome text, contador_email text,
  id_escritorio uuid, escritorio_nome text,
  nome_profissional text, crc text, cidade text, estado text, especialidades text[],
  foto_caminho text, email_comercial text, telefone_comercial text
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
$$;

-- 8. Fotos: armazenamento privado, leitura só pelo dono, admins ou empresas autorizadas com perfil publicado
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fotos-perfis', 'fotos-perfis', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.dono_do_perfil_profissional(p_id_perfil text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfis_profissionais pp
     WHERE pp.id::text = p_id_perfil
       AND (pp.id_usuario = auth.uid() OR (pp.id_escritorio IS NOT NULL AND public.e_gestor_empresa(pp.id_escritorio)))
  );
$$;

CREATE OR REPLACE FUNCTION public.foto_perfil_visivel(p_id_perfil text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.dono_do_perfil_profissional(p_id_perfil)
      OR public.is_admin(auth.uid())
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
$$;

CREATE POLICY "Fotos de perfil: leitura autorizada"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fotos-perfis' AND public.foto_perfil_visivel((storage.foldername(name))[1]));

CREATE POLICY "Fotos de perfil: dono envia"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fotos-perfis' AND public.dono_do_perfil_profissional((storage.foldername(name))[1]));

CREATE POLICY "Fotos de perfil: dono substitui"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'fotos-perfis' AND public.dono_do_perfil_profissional((storage.foldername(name))[1]))
  WITH CHECK (bucket_id = 'fotos-perfis' AND public.dono_do_perfil_profissional((storage.foldername(name))[1]));

CREATE POLICY "Fotos de perfil: dono remove"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fotos-perfis' AND public.dono_do_perfil_profissional((storage.foldername(name))[1]));

-- 9. Execução: nada para anônimos
REVOKE ALL ON FUNCTION public.validar_perfil_profissional() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pode_ver_catalogo() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.perfil_no_catalogo(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.buscar_catalogo_contadores(text, text, text, text, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.perfil_do_catalogo(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.solicitar_vinculo_pelo_catalogo(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.vinculos_da_empresa(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dono_do_perfil_profissional(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.foto_perfil_visivel(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pode_ver_catalogo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.perfil_no_catalogo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_catalogo_contadores(text, text, text, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.perfil_do_catalogo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.solicitar_vinculo_pelo_catalogo(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vinculos_da_empresa(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dono_do_perfil_profissional(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.foto_perfil_visivel(text) TO authenticated;
