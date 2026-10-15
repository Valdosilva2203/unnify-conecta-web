-- Certidões da empresa (dentro de Documentos): cadastro com PDF, validade, versões e histórico, alertas de vencimento.
--   * Tabelas: certidoes_empresa (dados ATUAIS), versoes_certidoes (cada PDF enviado; nunca apagadas), historico_certidoes.
--   * Arquivos: bucket PRIVADO "certidoes" (<empresa>/<uuid>.pdf, até 10 MB). Leitura só de arquivo registrado e visível.
--   * Acesso: dono/sócio; contador com vínculo ATIVO e a nova permissão "gerenciar_certidoes" (gerencia) ou "ver_documentos" (só vê).
--     Admin Master sem acesso. Escrita só pelas funções abaixo (SECURITY DEFINER, conferem a permissão a cada chamada).
--   * Alertas (30 dias, 7 dias, vencida) pela notificar_usuario existente, uma vez por nível e por validade.
-- Nada é apagado nem alterado em dados existentes. Reversão: rollback/20261015000048_certidoes_reverter.sql

-- 1. Nova permissão do contador
ALTER TABLE public.vinculos_contabeis DROP CONSTRAINT vinculos_contabeis_permissoes;
ALTER TABLE public.vinculos_contabeis ADD CONSTRAINT vinculos_contabeis_permissoes CHECK (permissoes <@ ARRAY['ver_dados_cadastrais', 'ver_documentos', 'enviar_documentos',
  'ver_financeiro', 'gerenciar_obrigacoes', 'ver_folha', 'ver_comprovantes_financeiros', 'exportar_financeiro', 'gerenciar_financeiro', 'gerenciar_impostos', 'gerenciar_agenda',
  'gerenciar_certidoes']);
ALTER TABLE public.convites_vinculos DROP CONSTRAINT convites_permissoes;
ALTER TABLE public.convites_vinculos ADD CONSTRAINT convites_permissoes CHECK (permissoes <@ ARRAY['ver_dados_cadastrais', 'ver_documentos', 'enviar_documentos',
  'ver_financeiro', 'gerenciar_obrigacoes', 'ver_folha', 'ver_comprovantes_financeiros', 'exportar_financeiro', 'gerenciar_financeiro', 'gerenciar_impostos', 'gerenciar_agenda',
  'gerenciar_certidoes']);

CREATE OR REPLACE FUNCTION public.pode_gerenciar_certidoes(p_id_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_id_empresa IS NOT NULL AND (public.e_gestor_empresa(p_id_empresa) OR public.contador_pode(p_id_empresa, 'gerenciar_certidoes'));
$$;
CREATE OR REPLACE FUNCTION public.pode_ver_certidoes(p_id_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.pode_gerenciar_certidoes(p_id_empresa) OR (p_id_empresa IS NOT NULL AND public.contador_pode(p_id_empresa, 'ver_documentos'));
$$;

-- 2. Tabelas
CREATE TABLE public.certidoes_empresa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  tipo text NOT NULL,
  nome text NOT NULL,
  orgao_emissor text NOT NULL,
  resultado text,
  data_emissao date NOT NULL,
  data_validade date,
  codigo_controle text,
  observacoes text,
  versao_atual integer NOT NULL DEFAULT 1,
  alerta_enviado text,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  arquivada_em timestamptz,
  arquivada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  motivo_arquivamento text,
  CONSTRAINT certidoes_tipo CHECK (tipo IN ('federal', 'fgts', 'trabalhista', 'estadual', 'municipal', 'outra')),
  CONSTRAINT certidoes_resultado CHECK (resultado IS NULL OR resultado IN ('negativa', 'positiva_efeitos_negativa', 'positiva')),
  CONSTRAINT certidoes_textos CHECK (char_length(btrim(nome)) BETWEEN 2 AND 120 AND char_length(btrim(orgao_emissor)) BETWEEN 2 AND 120
    AND char_length(coalesce(codigo_controle, '')) <= 60 AND char_length(coalesce(observacoes, '')) <= 500 AND char_length(coalesce(motivo_arquivamento, '')) <= 500),
  CONSTRAINT certidoes_datas CHECK (data_emissao BETWEEN '2000-01-01' AND '2100-12-31' AND (data_validade IS NULL OR data_validade BETWEEN data_emissao AND '2100-12-31')),
  CONSTRAINT certidoes_alerta CHECK (alerta_enviado IS NULL OR alerta_enviado IN ('30', '7', 'vencida')),
  CONSTRAINT certidoes_versao CHECK (versao_atual >= 1),
  CONSTRAINT certidoes_arquivada CHECK ((arquivada_em IS NULL) = (arquivada_por IS NULL))
);
CREATE INDEX idx_certidoes_empresa ON public.certidoes_empresa (id_empresa, data_validade) WHERE arquivada_em IS NULL;

CREATE TABLE public.versoes_certidoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_certidao uuid NOT NULL REFERENCES public.certidoes_empresa(id) ON DELETE RESTRICT,
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  numero integer NOT NULL,
  caminho text NOT NULL UNIQUE,
  nome_arquivo text NOT NULL,
  tamanho bigint NOT NULL,
  data_emissao date NOT NULL,
  data_validade date,
  codigo_controle text,
  resultado text,
  enviado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT versoes_certidoes_numero UNIQUE (id_certidao, numero),
  CONSTRAINT versoes_certidoes_nome CHECK (char_length(nome_arquivo) BETWEEN 1 AND 200),
  CONSTRAINT versoes_certidoes_tamanho CHECK (tamanho > 0 AND tamanho <= 10485760)
);
CREATE INDEX idx_versoes_certidoes ON public.versoes_certidoes (id_certidao, numero DESC);

CREATE TABLE public.historico_certidoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_certidao uuid NOT NULL REFERENCES public.certidoes_empresa(id) ON DELETE RESTRICT,
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  acao text NOT NULL,
  dados jsonb,
  id_usuario uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historico_certidoes_acao CHECK (acao IN ('cadastrada', 'atualizada', 'nova_versao', 'arquivada', 'alerta_vencimento'))
);
CREATE INDEX idx_historico_certidoes ON public.historico_certidoes (id_certidao, criado_em);

-- Situação calculada (nunca gravada): sem validade, válida, vencendo (até 30 dias), vencida
CREATE VIEW public.certidoes_situacao WITH (security_invoker = true) AS
  SELECT c.*,
    CASE WHEN c.data_validade IS NULL THEN 'sem_validade' WHEN c.data_validade < public.hoje_brasil() THEN 'vencida'
         WHEN c.data_validade <= public.hoje_brasil() + 30 THEN 'vencendo' ELSE 'valida' END AS situacao,
    (c.data_validade - public.hoje_brasil()) AS dias_para_vencer,
    (SELECT v.caminho FROM public.versoes_certidoes v WHERE v.id_certidao = c.id AND v.numero = c.versao_atual) AS caminho,
    (SELECT v.nome_arquivo FROM public.versoes_certidoes v WHERE v.id_certidao = c.id AND v.numero = c.versao_atual) AS nome_arquivo,
    (SELECT v.tamanho FROM public.versoes_certidoes v WHERE v.id_certidao = c.id AND v.numero = c.versao_atual) AS tamanho
  FROM public.certidoes_empresa c;

-- 3. RLS: leitura por quem pode ver; nenhuma escrita direta
ALTER TABLE public.certidoes_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.versoes_certidoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_certidoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certidoes_empresa, public.versoes_certidoes, public.historico_certidoes, public.certidoes_situacao FROM anon, authenticated;
GRANT SELECT ON public.certidoes_empresa, public.versoes_certidoes, public.historico_certidoes, public.certidoes_situacao TO authenticated;
CREATE POLICY "Certidões: empresa e contador autorizado" ON public.certidoes_empresa FOR SELECT TO authenticated USING (public.pode_ver_certidoes(id_empresa));
CREATE POLICY "Versões de certidões: empresa e contador autorizado" ON public.versoes_certidoes FOR SELECT TO authenticated USING (public.pode_ver_certidoes(id_empresa));
CREATE POLICY "Histórico de certidões: empresa e contador autorizado" ON public.historico_certidoes FOR SELECT TO authenticated USING (public.pode_ver_certidoes(id_empresa));

-- 4. Storage privado
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('certidoes', 'certidoes', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.caminho_certidao_valido(p_nome text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(p_nome ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$', false);
$$;
-- Ler: versão registrada visível ao usuário; ou o próprio envio ainda não registrado (para conferência/descarte)
CREATE OR REPLACE FUNCTION public.pode_ler_arquivo_certidao(p_nome text, p_dono text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.versoes_certidoes v WHERE v.caminho = p_nome AND public.pode_ver_certidoes(v.id_empresa))
      OR (p_dono = auth.uid()::text AND NOT EXISTS (SELECT 1 FROM public.versoes_certidoes v WHERE v.caminho = p_nome));
$$;
CREATE OR REPLACE FUNCTION public.pode_descartar_arquivo_certidao(p_nome text, p_dono text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_dono = auth.uid()::text AND NOT EXISTS (SELECT 1 FROM public.versoes_certidoes v WHERE v.caminho = p_nome);
$$;
CREATE POLICY "Certidões: envio" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'certidoes' AND public.caminho_certidao_valido(name) AND public.pode_gerenciar_certidoes(public.uuid_ou_nulo((storage.foldername(name))[1])));
CREATE POLICY "Certidões: leitura" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'certidoes' AND public.pode_ler_arquivo_certidao(name, owner_id));
-- Remover: só o PRÓPRIO envio que não chegou a ser registrado (versões registradas nunca são apagadas)
CREATE POLICY "Certidões: descarte de envio não registrado" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'certidoes' AND public.pode_descartar_arquivo_certidao(name, owner_id));

-- 5. Notificações (reaproveita notificar_usuario): para quem gerencia certidões, exceto quem agiu (p_excluir; nos alertas, ninguém é excluído)
CREATE OR REPLACE FUNCTION public.notificar_certidoes(p_id_empresa uuid, p_titulo text, p_mensagem text, p_excluir uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid;
BEGIN
  FOR u IN SELECT ue.id_usuario FROM public.usuarios_empresas ue WHERE ue.id_empresa = p_id_empresa AND ue.ativo AND ue.tipo_vinculacao IN ('dono', 'socio')
             AND ue.id_usuario IS DISTINCT FROM p_excluir LOOP
    PERFORM public.notificar_usuario(u, 'certidoes', p_titulo, p_mensagem, '/app/documentos#certidoes', false);
  END LOOP;
  FOR u IN SELECT v.id_contador FROM public.vinculos_contabeis v WHERE v.id_empresa = p_id_empresa AND v.status = 'ativo' AND 'gerenciar_certidoes' = ANY (v.permissoes)
             AND v.id_contador IS DISTINCT FROM p_excluir LOOP
    PERFORM public.notificar_usuario(u, 'certidoes', p_titulo, p_mensagem, '/contador/empresas/' || p_id_empresa || '/documentos#certidoes', false);
  END LOOP;
END;
$$;

-- 6. Cadastrar / atualizar (com PDF novo = nova versão). O arquivo precisa já estar no bucket, enviado pelo próprio usuário.
CREATE OR REPLACE FUNCTION public.salvar_certidao(p_id uuid, p_id_empresa uuid, p_tipo text, p_nome text, p_orgao text, p_resultado text,
  p_emissao date, p_validade date, p_codigo text, p_observacoes text, p_caminho text, p_nome_arquivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.certidoes_empresa;
  v_empresa uuid := p_id_empresa;
  v_id uuid;
  v_obj record;
  v_versao integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login.' USING ERRCODE = '42501'; END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO c FROM public.certidoes_empresa WHERE id = p_id FOR UPDATE;
    IF c.id IS NULL OR NOT public.pode_gerenciar_certidoes(c.id_empresa) THEN RAISE EXCEPTION 'Certidão não encontrada.' USING ERRCODE = '42501'; END IF;
    IF c.arquivada_em IS NOT NULL THEN RAISE EXCEPTION 'Certidão arquivada não pode ser alterada.' USING ERRCODE = 'check_violation'; END IF;
    v_empresa := c.id_empresa; -- a empresa nunca muda
  ELSIF NOT public.pode_gerenciar_certidoes(v_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para gerenciar as certidões desta empresa.' USING ERRCODE = '42501';
  ELSIF p_caminho IS NULL THEN
    RAISE EXCEPTION 'Envie o PDF da certidão.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_emissao IS NULL OR p_emissao > public.hoje_brasil() + 1 THEN RAISE EXCEPTION 'Data de emissão inválida.' USING ERRCODE = 'check_violation'; END IF;
  IF p_validade IS NOT NULL AND p_validade < p_emissao THEN RAISE EXCEPTION 'A validade não pode ser anterior à emissão.' USING ERRCODE = 'check_violation'; END IF;
  IF p_caminho IS NOT NULL THEN
    IF NOT public.caminho_certidao_valido(p_caminho) OR split_part(p_caminho, '/', 1) <> v_empresa::text THEN RAISE EXCEPTION 'Arquivo inválido.' USING ERRCODE = 'check_violation'; END IF;
    SELECT o.metadata ->> 'mimetype' AS tipo, (o.metadata ->> 'size')::bigint AS tamanho, o.owner_id INTO v_obj FROM storage.objects o WHERE o.bucket_id = 'certidoes' AND o.name = p_caminho;
    IF v_obj.tipo IS DISTINCT FROM 'application/pdf' OR v_obj.owner_id IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'Arquivo não encontrado.' USING ERRCODE = 'check_violation'; END IF;
    IF EXISTS (SELECT 1 FROM public.versoes_certidoes WHERE caminho = p_caminho) THEN RAISE EXCEPTION 'Arquivo já registrado.' USING ERRCODE = 'check_violation'; END IF;
  END IF;
  BEGIN
    IF p_id IS NULL THEN
      INSERT INTO public.certidoes_empresa (id_empresa, tipo, nome, orgao_emissor, resultado, data_emissao, data_validade, codigo_controle, observacoes, criado_por, atualizado_por)
      VALUES (v_empresa, p_tipo, btrim(p_nome), btrim(p_orgao), p_resultado, p_emissao, p_validade, nullif(upper(btrim(coalesce(p_codigo, ''))), ''),
              nullif(btrim(coalesce(p_observacoes, '')), ''), auth.uid(), auth.uid())
      RETURNING id, versao_atual INTO v_id, v_versao;
    ELSE
      v_versao := c.versao_atual + CASE WHEN p_caminho IS NOT NULL THEN 1 ELSE 0 END;
      UPDATE public.certidoes_empresa
         SET tipo = p_tipo, nome = btrim(p_nome), orgao_emissor = btrim(p_orgao), resultado = p_resultado, data_emissao = p_emissao, data_validade = p_validade,
             codigo_controle = nullif(upper(btrim(coalesce(p_codigo, ''))), ''), observacoes = nullif(btrim(coalesce(p_observacoes, '')), ''), versao_atual = v_versao,
             alerta_enviado = CASE WHEN p_validade IS DISTINCT FROM c.data_validade THEN NULL ELSE alerta_enviado END, -- nova validade: alertas recomeçam
             atualizado_por = auth.uid(), atualizado_em = now()
       WHERE id = p_id RETURNING id INTO v_id;
    END IF;
    IF p_caminho IS NOT NULL THEN
      INSERT INTO public.versoes_certidoes (id_certidao, id_empresa, numero, caminho, nome_arquivo, tamanho, data_emissao, data_validade, codigo_controle, resultado, enviado_por)
      VALUES (v_id, v_empresa, v_versao, p_caminho, left(coalesce(nullif(btrim(p_nome_arquivo), ''), 'certidao.pdf'), 200), v_obj.tamanho, p_emissao, p_validade,
              nullif(upper(btrim(coalesce(p_codigo, ''))), ''), p_resultado, auth.uid());
    END IF;
    INSERT INTO public.historico_certidoes (id_certidao, id_empresa, acao, dados, id_usuario)
    VALUES (v_id, v_empresa, CASE WHEN p_id IS NULL THEN 'cadastrada' WHEN p_caminho IS NOT NULL THEN 'nova_versao' ELSE 'atualizada' END,
            jsonb_strip_nulls(jsonb_build_object('versao', CASE WHEN p_caminho IS NOT NULL THEN v_versao END, 'validade', p_validade, 'emissao', p_emissao,
              'antes', CASE WHEN p_id IS NOT NULL THEN jsonb_build_object('validade', c.data_validade, 'emissao', c.data_emissao, 'codigo', c.codigo_controle) END)), auth.uid());
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'Dados da certidão inválidos: confira tipo, nome, órgão, datas e código.' USING ERRCODE = 'check_violation';
  END;
  IF p_caminho IS NOT NULL THEN
    PERFORM public.notificar_certidoes(v_empresa, CASE WHEN p_id IS NULL THEN 'Nova certidão disponível' ELSE 'Certidão atualizada' END,
      btrim(p_nome) || coalesce(' — válida até ' || to_char(p_validade, 'DD/MM/YYYY'), '') || '.', auth.uid());
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.arquivar_certidao(p_id uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.certidoes_empresa;
BEGIN
  SELECT * INTO c FROM public.certidoes_empresa WHERE id = p_id FOR UPDATE;
  IF c.id IS NULL OR auth.uid() IS NULL OR NOT public.pode_gerenciar_certidoes(c.id_empresa) THEN RAISE EXCEPTION 'Certidão não encontrada.' USING ERRCODE = '42501'; END IF;
  IF c.arquivada_em IS NOT NULL THEN RAISE EXCEPTION 'A certidão já está arquivada.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(btrim(coalesce(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Informe o motivo.' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.certidoes_empresa SET arquivada_em = now(), arquivada_por = auth.uid(), motivo_arquivamento = left(btrim(p_motivo), 500) WHERE id = p_id;
  INSERT INTO public.historico_certidoes (id_certidao, id_empresa, acao, dados, id_usuario)
  VALUES (p_id, c.id_empresa, 'arquivada', jsonb_build_object('motivo', left(btrim(p_motivo), 500)), auth.uid());
END;
$$;

-- 7. Alertas de vencimento: 30 dias, 7 dias e vencida — cada nível uma única vez por validade (idempotente)
CREATE OR REPLACE FUNCTION public.alertas_certidoes_interno(p_id_empresa uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record;
  v_nivel text;
  n integer := 0;
  v_ordem constant text[] := ARRAY['30', '7', 'vencida'];
BEGIN
  FOR c IN SELECT * FROM public.certidoes_empresa WHERE arquivada_em IS NULL AND data_validade IS NOT NULL AND (p_id_empresa IS NULL OR id_empresa = p_id_empresa)
             AND data_validade <= public.hoje_brasil() + 30 FOR UPDATE SKIP LOCKED LOOP
    v_nivel := CASE WHEN c.data_validade < public.hoje_brasil() THEN 'vencida' WHEN c.data_validade <= public.hoje_brasil() + 7 THEN '7' ELSE '30' END;
    CONTINUE WHEN c.alerta_enviado IS NOT NULL AND array_position(v_ordem, c.alerta_enviado) >= array_position(v_ordem, v_nivel);
    UPDATE public.certidoes_empresa SET alerta_enviado = v_nivel WHERE id = c.id;
    INSERT INTO public.historico_certidoes (id_certidao, id_empresa, acao, dados) VALUES (c.id, c.id_empresa, 'alerta_vencimento', jsonb_build_object('nivel', v_nivel));
    PERFORM public.notificar_certidoes(c.id_empresa, CASE WHEN v_nivel = 'vencida' THEN 'Certidão vencida' ELSE 'Certidão perto do vencimento' END,
      coalesce(public.nome_da_empresa(c.id_empresa) || ': ', '') || c.nome || CASE WHEN v_nivel = 'vencida' THEN ' venceu em ' ELSE ' vence em ' END
        || to_char(c.data_validade, 'DD/MM/YYYY') || '. Providencie a renovação.', NULL);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
-- Ao abrir a tela (quem pode ver a empresa) e pelo agendamento (só service_role)
CREATE OR REPLACE FUNCTION public.verificar_alertas_certidoes(p_id_empresa uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_ver_certidoes(p_id_empresa) THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE = '42501'; END IF;
  RETURN public.alertas_certidoes_interno(p_id_empresa);
END;
$$;
CREATE OR REPLACE FUNCTION public.processar_alertas_certidoes()
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT public.alertas_certidoes_interno(NULL); $$;

CREATE OR REPLACE FUNCTION public.resumo_certidoes(p_id_empresa uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_ver_certidoes(p_id_empresa) THEN RAISE EXCEPTION 'Sem permissão.' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT jsonb_build_object('total', count(*), 'validas', count(*) FILTER (WHERE situacao = 'valida'), 'vencendo', count(*) FILTER (WHERE situacao = 'vencendo'),
            'vencidas', count(*) FILTER (WHERE situacao = 'vencida'), 'sem_validade', count(*) FILTER (WHERE situacao = 'sem_validade'))
          FROM public.certidoes_situacao WHERE id_empresa = p_id_empresa AND arquivada_em IS NULL);
END;
$$;

-- 8. Permissões de execução
REVOKE ALL ON FUNCTION public.pode_gerenciar_certidoes(uuid), public.pode_ver_certidoes(uuid), public.caminho_certidao_valido(text),
  public.pode_ler_arquivo_certidao(text, text), public.pode_descartar_arquivo_certidao(text, text), public.notificar_certidoes(uuid, text, text, uuid),
  public.salvar_certidao(uuid, uuid, text, text, text, text, date, date, text, text, text, text), public.arquivar_certidao(uuid, text),
  public.alertas_certidoes_interno(uuid), public.verificar_alertas_certidoes(uuid), public.processar_alertas_certidoes(), public.resumo_certidoes(uuid) FROM PUBLIC, anon;
-- Internas: nem usuário logado executa (o Supabase concede EXECUTE por padrão a funções novas)
REVOKE ALL ON FUNCTION public.notificar_certidoes(uuid, text, text, uuid), public.alertas_certidoes_interno(uuid), public.processar_alertas_certidoes() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pode_gerenciar_certidoes(uuid), public.pode_ver_certidoes(uuid), public.caminho_certidao_valido(text),
  public.pode_ler_arquivo_certidao(text, text), public.pode_descartar_arquivo_certidao(text, text),
  public.salvar_certidao(uuid, uuid, text, text, text, text, date, date, text, text, text, text), public.arquivar_certidao(uuid, text),
  public.verificar_alertas_certidoes(uuid), public.resumo_certidoes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.processar_alertas_certidoes() TO service_role;

NOTIFY pgrst, 'reload schema';
