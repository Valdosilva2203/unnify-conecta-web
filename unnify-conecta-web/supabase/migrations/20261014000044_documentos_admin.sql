-- Documentos administrativos (somente Admin Master ativo). Gerenciador privado: pastas, arquivos, versões e auditoria.
--   * Arquivos no bucket privado "documentos-admin". Envio em "envios/<uuid>.<ext>"; o registro passa pela rota do servidor
--     (/api/admin/documentos), que baixa o arquivo com a sessão do usuário, confere o tipo real (assinatura do arquivo),
--     tamanho e calcula o SHA-256 antes de chamar as funções abaixo. Sem service_role.
--   * Versões são imutáveis: original (v1) preservado; edição = nova versão. Arquivo registrado não é removido nem
--     sobrescrito (sem UPDATE/DELETE no storage para arquivos registrados). Concorrência: nova versão exige a versão base atual.
--   * PDF assinado (ou documento marcado como protegido): nova versão só com confirmação explícita (pode invalidar assinatura).
--   * Exclusão é lógica (lixeira), com confirmação e auditoria; nada é apagado do storage.
-- Reversão: rollback/20261014000044_documentos_admin_reverter.sql

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documentos-admin', 'documentos-admin', false, 26214400, ARRAY[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/csv', 'application/zip', 'application/x-zip-compressed',
  'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet'])
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.pastas_documentos_admin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 2 AND 80),
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pastas_documentos_admin_nome ON public.pastas_documentos_admin (lower(btrim(nome)));

CREATE TABLE public.documentos_admin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_pasta uuid REFERENCES public.pastas_documentos_admin(id) ON DELETE RESTRICT,
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 1 AND 200 AND nome !~ '[\\/<>:"|?*]'),
  extensao text NOT NULL CHECK (extensao ~ '^[a-z0-9]{2,5}$'),
  tipo_mime text NOT NULL,
  versao_atual integer NOT NULL DEFAULT 1,
  tamanho_atual bigint NOT NULL,
  assinado boolean NOT NULL DEFAULT false,  -- PDF com assinatura digital detectada no envio
  protegido boolean NOT NULL DEFAULT false, -- marcado como fiscal/assinado: edição só com confirmação
  excluido_em timestamptz,
  excluido_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_documentos_admin_pasta ON public.documentos_admin (id_pasta, atualizado_em DESC) WHERE excluido_em IS NULL;

CREATE TABLE public.versoes_documentos_admin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_documento uuid NOT NULL REFERENCES public.documentos_admin(id) ON DELETE RESTRICT,
  numero integer NOT NULL CHECK (numero >= 1),
  caminho text NOT NULL UNIQUE CHECK (caminho ~ '^envios/[0-9a-f-]{36}\.[a-z0-9]{2,5}$'),
  tamanho bigint NOT NULL CHECK (tamanho > 0 AND tamanho <= 26214400),
  tipo_mime text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  origem text NOT NULL CHECK (origem IN ('upload', 'edicao')),
  observacao text CHECK (observacao IS NULL OR char_length(observacao) <= 300),
  assinado boolean NOT NULL DEFAULT false,
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT versoes_documentos_admin_numero UNIQUE (id_documento, numero)
);

CREATE TABLE public.historico_documentos_admin (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_documento uuid REFERENCES public.documentos_admin(id) ON DELETE RESTRICT,
  id_pasta uuid REFERENCES public.pastas_documentos_admin(id) ON DELETE SET NULL,
  acao text NOT NULL CHECK (acao IN ('pasta_criada', 'pasta_renomeada', 'pasta_excluida', 'enviado', 'nova_versao', 'renomeado', 'movido',
                                     'protecao', 'excluido', 'restaurado', 'download')),
  dados jsonb,
  id_usuario uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_historico_documentos_admin ON public.historico_documentos_admin (id_documento, criado_em DESC);

-- Versões nunca mudam nem somem
CREATE OR REPLACE FUNCTION public.proteger_versao_documento_admin()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Versões de documentos não podem ser alteradas nem excluídas.' USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER proteger_versao_documento_admin BEFORE UPDATE OR DELETE ON public.versoes_documentos_admin FOR EACH ROW EXECUTE FUNCTION public.proteger_versao_documento_admin();

ALTER TABLE public.pastas_documentos_admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.versoes_documentos_admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_documentos_admin ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pastas_documentos_admin, public.documentos_admin, public.versoes_documentos_admin, public.historico_documentos_admin FROM anon, authenticated;
GRANT SELECT ON public.pastas_documentos_admin, public.documentos_admin, public.versoes_documentos_admin, public.historico_documentos_admin TO authenticated;
CREATE POLICY "Pastas administrativas: Admin Master" ON public.pastas_documentos_admin FOR SELECT TO authenticated USING (public.admin_master_ativo());
CREATE POLICY "Documentos administrativos: Admin Master" ON public.documentos_admin FOR SELECT TO authenticated USING (public.admin_master_ativo());
CREATE POLICY "Versões administrativas: Admin Master" ON public.versoes_documentos_admin FOR SELECT TO authenticated USING (public.admin_master_ativo());
CREATE POLICY "Histórico administrativo: Admin Master" ON public.historico_documentos_admin FOR SELECT TO authenticated USING (public.admin_master_ativo());

-- Storage: Admin Master lê e envia; só pode remover envio ainda NÃO registrado (arquivo recusado na validação)
CREATE POLICY "Documentos admin: leitura" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documentos-admin' AND public.admin_master_ativo());
CREATE POLICY "Documentos admin: envio" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documentos-admin' AND public.admin_master_ativo() AND name ~ '^envios/[0-9a-f-]{36}\.[a-z0-9]{2,5}$');
CREATE POLICY "Documentos admin: descarte de envio não registrado" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documentos-admin' AND public.admin_master_ativo()
         AND NOT EXISTS (SELECT 1 FROM public.versoes_documentos_admin v WHERE v.caminho = storage.objects.name));

CREATE OR REPLACE FUNCTION public.exigir_admin_master()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.admin_master_ativo() THEN RAISE EXCEPTION 'Acesso restrito ao Admin Master.' USING ERRCODE = '42501'; END IF;
END;
$$;

-- Confere que o arquivo existe no bucket e tem o tamanho informado (integridade básica do registro)
CREATE OR REPLACE FUNCTION public.conferir_arquivo_documento_admin(p_caminho text, p_tamanho bigint)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tam bigint;
BEGIN
  SELECT (o.metadata->>'size')::bigint INTO v_tam FROM storage.objects o WHERE o.bucket_id = 'documentos-admin' AND o.name = p_caminho;
  IF NOT FOUND THEN RAISE EXCEPTION 'Arquivo não encontrado no armazenamento.' USING ERRCODE = 'check_violation'; END IF;
  IF v_tam IS DISTINCT FROM p_tamanho THEN RAISE EXCEPTION 'O tamanho do arquivo não confere.' USING ERRCODE = 'check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM public.versoes_documentos_admin WHERE caminho = p_caminho) THEN RAISE EXCEPTION 'Arquivo já registrado.' USING ERRCODE = '23505'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_pasta_documentos_admin(p_id uuid, p_nome text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_antigo text;
BEGIN
  PERFORM public.exigir_admin_master();
  IF char_length(btrim(coalesce(p_nome, ''))) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'Nome da pasta: 2 a 80 caracteres.' USING ERRCODE = 'check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM public.pastas_documentos_admin WHERE lower(btrim(nome)) = lower(btrim(p_nome)) AND id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'Já existe uma pasta com este nome.' USING ERRCODE = '23505';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.pastas_documentos_admin (nome, criado_por) VALUES (btrim(p_nome), auth.uid()) RETURNING id INTO v_id;
    INSERT INTO public.historico_documentos_admin (id_pasta, acao, dados, id_usuario) VALUES (v_id, 'pasta_criada', jsonb_build_object('nome', btrim(p_nome)), auth.uid());
    RETURN v_id;
  END IF;
  SELECT nome INTO v_antigo FROM public.pastas_documentos_admin WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pasta não encontrada.' USING ERRCODE = '42501'; END IF;
  UPDATE public.pastas_documentos_admin SET nome = btrim(p_nome), atualizado_em = now() WHERE id = p_id;
  INSERT INTO public.historico_documentos_admin (id_pasta, acao, dados, id_usuario) VALUES (p_id, 'pasta_renomeada', jsonb_build_object('de', v_antigo, 'para', btrim(p_nome)), auth.uid());
  RETURN p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_pasta_documentos_admin(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nome text;
BEGIN
  PERFORM public.exigir_admin_master();
  SELECT nome INTO v_nome FROM public.pastas_documentos_admin WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pasta não encontrada.' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.documentos_admin WHERE id_pasta = p_id) THEN
    RAISE EXCEPTION 'A pasta não está vazia (inclui documentos na lixeira). Mova os documentos antes.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.historico_documentos_admin (id_pasta, acao, dados, id_usuario) VALUES (p_id, 'pasta_excluida', jsonb_build_object('nome', v_nome), auth.uid());
  DELETE FROM public.pastas_documentos_admin WHERE id = p_id;
END;
$$;

-- Chamado pela rota do servidor depois de conferir tipo real, tamanho e SHA-256
CREATE OR REPLACE FUNCTION public.registrar_documento_admin(p_id_pasta uuid, p_nome text, p_extensao text, p_tipo_mime text, p_caminho text,
  p_tamanho bigint, p_sha256 text, p_assinado boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.exigir_admin_master();
  IF p_id_pasta IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.pastas_documentos_admin WHERE id = p_id_pasta) THEN RAISE EXCEPTION 'Pasta não encontrada.' USING ERRCODE = '42501'; END IF;
  PERFORM public.conferir_arquivo_documento_admin(p_caminho, p_tamanho);
  INSERT INTO public.documentos_admin (id_pasta, nome, extensao, tipo_mime, tamanho_atual, assinado, protegido, criado_por)
  VALUES (p_id_pasta, btrim(p_nome), lower(p_extensao), p_tipo_mime, p_tamanho, coalesce(p_assinado, false), coalesce(p_assinado, false), auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.versoes_documentos_admin (id_documento, numero, caminho, tamanho, tipo_mime, sha256, origem, assinado, criado_por)
  VALUES (v_id, 1, p_caminho, p_tamanho, p_tipo_mime, lower(p_sha256), 'upload', coalesce(p_assinado, false), auth.uid());
  INSERT INTO public.historico_documentos_admin (id_documento, id_pasta, acao, dados, id_usuario)
  VALUES (v_id, p_id_pasta, 'enviado', jsonb_build_object('nome', btrim(p_nome), 'tamanho', p_tamanho, 'sha256', lower(p_sha256), 'assinado', coalesce(p_assinado, false)), auth.uid());
  RETURN v_id;
END;
$$;

-- Nova versão (edição ou reenvio). p_versao_base = versão que o usuário abriu: se outra pessoa salvou antes, recusa.
CREATE OR REPLACE FUNCTION public.registrar_versao_documento_admin(p_id_documento uuid, p_versao_base integer, p_caminho text, p_tamanho bigint,
  p_sha256 text, p_tipo_mime text, p_origem text, p_observacao text, p_assinado boolean, p_confirmar_protegido boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.documentos_admin; v_num integer;
BEGIN
  PERFORM public.exigir_admin_master();
  SELECT * INTO d FROM public.documentos_admin WHERE id = p_id_documento FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Documento não encontrado.' USING ERRCODE = '42501'; END IF;
  IF d.excluido_em IS NOT NULL THEN RAISE EXCEPTION 'Restaure o documento antes de criar uma nova versão.' USING ERRCODE = 'check_violation'; END IF;
  IF p_versao_base IS DISTINCT FROM d.versao_atual THEN
    RAISE EXCEPTION 'Este documento foi alterado por outra pessoa (versão atual: v%). Reabra antes de salvar.', d.versao_atual USING ERRCODE = '40001';
  END IF;
  IF (d.protegido OR d.assinado) AND NOT coalesce(p_confirmar_protegido, false) THEN
    RAISE EXCEPTION 'Documento assinado/protegido: confirme que a nova versão pode invalidar a assinatura.' USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(p_origem, '') NOT IN ('upload', 'edicao') THEN RAISE EXCEPTION 'Origem inválida.' USING ERRCODE = 'check_violation'; END IF;
  PERFORM public.conferir_arquivo_documento_admin(p_caminho, p_tamanho);
  v_num := d.versao_atual + 1;
  INSERT INTO public.versoes_documentos_admin (id_documento, numero, caminho, tamanho, tipo_mime, sha256, origem, observacao, assinado, criado_por)
  VALUES (d.id, v_num, p_caminho, p_tamanho, p_tipo_mime, lower(p_sha256), p_origem, nullif(btrim(coalesce(p_observacao, '')), ''), coalesce(p_assinado, false), auth.uid());
  UPDATE public.documentos_admin SET versao_atual = v_num, tamanho_atual = p_tamanho, tipo_mime = p_tipo_mime, atualizado_em = now() WHERE id = d.id;
  INSERT INTO public.historico_documentos_admin (id_documento, id_pasta, acao, dados, id_usuario)
  VALUES (d.id, d.id_pasta, 'nova_versao', jsonb_build_object('versao', v_num, 'origem', p_origem, 'sha256', lower(p_sha256), 'base_assinada', d.assinado OR d.protegido), auth.uid());
  RETURN v_num;
END;
$$;

CREATE OR REPLACE FUNCTION public.atualizar_documento_admin(p_id uuid, p_nome text, p_id_pasta uuid, p_protegido boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.documentos_admin;
BEGIN
  PERFORM public.exigir_admin_master();
  SELECT * INTO d FROM public.documentos_admin WHERE id = p_id FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Documento não encontrado.' USING ERRCODE = '42501'; END IF;
  IF char_length(btrim(coalesce(p_nome, ''))) NOT BETWEEN 1 AND 200 OR p_nome ~ '[\\/<>:"|?*]' THEN RAISE EXCEPTION 'Nome inválido (sem \ / < > : " | ? *).' USING ERRCODE = 'check_violation'; END IF;
  IF p_id_pasta IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.pastas_documentos_admin WHERE id = p_id_pasta) THEN RAISE EXCEPTION 'Pasta não encontrada.' USING ERRCODE = '42501'; END IF;
  IF d.assinado AND NOT coalesce(p_protegido, true) THEN RAISE EXCEPTION 'PDF com assinatura digital continua protegido.' USING ERRCODE = 'check_violation'; END IF;
  IF d.nome <> btrim(p_nome) THEN
    INSERT INTO public.historico_documentos_admin (id_documento, id_pasta, acao, dados, id_usuario) VALUES (d.id, d.id_pasta, 'renomeado', jsonb_build_object('de', d.nome, 'para', btrim(p_nome)), auth.uid());
  END IF;
  IF d.id_pasta IS DISTINCT FROM p_id_pasta THEN
    INSERT INTO public.historico_documentos_admin (id_documento, id_pasta, acao, dados, id_usuario) VALUES (d.id, p_id_pasta, 'movido', jsonb_build_object('de', d.id_pasta, 'para', p_id_pasta), auth.uid());
  END IF;
  IF d.protegido IS DISTINCT FROM coalesce(p_protegido, d.protegido) THEN
    INSERT INTO public.historico_documentos_admin (id_documento, id_pasta, acao, dados, id_usuario) VALUES (d.id, d.id_pasta, 'protecao', jsonb_build_object('protegido', p_protegido), auth.uid());
  END IF;
  UPDATE public.documentos_admin SET nome = btrim(p_nome), id_pasta = p_id_pasta, protegido = coalesce(p_protegido, protegido), atualizado_em = now() WHERE id = d.id;
END;
$$;

-- Lixeira: exclusão lógica (arquivos e versões preservados) e restauração
CREATE OR REPLACE FUNCTION public.excluir_documento_admin(p_id uuid, p_restaurar boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.documentos_admin;
BEGIN
  PERFORM public.exigir_admin_master();
  SELECT * INTO d FROM public.documentos_admin WHERE id = p_id FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Documento não encontrado.' USING ERRCODE = '42501'; END IF;
  IF coalesce(p_restaurar, false) THEN
    IF d.excluido_em IS NULL THEN RAISE EXCEPTION 'O documento não está na lixeira.' USING ERRCODE = 'check_violation'; END IF;
    UPDATE public.documentos_admin SET excluido_em = NULL, excluido_por = NULL, atualizado_em = now() WHERE id = d.id;
    INSERT INTO public.historico_documentos_admin (id_documento, id_pasta, acao, id_usuario) VALUES (d.id, d.id_pasta, 'restaurado', auth.uid());
  ELSE
    IF d.excluido_em IS NOT NULL THEN RAISE EXCEPTION 'O documento já está na lixeira.' USING ERRCODE = 'check_violation'; END IF;
    UPDATE public.documentos_admin SET excluido_em = now(), excluido_por = auth.uid() WHERE id = d.id;
    INSERT INTO public.historico_documentos_admin (id_documento, id_pasta, acao, dados, id_usuario) VALUES (d.id, d.id_pasta, 'excluido', jsonb_build_object('nome', d.nome), auth.uid());
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_download_documento_admin(p_id_documento uuid, p_versao integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.exigir_admin_master();
  IF NOT EXISTS (SELECT 1 FROM public.versoes_documentos_admin WHERE id_documento = p_id_documento AND numero = p_versao) THEN RAISE EXCEPTION 'Versão não encontrada.' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.historico_documentos_admin (id_documento, acao, dados, id_usuario) VALUES (p_id_documento, 'download', jsonb_build_object('versao', p_versao), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.resumo_documentos_admin()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.exigir_admin_master();
  RETURN jsonb_build_object(
    'documentos', (SELECT count(*) FROM public.documentos_admin WHERE excluido_em IS NULL),
    'novos_mes', (SELECT count(*) FROM public.documentos_admin WHERE excluido_em IS NULL AND (criado_em AT TIME ZONE 'America/Sao_Paulo')::date >= date_trunc('month', public.hoje_brasil())::date),
    'lixeira', (SELECT count(*) FROM public.documentos_admin WHERE excluido_em IS NOT NULL),
    'pastas', (SELECT count(*) FROM public.pastas_documentos_admin),
    'bytes', (SELECT coalesce(sum(tamanho), 0) FROM public.versoes_documentos_admin),
    'versoes', (SELECT count(*) FROM public.versoes_documentos_admin),
    'ultima_atualizacao', (SELECT max(atualizado_em) FROM public.documentos_admin WHERE excluido_em IS NULL));
END;
$$;

CREATE OR REPLACE FUNCTION public.buscar_documentos_admin(p_id_pasta uuid DEFAULT NULL, p_busca text DEFAULT NULL, p_extensao text DEFAULT NULL,
  p_ordem text DEFAULT 'recentes', p_lixeira boolean DEFAULT false, p_limite integer DEFAULT 10, p_deslocamento integer DEFAULT 0)
RETURNS TABLE (id uuid, id_pasta uuid, pasta text, nome text, extensao text, tipo_mime text, versao_atual integer, tamanho_atual bigint, assinado boolean,
               protegido boolean, atualizado_em timestamptz, criado_em timestamptz, excluido_em timestamptz, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b text := nullif(btrim(coalesce(p_busca, '')), '');
BEGIN
  PERFORM public.exigir_admin_master();
  RETURN QUERY
    SELECT d.id, d.id_pasta, p.nome, d.nome, d.extensao, d.tipo_mime, d.versao_atual, d.tamanho_atual, d.assinado, d.protegido, d.atualizado_em, d.criado_em, d.excluido_em, count(*) OVER ()
      FROM public.documentos_admin d LEFT JOIN public.pastas_documentos_admin p ON p.id = d.id_pasta
     WHERE (CASE WHEN coalesce(p_lixeira, false) THEN d.excluido_em IS NOT NULL ELSE d.excluido_em IS NULL END)
       AND (p_id_pasta IS NULL OR d.id_pasta = p_id_pasta)
       AND (p_extensao IS NULL OR d.extensao = p_extensao)
       AND (b IS NULL OR d.nome ILIKE '%' || b || '%' OR p.nome ILIKE '%' || b || '%' OR d.extensao = lower(b)
            OR EXISTS (SELECT 1 FROM public.versoes_documentos_admin v WHERE v.id_documento = d.id AND v.observacao ILIKE '%' || b || '%'))
     ORDER BY CASE WHEN p_ordem = 'nome' THEN lower(d.nome) END ASC,
              CASE WHEN p_ordem = 'tamanho' THEN d.tamanho_atual END DESC,
              d.atualizado_em DESC
     LIMIT least(greatest(coalesce(p_limite, 10), 1), 100) OFFSET greatest(coalesce(p_deslocamento, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.proteger_versao_documento_admin(), public.conferir_arquivo_documento_admin(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.exigir_admin_master(), public.salvar_pasta_documentos_admin(uuid, text), public.excluir_pasta_documentos_admin(uuid),
  public.registrar_documento_admin(uuid, text, text, text, text, bigint, text, boolean),
  public.registrar_versao_documento_admin(uuid, integer, text, bigint, text, text, text, text, boolean, boolean),
  public.atualizar_documento_admin(uuid, text, uuid, boolean), public.excluir_documento_admin(uuid, boolean),
  public.registrar_download_documento_admin(uuid, integer), public.resumo_documentos_admin(),
  public.buscar_documentos_admin(uuid, text, text, text, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_pasta_documentos_admin(uuid, text), public.excluir_pasta_documentos_admin(uuid),
  public.registrar_documento_admin(uuid, text, text, text, text, bigint, text, boolean),
  public.registrar_versao_documento_admin(uuid, integer, text, bigint, text, text, text, text, boolean, boolean),
  public.atualizar_documento_admin(uuid, text, uuid, boolean), public.excluir_documento_admin(uuid, boolean),
  public.registrar_download_documento_admin(uuid, integer), public.resumo_documentos_admin(),
  public.buscar_documentos_admin(uuid, text, text, text, boolean, integer, integer) TO authenticated;
