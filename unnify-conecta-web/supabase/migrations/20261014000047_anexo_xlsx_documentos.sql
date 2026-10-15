-- Anexos de obrigações: o anexo é um documento da biblioteca (documentos_empresa) vinculado por obrigacoes_empresa.id_documento,
-- no bucket privado "documentos-empresas". A estrutura atual já suporta o vínculo; falta aceitar planilhas XLSX
-- (bucket, constraint de tipo, validação do caminho e do par extensão/tipo em registrar_documento). Nada mais muda:
-- RLS, permissões e Storage continuam os da migration 032. Reversão: rollback/20261014000047_anexo_xlsx_documentos_reverter.sql

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
 WHERE id = 'documentos-empresas';

ALTER TABLE public.documentos_empresa DROP CONSTRAINT documentos_tipo;
ALTER TABLE public.documentos_empresa ADD CONSTRAINT documentos_tipo
  CHECK (tipo_mime IN ('application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));

CREATE OR REPLACE FUNCTION public.caminho_documento_valido(p_nome text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(p_nome ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|xlsx)$', false);
$$;

CREATE OR REPLACE FUNCTION public.registrar_documento(p_id_empresa uuid, p_caminho text, p_nome text, p_categoria text, p_compartilhar boolean, p_nome_original text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_obj record;
  v_id uuid;
  v_gestor boolean;
  v_ext text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_enviar_documentos(p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para enviar documentos desta empresa.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.caminho_documento_valido(p_caminho) OR split_part(p_caminho, '/', 1) <> p_id_empresa::text THEN
    RAISE EXCEPTION 'Arquivo inválido.' USING ERRCODE = 'check_violation';
  END IF;
  -- Limite de uso: até 60 envios por pessoa por hora
  IF (SELECT count(*) FROM public.documentos_empresa WHERE enviado_por = auth.uid() AND enviado_em > now() - interval '1 hour') >= 60 THEN
    RAISE EXCEPTION 'Muitos envios em pouco tempo. Aguarde alguns minutos.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT metadata ->> 'mimetype' AS tipo, (metadata ->> 'size')::integer AS tamanho, owner_id INTO v_obj
    FROM storage.objects WHERE bucket_id = 'documentos-empresas' AND name = p_caminho;
  IF v_obj.tipo IS NULL OR v_obj.owner_id IS DISTINCT FROM auth.uid()::text THEN
    RAISE EXCEPTION 'Arquivo não encontrado.' USING ERRCODE = 'check_violation';
  END IF;
  v_ext := split_part(p_caminho, '.', 2);
  IF NOT ((v_obj.tipo = 'application/pdf' AND v_ext = 'pdf') OR (v_obj.tipo = 'image/jpeg' AND v_ext = 'jpg') OR (v_obj.tipo = 'image/png' AND v_ext = 'png')
          OR (v_obj.tipo = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' AND v_ext = 'xlsx')) THEN
    RAISE EXCEPTION 'Tipo de arquivo não permitido.' USING ERRCODE = 'check_violation';
  END IF;
  v_gestor := public.e_gestor_empresa(p_id_empresa);
  INSERT INTO public.documentos_empresa (id_empresa, nome, categoria, caminho, nome_arquivo_original, tipo_mime, tamanho, origem, compartilhado_contador, enviado_por)
  VALUES (p_id_empresa, btrim(p_nome), coalesce(p_categoria, 'outros'), p_caminho, left(coalesce(nullif(btrim(p_nome_original), ''), 'documento'), 200),
          v_obj.tipo, v_obj.tamanho, CASE WHEN v_gestor THEN 'empresa' ELSE 'contador' END,
          -- Enviado pelo contador já nasce compartilhado com o escritório; o dono decide para os próprios envios
          CASE WHEN v_gestor THEN coalesce(p_compartilhar, false) ELSE true END, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.historico_documentos (id_documento, id_empresa, acao, dados, id_usuario)
  VALUES (v_id, p_id_empresa, 'enviado', jsonb_build_object('nome', btrim(p_nome), 'categoria', p_categoria, 'tamanho', v_obj.tamanho), auth.uid());
  RETURN v_id;
EXCEPTION WHEN check_violation THEN
  IF SQLERRM LIKE 'Muitos envios%' OR SQLERRM IN ('Arquivo inválido.', 'Arquivo não encontrado.', 'Tipo de arquivo não permitido.') THEN RAISE; END IF;
  RAISE EXCEPTION 'Dados do documento inválidos: confira nome (até 150 caracteres) e categoria.' USING ERRCODE = 'check_violation';
END;
$$;

NOTIFY pgrst, 'reload schema';
