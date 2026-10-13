-- Tarefas — base ÚNICA para três contextos isolados:
--   'empresa'    → empresa comum (id_empresa)          → membros ativos da empresa
--   'escritorio' → escritório contábil (id_empresa)    → membros ativos do escritório
--   'plataforma' → administração do Unnify (sem empresa) → administradores (is_admin)
-- Admin Master NÃO acessa tarefas de empresas/escritórios por ser admin. Escrita só por funções.

-- 1. Autorização
CREATE OR REPLACE FUNCTION public.pode_acessar_contexto_tarefas(p_contexto text, p_id_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_contexto = 'plataforma' THEN p_id_empresa IS NULL AND public.is_admin(auth.uid())
    WHEN p_contexto IN ('empresa', 'escritorio') THEN EXISTS (
      SELECT 1 FROM public.usuarios_empresas ue
        JOIN public.empresas e ON e.id = ue.id_empresa
       WHERE ue.id_empresa = p_id_empresa AND ue.id_usuario = auth.uid() AND ue.ativo
         AND e.tipo_empresa = CASE p_contexto WHEN 'empresa' THEN 'comum' ELSE 'escritorio_contabil' END)
    ELSE false
  END;
$$;

-- Quem pode ser responsável: membro ativo do mesmo contexto (plataforma: só administradores)
CREATE OR REPLACE FUNCTION public.responsavel_tarefa_valido(p_contexto text, p_id_empresa uuid, p_id_usuario uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_id_usuario IS NOT NULL AND CASE
    WHEN p_contexto = 'plataforma' THEN EXISTS (
      SELECT 1 FROM public.perfis WHERE id_usuario = p_id_usuario AND funcao_global IN ('admin', 'admin_master') AND status = 'active')
    ELSE EXISTS (SELECT 1 FROM public.usuarios_empresas WHERE id_empresa = p_id_empresa AND id_usuario = p_id_usuario AND ativo)
  END;
$$;

-- 2. Tabelas
CREATE TABLE public.categorias_tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contexto text NOT NULL,
  id_empresa uuid REFERENCES public.empresas(id) ON DELETE RESTRICT,
  nome text NOT NULL,
  cor text NOT NULL DEFAULT '#9ca3af',
  icone text NOT NULL DEFAULT 'tag',
  ativa boolean NOT NULL DEFAULT true,
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categorias_tarefas_contexto CHECK ((contexto = 'plataforma') = (id_empresa IS NULL) AND contexto IN ('empresa', 'escritorio', 'plataforma')),
  CONSTRAINT categorias_tarefas_nome CHECK (char_length(btrim(nome)) BETWEEN 2 AND 60),
  CONSTRAINT categorias_tarefas_cor CHECK (cor ~ '^#[0-9a-fA-F]{6}$'),
  CONSTRAINT categorias_tarefas_icone CHECK (icone = ANY (public.icones_categoria_permitidos()))
);
CREATE UNIQUE INDEX categorias_tarefas_nome_unico
  ON public.categorias_tarefas (contexto, coalesce(id_empresa, '00000000-0000-0000-0000-000000000000'::uuid), lower(nome));

CREATE TABLE public.tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contexto text NOT NULL,
  id_empresa uuid REFERENCES public.empresas(id) ON DELETE RESTRICT,
  titulo text NOT NULL,
  descricao text,
  id_categoria uuid REFERENCES public.categorias_tarefas(id) ON DELETE RESTRICT,
  prioridade text NOT NULL DEFAULT 'media',
  status text NOT NULL DEFAULT 'pendente',
  prazo date,
  hora time,
  id_responsavel uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  concluida_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  concluida_em timestamptz,
  arquivada_em timestamptz,
  arquivada_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  CONSTRAINT tarefas_contexto CHECK ((contexto = 'plataforma') = (id_empresa IS NULL) AND contexto IN ('empresa', 'escritorio', 'plataforma')),
  CONSTRAINT tarefas_titulo CHECK (char_length(btrim(titulo)) BETWEEN 3 AND 200),
  CONSTRAINT tarefas_descricao CHECK (descricao IS NULL OR char_length(descricao) <= 4000),
  CONSTRAINT tarefas_prioridade CHECK (prioridade IN ('baixa', 'media', 'alta')),
  CONSTRAINT tarefas_status CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'cancelada')),
  CONSTRAINT tarefas_concluida CHECK ((status = 'concluida') = (concluida_em IS NOT NULL)),
  CONSTRAINT tarefas_prazo CHECK (prazo IS NULL OR prazo BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
  CONSTRAINT tarefas_hora_com_prazo CHECK (hora IS NULL OR prazo IS NOT NULL)
);
CREATE INDEX idx_tarefas_contexto ON public.tarefas (contexto, id_empresa, status) WHERE arquivada_em IS NULL;
CREATE INDEX idx_tarefas_prazo ON public.tarefas (contexto, id_empresa, prazo) WHERE arquivada_em IS NULL;
CREATE INDEX idx_tarefas_responsavel ON public.tarefas (id_responsavel);

CREATE TABLE public.checklist_tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_tarefa uuid NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  texto text NOT NULL,
  concluido boolean NOT NULL DEFAULT false,
  ordem integer NOT NULL DEFAULT 0,
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  concluido_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  concluido_em timestamptz,
  CONSTRAINT checklist_tarefas_texto CHECK (char_length(btrim(texto)) BETWEEN 1 AND 200)
);
CREATE INDEX idx_checklist_tarefa ON public.checklist_tarefas (id_tarefa, ordem);

CREATE TABLE public.comentarios_tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_tarefa uuid NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  id_autor uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  texto text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  excluido_em timestamptz,
  CONSTRAINT comentarios_tarefas_texto CHECK (char_length(btrim(texto)) BETWEEN 1 AND 2000)
);
CREATE INDEX idx_comentarios_tarefa ON public.comentarios_tarefas (id_tarefa, criado_em);

CREATE TABLE public.anexos_tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_tarefa uuid NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  caminho text NOT NULL UNIQUE,
  nome_arquivo text NOT NULL,
  tipo_mime text NOT NULL,
  tamanho integer NOT NULL,
  enviado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  excluido_em timestamptz,
  excluido_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  CONSTRAINT anexos_tarefas_tipo CHECK (tipo_mime IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT anexos_tarefas_tamanho CHECK (tamanho > 0 AND tamanho <= 10485760),
  CONSTRAINT anexos_tarefas_nome CHECK (char_length(nome_arquivo) BETWEEN 1 AND 200)
);
CREATE INDEX idx_anexos_tarefa ON public.anexos_tarefas (id_tarefa) WHERE excluido_em IS NULL;

CREATE TABLE public.historico_tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_tarefa uuid NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  acao text NOT NULL,
  dados jsonb,
  id_usuario uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historico_tarefas_acao CHECK (acao IN ('criada', 'editada', 'status', 'arquivada', 'desarquivada', 'checklist', 'comentario', 'anexo'))
);
CREATE INDEX idx_historico_tarefa ON public.historico_tarefas (id_tarefa, criado_em);

-- 3. Integridade e histórico
CREATE OR REPLACE FUNCTION public.validar_tarefa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cat public.categorias_tarefas;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.contexto IS DISTINCT FROM OLD.contexto OR NEW.id_empresa IS DISTINCT FROM OLD.id_empresa THEN
      RAISE EXCEPTION 'O contexto da tarefa não pode ser alterado.' USING ERRCODE = 'check_violation';
    END IF;
    NEW.atualizado_em := now();
  END IF;
  IF NEW.id_categoria IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.id_categoria IS DISTINCT FROM OLD.id_categoria) THEN
    SELECT * INTO v_cat FROM public.categorias_tarefas WHERE id = NEW.id_categoria;
    IF v_cat.id IS NULL OR v_cat.contexto <> NEW.contexto OR v_cat.id_empresa IS DISTINCT FROM NEW.id_empresa THEN
      RAISE EXCEPTION 'Categoria inválida para esta tarefa.' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT v_cat.ativa THEN
      RAISE EXCEPTION 'Esta categoria está desativada.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.id_responsavel IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.id_responsavel IS DISTINCT FROM OLD.id_responsavel)
     AND NOT public.responsavel_tarefa_valido(NEW.contexto, NEW.id_empresa, NEW.id_responsavel) THEN
    RAISE EXCEPTION 'Responsável inválido: escolha um membro autorizado deste ambiente.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.titulo := btrim(NEW.titulo);
  NEW.descricao := nullif(btrim(coalesce(NEW.descricao, '')), '');
  RETURN NEW;
END;
$$;
CREATE TRIGGER validar_tarefa BEFORE INSERT OR UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION public.validar_tarefa();

CREATE OR REPLACE FUNCTION public.registrar_historico_tarefa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_acao text;
  v_dados jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_acao := 'criada';
    v_dados := jsonb_build_object('titulo', NEW.titulo);
  ELSIF NEW.arquivada_em IS DISTINCT FROM OLD.arquivada_em THEN
    v_acao := CASE WHEN NEW.arquivada_em IS NULL THEN 'desarquivada' ELSE 'arquivada' END;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_acao := 'status';
    v_dados := jsonb_build_object('de', OLD.status, 'para', NEW.status);
  ELSE
    v_acao := 'editada';
    v_dados := (SELECT jsonb_object_agg(n.key, n.value) FROM jsonb_each(to_jsonb(NEW)) n
                 WHERE n.key IN ('titulo', 'descricao', 'id_categoria', 'prioridade', 'prazo', 'hora', 'id_responsavel')
                   AND n.value IS DISTINCT FROM to_jsonb(OLD) -> n.key);
  END IF;
  INSERT INTO public.historico_tarefas (id_tarefa, acao, dados, id_usuario) VALUES (NEW.id, v_acao, v_dados, auth.uid());
  RETURN NEW;
END;
$$;
CREATE TRIGGER registrar_historico_tarefa AFTER INSERT OR UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION public.registrar_historico_tarefa();

CREATE OR REPLACE FUNCTION public.pode_acessar_tarefa(p_id_tarefa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tarefas t WHERE t.id = p_id_tarefa AND public.pode_acessar_contexto_tarefas(t.contexto, t.id_empresa));
$$;

-- 4. RLS (leitura por contexto; nenhuma escrita direta)
ALTER TABLE public.categorias_tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comentarios_tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anexos_tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_tarefas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.categorias_tarefas, public.tarefas, public.checklist_tarefas, public.comentarios_tarefas,
              public.anexos_tarefas, public.historico_tarefas FROM anon, authenticated;
GRANT SELECT ON public.categorias_tarefas, public.tarefas, public.checklist_tarefas, public.comentarios_tarefas,
                public.anexos_tarefas, public.historico_tarefas TO authenticated;

CREATE POLICY "Tarefas: categorias do contexto" ON public.categorias_tarefas FOR SELECT TO authenticated
  USING (public.pode_acessar_contexto_tarefas(contexto, id_empresa));
CREATE POLICY "Tarefas: tarefas do contexto" ON public.tarefas FOR SELECT TO authenticated
  USING (public.pode_acessar_contexto_tarefas(contexto, id_empresa));
CREATE POLICY "Tarefas: checklist do contexto" ON public.checklist_tarefas FOR SELECT TO authenticated
  USING (public.pode_acessar_tarefa(id_tarefa));
CREATE POLICY "Tarefas: comentários do contexto" ON public.comentarios_tarefas FOR SELECT TO authenticated
  USING (excluido_em IS NULL AND public.pode_acessar_tarefa(id_tarefa));
CREATE POLICY "Tarefas: anexos do contexto" ON public.anexos_tarefas FOR SELECT TO authenticated
  USING (excluido_em IS NULL AND public.pode_acessar_tarefa(id_tarefa));
CREATE POLICY "Tarefas: histórico do contexto" ON public.historico_tarefas FOR SELECT TO authenticated
  USING (public.pode_acessar_tarefa(id_tarefa));

-- 5. Categorias
CREATE OR REPLACE FUNCTION public.salvar_categoria_tarefa(p_id uuid, p_contexto text, p_id_empresa uuid, p_nome text, p_cor text, p_icone text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cat public.categorias_tarefas;
  v_id uuid;
BEGIN
  IF p_icone IS NOT NULL AND NOT (p_icone = ANY (public.icones_categoria_permitidos())) THEN
    RAISE EXCEPTION 'Ícone inválido.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_cor IS NOT NULL AND p_cor !~ '^#[0-9a-fA-F]{6}$' THEN
    RAISE EXCEPTION 'Cor inválida.' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(btrim(coalesce(p_nome, ''))) NOT BETWEEN 2 AND 60 THEN
    RAISE EXCEPTION 'Nome da categoria inválido (2 a 60 caracteres).' USING ERRCODE = 'check_violation';
  END IF;
  IF p_id IS NULL THEN
    IF NOT public.pode_acessar_contexto_tarefas(p_contexto, p_id_empresa) THEN
      RAISE EXCEPTION 'Sem permissão para este ambiente de tarefas.' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.categorias_tarefas (contexto, id_empresa, nome, cor, icone, criado_por)
    VALUES (p_contexto, p_id_empresa, btrim(p_nome), coalesce(p_cor, '#9ca3af'), coalesce(p_icone, 'tag'), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    SELECT * INTO v_cat FROM public.categorias_tarefas WHERE id = p_id;
    IF v_cat.id IS NULL OR NOT public.pode_acessar_contexto_tarefas(v_cat.contexto, v_cat.id_empresa) THEN
      RAISE EXCEPTION 'Categoria não encontrada.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.categorias_tarefas SET nome = btrim(p_nome), cor = coalesce(p_cor, cor), icone = coalesce(p_icone, icone), atualizado_em = now()
     WHERE id = p_id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Já existe uma categoria com este nome.' USING ERRCODE = 'unique_violation';
END;
$$;

CREATE OR REPLACE FUNCTION public.definir_categoria_tarefa_ativa(p_id uuid, p_ativa boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cat public.categorias_tarefas;
BEGIN
  SELECT * INTO v_cat FROM public.categorias_tarefas WHERE id = p_id;
  IF v_cat.id IS NULL OR NOT public.pode_acessar_contexto_tarefas(v_cat.contexto, v_cat.id_empresa) THEN
    RAISE EXCEPTION 'Categoria não encontrada.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.categorias_tarefas SET ativa = p_ativa, atualizado_em = now() WHERE id = p_id;
END;
$$;

-- 6. Tarefas
CREATE OR REPLACE FUNCTION public.salvar_tarefa(
  p_id uuid, p_contexto text, p_id_empresa uuid, p_titulo text, p_descricao text, p_id_categoria uuid,
  p_prioridade text, p_prazo date, p_hora time, p_id_responsavel uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_atual public.tarefas;
  v_id uuid;
  v_restricao text;
BEGIN
  IF p_id IS NULL THEN
    IF NOT public.pode_acessar_contexto_tarefas(p_contexto, p_id_empresa) THEN
      RAISE EXCEPTION 'Sem permissão para este ambiente de tarefas.' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.tarefas (contexto, id_empresa, titulo, descricao, id_categoria, prioridade, prazo, hora, id_responsavel, criado_por, atualizado_por)
    VALUES (p_contexto, p_id_empresa, coalesce(p_titulo, ''), p_descricao, p_id_categoria, coalesce(p_prioridade, 'media'), p_prazo, p_hora,
            p_id_responsavel, auth.uid(), auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  SELECT * INTO v_atual FROM public.tarefas WHERE id = p_id FOR UPDATE;
  IF v_atual.id IS NULL OR NOT public.pode_acessar_contexto_tarefas(v_atual.contexto, v_atual.id_empresa) THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.tarefas
     SET titulo = coalesce(p_titulo, ''), descricao = p_descricao, id_categoria = p_id_categoria, prioridade = coalesce(p_prioridade, 'media'),
         prazo = p_prazo, hora = p_hora, id_responsavel = p_id_responsavel, atualizado_por = auth.uid()
   WHERE id = p_id;
  RETURN p_id;
EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS v_restricao = CONSTRAINT_NAME;
  IF coalesce(v_restricao, '') = '' THEN RAISE; END IF;
  RAISE EXCEPTION 'Dados inválidos: confira título (3 a 200 caracteres), prioridade e prazo.' USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE FUNCTION public.alterar_status_tarefa(p_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_atual public.tarefas;
BEGIN
  IF p_status NOT IN ('pendente', 'em_andamento', 'concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Situação inválida.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_atual FROM public.tarefas WHERE id = p_id FOR UPDATE;
  IF v_atual.id IS NULL OR NOT public.pode_acessar_contexto_tarefas(v_atual.contexto, v_atual.id_empresa) THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF v_atual.status = p_status THEN
    RETURN; -- idempotente: cliques repetidos não geram efeito nem histórico duplicado
  END IF;
  UPDATE public.tarefas
     SET status = p_status,
         concluida_em = CASE WHEN p_status = 'concluida' THEN now() END,
         concluida_por = CASE WHEN p_status = 'concluida' THEN auth.uid() END,
         atualizado_por = auth.uid()
   WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.arquivar_tarefa(p_id uuid, p_arquivar boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_atual public.tarefas;
BEGIN
  SELECT * INTO v_atual FROM public.tarefas WHERE id = p_id FOR UPDATE;
  IF v_atual.id IS NULL OR NOT public.pode_acessar_contexto_tarefas(v_atual.contexto, v_atual.id_empresa) THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.tarefas
     SET arquivada_em = CASE WHEN p_arquivar THEN coalesce(arquivada_em, now()) END,
         arquivada_por = CASE WHEN p_arquivar THEN auth.uid() END, atualizado_por = auth.uid()
   WHERE id = p_id;
END;
$$;

-- 7. Checklist, comentários e anexos (sempre verificando o acesso à tarefa)
CREATE OR REPLACE FUNCTION public.adicionar_item_checklist(p_id_tarefa uuid, p_texto text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.pode_acessar_tarefa(p_id_tarefa) THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF char_length(btrim(coalesce(p_texto, ''))) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Item do checklist inválido (1 a 200 caracteres).' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.checklist_tarefas (id_tarefa, texto, ordem, criado_por)
  VALUES (p_id_tarefa, btrim(p_texto), coalesce((SELECT max(ordem) + 1 FROM public.checklist_tarefas WHERE id_tarefa = p_id_tarefa), 0), auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.historico_tarefas (id_tarefa, acao, dados, id_usuario) VALUES (p_id_tarefa, 'checklist', jsonb_build_object('adicionado', btrim(p_texto)), auth.uid());
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.alternar_item_checklist(p_id_item uuid, p_concluido boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item public.checklist_tarefas;
BEGIN
  SELECT * INTO v_item FROM public.checklist_tarefas WHERE id = p_id_item;
  IF v_item.id IS NULL OR NOT public.pode_acessar_tarefa(v_item.id_tarefa) THEN
    RAISE EXCEPTION 'Item não encontrado.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.checklist_tarefas
     SET concluido = p_concluido, concluido_por = CASE WHEN p_concluido THEN auth.uid() END, concluido_em = CASE WHEN p_concluido THEN now() END
   WHERE id = p_id_item;
END;
$$;

CREATE OR REPLACE FUNCTION public.remover_item_checklist(p_id_item uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item public.checklist_tarefas;
BEGIN
  SELECT * INTO v_item FROM public.checklist_tarefas WHERE id = p_id_item;
  IF v_item.id IS NULL OR NOT public.pode_acessar_tarefa(v_item.id_tarefa) THEN
    RAISE EXCEPTION 'Item não encontrado.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.checklist_tarefas WHERE id = p_id_item;
  INSERT INTO public.historico_tarefas (id_tarefa, acao, dados, id_usuario) VALUES (v_item.id_tarefa, 'checklist', jsonb_build_object('removido', v_item.texto), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.comentar_tarefa(p_id_tarefa uuid, p_texto text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.pode_acessar_tarefa(p_id_tarefa) THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF char_length(btrim(coalesce(p_texto, ''))) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Comentário inválido (1 a 2000 caracteres).' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.comentarios_tarefas (id_tarefa, id_autor, texto) VALUES (p_id_tarefa, auth.uid(), btrim(p_texto)) RETURNING id INTO v_id;
  INSERT INTO public.historico_tarefas (id_tarefa, acao, id_usuario) VALUES (p_id_tarefa, 'comentario', auth.uid());
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_comentario_tarefa(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.comentarios_tarefas SET excluido_em = now()
   WHERE id = p_id AND id_autor = auth.uid() AND excluido_em IS NULL AND public.pode_acessar_tarefa(id_tarefa);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Só o autor pode excluir o comentário.' USING ERRCODE = '42501';
  END IF;
END;
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('anexos-tarefas', 'anexos-tarefas', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Caminho: <id_empresa ou 'plataforma'>/<id_tarefa>/<arquivo>
CREATE OR REPLACE FUNCTION public.pasta_anexo_tarefa_valida(p_nome text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tarefas t
     WHERE t.id = public.uuid_ou_nulo((storage.foldername(p_nome))[2])
       AND (storage.foldername(p_nome))[1] = coalesce(t.id_empresa::text, 'plataforma')
       AND public.pode_acessar_contexto_tarefas(t.contexto, t.id_empresa));
$$;

CREATE POLICY "Anexos de tarefas: leitura" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'anexos-tarefas' AND public.pasta_anexo_tarefa_valida(name));
CREATE POLICY "Anexos de tarefas: envio" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'anexos-tarefas' AND public.pasta_anexo_tarefa_valida(name));
CREATE POLICY "Anexos de tarefas: remoção" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'anexos-tarefas' AND public.pasta_anexo_tarefa_valida(name));

CREATE OR REPLACE FUNCTION public.registrar_anexo_tarefa(p_id_tarefa uuid, p_caminho text, p_nome_arquivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_obj record;
  v_id uuid;
BEGIN
  IF NOT public.pode_acessar_tarefa(p_id_tarefa) OR NOT public.pasta_anexo_tarefa_valida(p_caminho)
     OR public.uuid_ou_nulo((storage.foldername(p_caminho))[2]) IS DISTINCT FROM p_id_tarefa THEN
    RAISE EXCEPTION 'Anexo inválido.' USING ERRCODE = '42501';
  END IF;
  SELECT (o.metadata->>'size')::integer AS tamanho, o.metadata->>'mimetype' AS tipo INTO v_obj
    FROM storage.objects o WHERE o.bucket_id = 'anexos-tarefas' AND o.name = p_caminho;
  IF v_obj.tamanho IS NULL THEN
    RAISE EXCEPTION 'Arquivo não encontrado.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.anexos_tarefas (id_tarefa, caminho, nome_arquivo, tipo_mime, tamanho, enviado_por)
  VALUES (p_id_tarefa, p_caminho, left(coalesce(nullif(btrim(p_nome_arquivo), ''), 'anexo'), 200), v_obj.tipo, v_obj.tamanho, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.historico_tarefas (id_tarefa, acao, dados, id_usuario) VALUES (p_id_tarefa, 'anexo', jsonb_build_object('adicionado', p_nome_arquivo), auth.uid());
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remover_anexo_tarefa(p_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_anexo public.anexos_tarefas;
BEGIN
  SELECT * INTO v_anexo FROM public.anexos_tarefas WHERE id = p_id AND excluido_em IS NULL;
  IF v_anexo.id IS NULL OR NOT public.pode_acessar_tarefa(v_anexo.id_tarefa) THEN
    RAISE EXCEPTION 'Anexo não encontrado.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.anexos_tarefas SET excluido_em = now(), excluido_por = auth.uid() WHERE id = p_id;
  INSERT INTO public.historico_tarefas (id_tarefa, acao, dados, id_usuario) VALUES (v_anexo.id_tarefa, 'anexo', jsonb_build_object('removido', v_anexo.nome_arquivo), auth.uid());
  RETURN v_anexo.caminho;
END;
$$;

-- 8. Leitura com nomes (perfis de outros usuários só aparecem por aqui, e só dentro do contexto autorizado)
CREATE OR REPLACE FUNCTION public.membros_contexto_tarefas(p_contexto text, p_id_empresa uuid)
RETURNS TABLE (id_usuario uuid, nome text, email text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.pode_acessar_contexto_tarefas(p_contexto, p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para este ambiente de tarefas.' USING ERRCODE = '42501';
  END IF;
  IF p_contexto = 'plataforma' THEN
    RETURN QUERY SELECT p.id_usuario, coalesce(p.nome_completo, p.email), p.email FROM public.perfis p
                  WHERE p.funcao_global IN ('admin', 'admin_master') AND p.status = 'active' ORDER BY 2;
  ELSE
    RETURN QUERY SELECT p.id_usuario, coalesce(p.nome_completo, p.email), p.email
                   FROM public.usuarios_empresas ue JOIN public.perfis p ON p.id_usuario = ue.id_usuario
                  WHERE ue.id_empresa = p_id_empresa AND ue.ativo ORDER BY 2;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_tarefas(
  p_contexto text, p_id_empresa uuid, p_visao text DEFAULT 'todas', p_busca text DEFAULT NULL, p_id_responsavel uuid DEFAULT NULL,
  p_id_categoria uuid DEFAULT NULL, p_prioridade text DEFAULT NULL, p_prazo text DEFAULT NULL, p_dia date DEFAULT NULL,
  p_limite integer DEFAULT 20, p_deslocamento integer DEFAULT 0)
RETURNS TABLE (
  id uuid, titulo text, descricao text, prioridade text, status text, atrasada boolean, prazo date, hora time,
  id_categoria uuid, categoria_nome text, categoria_cor text, categoria_icone text,
  id_responsavel uuid, responsavel_nome text, criado_por uuid, arquivada boolean,
  qtd_comentarios bigint, qtd_anexos bigint, checklist_total bigint, checklist_feitos bigint, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := public.hoje_brasil();
BEGIN
  IF NOT public.pode_acessar_contexto_tarefas(p_contexto, p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para este ambiente de tarefas.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT t.id, t.titulo, t.descricao, t.prioridade, t.status,
         (t.status IN ('pendente', 'em_andamento') AND t.prazo < v_hoje),
         t.prazo, t.hora, t.id_categoria, c.nome, c.cor, c.icone, t.id_responsavel, coalesce(p.nome_completo, p.email), t.criado_por,
         t.arquivada_em IS NOT NULL,
         (SELECT count(*) FROM public.comentarios_tarefas x WHERE x.id_tarefa = t.id AND x.excluido_em IS NULL),
         (SELECT count(*) FROM public.anexos_tarefas x WHERE x.id_tarefa = t.id AND x.excluido_em IS NULL),
         (SELECT count(*) FROM public.checklist_tarefas x WHERE x.id_tarefa = t.id),
         (SELECT count(*) FROM public.checklist_tarefas x WHERE x.id_tarefa = t.id AND x.concluido),
         count(*) OVER ()
    FROM public.tarefas t
    LEFT JOIN public.categorias_tarefas c ON c.id = t.id_categoria
    LEFT JOIN public.perfis p ON p.id_usuario = t.id_responsavel
   WHERE t.contexto = p_contexto AND t.id_empresa IS NOT DISTINCT FROM p_id_empresa
     AND CASE coalesce(p_visao, 'todas')
           WHEN 'arquivadas' THEN t.arquivada_em IS NOT NULL
           WHEN 'minhas' THEN t.arquivada_em IS NULL AND t.id_responsavel = auth.uid() AND t.status NOT IN ('concluida', 'cancelada')
           WHEN 'criadas' THEN t.arquivada_em IS NULL AND t.criado_por = auth.uid()
           WHEN 'concluidas' THEN t.arquivada_em IS NULL AND t.status = 'concluida'
           WHEN 'canceladas' THEN t.arquivada_em IS NULL AND t.status = 'cancelada'
           ELSE t.arquivada_em IS NULL AND t.status NOT IN ('concluida', 'cancelada')
         END
     AND (p_busca IS NULL OR p_busca = '' OR t.titulo ILIKE '%' || p_busca || '%' OR coalesce(t.descricao, '') ILIKE '%' || p_busca || '%')
     AND (p_id_responsavel IS NULL OR t.id_responsavel = p_id_responsavel)
     AND (p_id_categoria IS NULL OR t.id_categoria = p_id_categoria)
     AND (p_prioridade IS NULL OR p_prioridade = '' OR t.prioridade = p_prioridade)
     AND (p_dia IS NULL OR t.prazo = p_dia)
     AND CASE coalesce(p_prazo, '')
           WHEN 'atrasadas' THEN t.status IN ('pendente', 'em_andamento') AND t.prazo < v_hoje
           WHEN 'hoje' THEN t.prazo = v_hoje
           WHEN 'semana' THEN t.prazo BETWEEN v_hoje AND v_hoje + 7
           WHEN 'sem_prazo' THEN t.prazo IS NULL
           ELSE true
         END
   ORDER BY (t.prazo IS NULL), t.prazo, t.hora NULLS LAST,
            CASE t.prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, t.criado_em DESC
   LIMIT LEAST(GREATEST(p_limite, 1), 100) OFFSET GREATEST(p_deslocamento, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.resumo_tarefas(p_contexto text, p_id_empresa uuid, p_mes date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := public.hoje_brasil();
  v_ini date := date_trunc('month', coalesce(p_mes, public.hoje_brasil()))::date;
BEGIN
  IF NOT public.pode_acessar_contexto_tarefas(p_contexto, p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para este ambiente de tarefas.' USING ERRCODE = '42501';
  END IF;
  RETURN (
    WITH base AS (
      SELECT * FROM public.tarefas t
       WHERE t.contexto = p_contexto AND t.id_empresa IS NOT DISTINCT FROM p_id_empresa AND t.arquivada_em IS NULL
    )
    SELECT jsonb_build_object(
      'hoje', v_hoje,
      'pendentes', (SELECT count(*) FROM base WHERE status = 'pendente'),
      'em_andamento', (SELECT count(*) FROM base WHERE status = 'em_andamento'),
      'concluidas', (SELECT count(*) FROM base WHERE status = 'concluida'),
      'atrasadas', (SELECT count(*) FROM base WHERE status IN ('pendente', 'em_andamento') AND prazo < v_hoje),
      'dias_com_tarefas', coalesce((SELECT jsonb_agg(DISTINCT prazo) FROM base
                                     WHERE status IN ('pendente', 'em_andamento') AND prazo BETWEEN v_ini AND (v_ini + interval '1 month - 1 day')::date), '[]'::jsonb),
      'categorias', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'cor', c.cor, 'icone', c.icone,
                                 'qtd', (SELECT count(*) FROM base b WHERE b.id_categoria = c.id AND b.status IN ('pendente', 'em_andamento'))) ORDER BY c.nome)
                                FROM public.categorias_tarefas c
                               WHERE c.contexto = p_contexto AND c.id_empresa IS NOT DISTINCT FROM p_id_empresa AND c.ativa), '[]'::jsonb)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.detalhe_tarefa(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.pode_acessar_tarefa(p_id) THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'checklist', coalesce((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'texto', i.texto, 'concluido', i.concluido) ORDER BY i.ordem, i.criado_em)
                             FROM public.checklist_tarefas i WHERE i.id_tarefa = p_id), '[]'::jsonb),
    'comentarios', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'texto', c.texto, 'criado_em', c.criado_em,
                                'autor', coalesce(p.nome_completo, p.email), 'meu', c.id_autor = auth.uid()) ORDER BY c.criado_em)
                               FROM public.comentarios_tarefas c LEFT JOIN public.perfis p ON p.id_usuario = c.id_autor
                              WHERE c.id_tarefa = p_id AND c.excluido_em IS NULL), '[]'::jsonb),
    'anexos', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'caminho', a.caminho, 'nome_arquivo', a.nome_arquivo, 'tamanho', a.tamanho) ORDER BY a.criado_em)
                          FROM public.anexos_tarefas a WHERE a.id_tarefa = p_id AND a.excluido_em IS NULL), '[]'::jsonb),
    'historico', coalesce((SELECT jsonb_agg(jsonb_build_object('acao', h.acao, 'dados', h.dados, 'criado_em', h.criado_em,
                              'usuario', coalesce(p.nome_completo, p.email)) ORDER BY h.criado_em DESC)
                             FROM (SELECT * FROM public.historico_tarefas WHERE id_tarefa = p_id ORDER BY criado_em DESC LIMIT 30) h
                             LEFT JOIN public.perfis p ON p.id_usuario = h.id_usuario), '[]'::jsonb)
  );
END;
$$;

-- 9. Execução: só usuários logados; funções de gatilho fora do alcance
REVOKE ALL ON FUNCTION public.validar_tarefa(), public.registrar_historico_tarefa() FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'pode_acessar_contexto_tarefas(text, uuid)', 'responsavel_tarefa_valido(text, uuid, uuid)', 'pode_acessar_tarefa(uuid)',
    'salvar_categoria_tarefa(uuid, text, uuid, text, text, text)', 'definir_categoria_tarefa_ativa(uuid, boolean)',
    'salvar_tarefa(uuid, text, uuid, text, text, uuid, text, date, time, uuid)', 'alterar_status_tarefa(uuid, text)',
    'arquivar_tarefa(uuid, boolean)', 'adicionar_item_checklist(uuid, text)', 'alternar_item_checklist(uuid, boolean)',
    'remover_item_checklist(uuid)', 'comentar_tarefa(uuid, text)', 'excluir_comentario_tarefa(uuid)',
    'pasta_anexo_tarefa_valida(text)', 'registrar_anexo_tarefa(uuid, text, text)', 'remover_anexo_tarefa(uuid)',
    'membros_contexto_tarefas(text, uuid)',
    'listar_tarefas(text, uuid, text, text, uuid, uuid, text, text, date, integer, integer)',
    'resumo_tarefas(text, uuid, date)', 'detalhe_tarefa(uuid)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
