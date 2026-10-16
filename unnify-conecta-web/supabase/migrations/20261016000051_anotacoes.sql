-- Anotações (departamento Administrativo do portal da empresa): notas em TEXTO PURO (sem HTML) com categoria, tags e fixação.
-- Acesso (aplicado pelo banco, a tela só informa a empresa):
--   categoria "pessoal" → SOMENTE quem criou a anotação (nem os outros membros da empresa veem);
--   demais categorias   → equipe da empresa (dono, sócio e representante ativos). Contador (inclusive vínculo antigo do tipo "contador") e Admin Master NÃO têm acesso.
--   editar/excluir/fixar → autor; nas anotações da empresa, também o dono/sócio (e_gestor_empresa). "Pessoal" só o autor.
-- Escrita só pelas funções abaixo (SECURITY DEFINER); exclusão LÓGICA (nada é apagado do banco).
-- Reversão: rollback/20261016000051_anotacoes_reverter.sql

CREATE TABLE public.anotacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  titulo text NOT NULL,
  conteudo text NOT NULL,
  categoria text NOT NULL DEFAULT 'pessoal',
  tags text[] NOT NULL DEFAULT '{}',
  fixada boolean NOT NULL DEFAULT false,
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  excluido_em timestamptz,
  excluido_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  CONSTRAINT anotacoes_titulo CHECK (char_length(btrim(titulo)) BETWEEN 2 AND 120),
  CONSTRAINT anotacoes_conteudo CHECK (char_length(btrim(conteudo)) BETWEEN 1 AND 20000),
  CONSTRAINT anotacoes_categoria CHECK (categoria IN ('pessoal', 'empresa', 'ideias', 'reunioes', 'outras')),
  CONSTRAINT anotacoes_tags CHECK (cardinality(tags) <= 10)
);
CREATE INDEX idx_anotacoes_empresa ON public.anotacoes (id_empresa, fixada DESC, atualizado_em DESC) WHERE excluido_em IS NULL;

-- Equipe da empresa para as anotações: só dono/sócio/representante ativos (e_membro_empresa também aceitaria vínculo "contador")
CREATE OR REPLACE FUNCTION public.e_equipe_anotacoes(p_id_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.usuarios_empresas ue JOIN public.empresas e ON e.id = ue.id_empresa
                  WHERE ue.id_empresa = p_id_empresa AND ue.id_usuario = auth.uid() AND ue.ativo AND ue.tipo_vinculacao IN ('dono', 'socio', 'representante') AND e.tipo_empresa = 'comum');
$$;

-- Quem pode ver (a regra única: usada pela RLS e pelas funções)
CREATE OR REPLACE FUNCTION public.pode_ver_anotacao(p_id_empresa uuid, p_categoria text, p_criado_por uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public.e_equipe_anotacoes(p_id_empresa) AND (p_categoria <> 'pessoal' OR p_criado_por = auth.uid());
$$;
-- Quem pode alterar/excluir/fixar
CREATE OR REPLACE FUNCTION public.pode_editar_anotacao(p_id_empresa uuid, p_categoria text, p_criado_por uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.pode_ver_anotacao(p_id_empresa, p_categoria, p_criado_por)
     AND (p_criado_por = auth.uid() OR (p_categoria <> 'pessoal' AND public.e_gestor_empresa(p_id_empresa)));
$$;

ALTER TABLE public.anotacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.anotacoes FROM anon, authenticated;
GRANT SELECT ON public.anotacoes TO authenticated;
CREATE POLICY "Anotações: pessoal só do autor; demais, membros da empresa" ON public.anotacoes FOR SELECT TO authenticated
  USING (excluido_em IS NULL AND public.pode_ver_anotacao(id_empresa, categoria, criado_por));

-- Tags: minúsculas não — preserva o texto, mas apara, remove vazias/repetidas e limita a 10 de até 30 caracteres
CREATE OR REPLACE FUNCTION public.limpar_tags_anotacao(p_tags text[])
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(array_agg(t ORDER BY ord), '{}') FROM (
    SELECT DISTINCT ON (lower(t)) t, ord FROM (
      SELECT left(btrim(x), 30) AS t, ord FROM unnest(coalesce(p_tags, '{}')) WITH ORDINALITY AS u(x, ord)
    ) a WHERE t <> '' ORDER BY lower(t), ord
  ) b;
$$;

CREATE OR REPLACE FUNCTION public.salvar_anotacao(p_id uuid, p_id_empresa uuid, p_titulo text, p_conteudo text, p_categoria text, p_tags text[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.anotacoes;
  v_id uuid;
  v_tags text[] := public.limpar_tags_anotacao(p_tags);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login.' USING ERRCODE = '42501'; END IF;
  IF p_categoria IS NULL OR p_categoria NOT IN ('pessoal', 'empresa', 'ideias', 'reunioes', 'outras') THEN RAISE EXCEPTION 'Categoria inválida.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(btrim(coalesce(p_titulo, ''))) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Informe o título (2 a 120 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(btrim(coalesce(p_conteudo, ''))) NOT BETWEEN 1 AND 20000 THEN RAISE EXCEPTION 'Informe o conteúdo (até 20.000 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  IF cardinality(v_tags) > 10 THEN RAISE EXCEPTION 'Use no máximo 10 tags.' USING ERRCODE = 'check_violation'; END IF;
  IF p_id IS NULL THEN
    IF NOT public.e_equipe_anotacoes(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso a esta empresa.' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.anotacoes (id_empresa, titulo, conteudo, categoria, tags, criado_por, atualizado_por)
    VALUES (p_id_empresa, btrim(p_titulo), btrim(p_conteudo, E' \t\r\n'), p_categoria, v_tags, auth.uid(), auth.uid()) RETURNING id INTO v_id;
  ELSE
    SELECT * INTO a FROM public.anotacoes WHERE id = p_id AND excluido_em IS NULL FOR UPDATE;
    IF a.id IS NULL OR NOT public.pode_editar_anotacao(a.id_empresa, a.categoria, a.criado_por) THEN RAISE EXCEPTION 'Anotação não encontrada.' USING ERRCODE = '42501'; END IF;
    -- só o autor torna uma anotação "pessoal" (ou a tira de pessoal): evita sequestrar/expor nota alheia
    IF (p_categoria = 'pessoal' OR a.categoria = 'pessoal') AND a.criado_por IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Anotação não encontrada.' USING ERRCODE = '42501'; END IF;
    UPDATE public.anotacoes SET titulo = btrim(p_titulo), conteudo = btrim(p_conteudo, E' \t\r\n'), categoria = p_categoria, tags = v_tags, atualizado_por = auth.uid(), atualizado_em = now()
     WHERE id = p_id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
EXCEPTION WHEN check_violation THEN
  IF SQLERRM LIKE 'Informe%' OR SQLERRM LIKE 'Use no máximo%' OR SQLERRM = 'Categoria inválida.' THEN RAISE; END IF;
  RAISE EXCEPTION 'Dados da anotação inválidos.' USING ERRCODE = 'check_violation';
END;
$$;

-- Fixar/desafixar não altera a "última atualização" exibida (só a ordem)
CREATE OR REPLACE FUNCTION public.alternar_fixacao_anotacao(p_id uuid, p_fixada boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.anotacoes;
BEGIN
  SELECT * INTO a FROM public.anotacoes WHERE id = p_id AND excluido_em IS NULL FOR UPDATE;
  IF a.id IS NULL OR NOT public.pode_editar_anotacao(a.id_empresa, a.categoria, a.criado_por) THEN RAISE EXCEPTION 'Anotação não encontrada.' USING ERRCODE = '42501'; END IF;
  UPDATE public.anotacoes SET fixada = coalesce(p_fixada, false) WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_anotacao(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.anotacoes;
BEGIN
  SELECT * INTO a FROM public.anotacoes WHERE id = p_id AND excluido_em IS NULL FOR UPDATE;
  IF a.id IS NULL OR NOT public.pode_editar_anotacao(a.id_empresa, a.categoria, a.criado_por) THEN RAISE EXCEPTION 'Anotação não encontrada.' USING ERRCODE = '42501'; END IF;
  UPDATE public.anotacoes SET excluido_em = now(), excluido_por = auth.uid() WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.e_equipe_anotacoes(uuid), public.pode_ver_anotacao(uuid, text, uuid), public.pode_editar_anotacao(uuid, text, uuid), public.limpar_tags_anotacao(text[]),
  public.salvar_anotacao(uuid, uuid, text, text, text, text[]), public.alternar_fixacao_anotacao(uuid, boolean), public.excluir_anotacao(uuid) FROM PUBLIC, anon;
-- A política de leitura chama pode_ver_anotacao com o papel do usuário; as funções públicas são só as três de escrita
GRANT EXECUTE ON FUNCTION public.pode_ver_anotacao(uuid, text, uuid), public.salvar_anotacao(uuid, uuid, text, text, text, text[]),
  public.alternar_fixacao_anotacao(uuid, boolean), public.excluir_anotacao(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.e_equipe_anotacoes(uuid), public.pode_editar_anotacao(uuid, text, uuid), public.limpar_tags_anotacao(text[]) FROM authenticated;
NOTIFY pgrst, 'reload schema';
