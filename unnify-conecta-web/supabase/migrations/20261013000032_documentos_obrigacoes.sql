-- E3 — Documentos e Obrigações.
-- Reaproveita o vínculo contábil e suas permissões (contador_pode: ver_documentos, enviar_documentos, gerenciar_obrigacoes),
-- e_gestor_empresa (dono/sócio) e o módulo de Tarefas (salvar_tarefa). Sem sistema de permissões paralelo.
-- Leitura por RLS; escrita SÓ por funções (SECURITY DEFINER, search_path fixo). Storage privado; download por URL temporária.
-- Admin Master/admin NÃO têm acesso a documentos, solicitações ou obrigações de empresas.
-- Independente das migrations 029–031. Reversão: rollback/20261013000032_documentos_obrigacoes_reverter.sql

-- 1. Quem pode o quê (dono/sócio OU contador com vínculo ativo + permissão explícita)
CREATE OR REPLACE FUNCTION public.pode_enviar_documentos(p_id_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_id_empresa IS NOT NULL AND (public.e_gestor_empresa(p_id_empresa) OR public.contador_pode(p_id_empresa, 'enviar_documentos'));
$$;
CREATE OR REPLACE FUNCTION public.pode_gerenciar_obrigacoes(p_id_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_id_empresa IS NOT NULL AND (public.e_gestor_empresa(p_id_empresa) OR public.contador_pode(p_id_empresa, 'gerenciar_obrigacoes'));
$$;

-- 2. Biblioteca de documentos
CREATE TABLE public.documentos_empresa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  nome text NOT NULL,
  categoria text NOT NULL DEFAULT 'outros',
  caminho text NOT NULL UNIQUE,
  nome_arquivo_original text NOT NULL,
  tipo_mime text NOT NULL,
  tamanho integer NOT NULL,
  origem text NOT NULL,
  compartilhado_contador boolean NOT NULL DEFAULT false,
  id_solicitacao uuid,
  enviado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  excluido_em timestamptz,
  excluido_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  CONSTRAINT documentos_nome CHECK (char_length(btrim(nome)) BETWEEN 1 AND 150),
  CONSTRAINT documentos_categoria CHECK (categoria IN ('contratos', 'societarios', 'fiscais', 'contabeis', 'comprovantes', 'outros')),
  CONSTRAINT documentos_tipo CHECK (tipo_mime IN ('application/pdf', 'image/jpeg', 'image/png')),
  CONSTRAINT documentos_tamanho CHECK (tamanho > 0 AND tamanho <= 10485760),
  CONSTRAINT documentos_origem CHECK (origem IN ('empresa', 'contador')),
  CONSTRAINT documentos_nome_original CHECK (char_length(nome_arquivo_original) BETWEEN 1 AND 200)
);
CREATE INDEX idx_documentos_empresa ON public.documentos_empresa (id_empresa, enviado_em DESC) WHERE excluido_em IS NULL;

CREATE TABLE public.historico_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_documento uuid NOT NULL REFERENCES public.documentos_empresa(id) ON DELETE RESTRICT,
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  acao text NOT NULL,
  dados jsonb,
  id_usuario uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historico_documentos_acao CHECK (acao IN ('enviado', 'editado', 'compartilhado', 'compartilhamento_removido', 'excluido', 'anexado_solicitacao'))
);

-- 3. Solicitações de documentos (contador → empresário)
CREATE TABLE public.solicitacoes_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  titulo text NOT NULL,
  descricao text,
  prazo date,
  status text NOT NULL DEFAULT 'pendente',
  id_solicitante uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  id_documento uuid REFERENCES public.documentos_empresa(id) ON DELETE RESTRICT,
  motivo_correcao text,
  motivo_cancelamento text,
  respondido_em timestamptz,
  respondido_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  analisado_em timestamptz,
  analisado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT solicitacoes_titulo CHECK (char_length(btrim(titulo)) BETWEEN 3 AND 150),
  CONSTRAINT solicitacoes_descricao CHECK (descricao IS NULL OR char_length(descricao) <= 2000),
  CONSTRAINT solicitacoes_status CHECK (status IN ('pendente', 'enviado', 'aceito', 'correcao_solicitada', 'cancelado')),
  CONSTRAINT solicitacoes_enviado_tem_documento CHECK (status NOT IN ('enviado', 'aceito') OR id_documento IS NOT NULL),
  CONSTRAINT solicitacoes_motivos CHECK (char_length(coalesce(motivo_correcao, '')) <= 1000 AND char_length(coalesce(motivo_cancelamento, '')) <= 1000)
);
CREATE INDEX idx_solicitacoes_empresa ON public.solicitacoes_documentos (id_empresa, status);
ALTER TABLE public.documentos_empresa
  ADD CONSTRAINT documentos_solicitacao_fk FOREIGN KEY (id_solicitacao) REFERENCES public.solicitacoes_documentos(id) ON DELETE RESTRICT;

CREATE TABLE public.historico_solicitacoes_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_solicitacao uuid NOT NULL REFERENCES public.solicitacoes_documentos(id) ON DELETE RESTRICT,
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  acao text NOT NULL,
  status_anterior text,
  status_novo text,
  dados jsonb,
  id_usuario uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- 4. Obrigações (cadastradas por usuários autorizados; nada é gerado automaticamente)
CREATE TABLE public.obrigacoes_empresa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  titulo text NOT NULL,
  descricao text,
  categoria text NOT NULL DEFAULT 'outras',
  id_responsavel uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  data_vencimento date NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  observacoes text,
  id_documento uuid REFERENCES public.documentos_empresa(id) ON DELETE RESTRICT,
  id_tarefa uuid REFERENCES public.tarefas(id) ON DELETE SET NULL,
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  concluida_em timestamptz,
  concluida_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  cancelada_em timestamptz,
  cancelada_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  motivo_cancelamento text,
  CONSTRAINT obrigacoes_titulo CHECK (char_length(btrim(titulo)) BETWEEN 3 AND 150),
  CONSTRAINT obrigacoes_textos CHECK (char_length(coalesce(descricao, '')) <= 2000 AND char_length(coalesce(observacoes, '')) <= 2000 AND char_length(coalesce(motivo_cancelamento, '')) <= 1000),
  CONSTRAINT obrigacoes_categoria CHECK (categoria IN ('fiscal', 'contabil', 'trabalhista', 'societaria', 'outras')),
  CONSTRAINT obrigacoes_status CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'cancelada')),
  CONSTRAINT obrigacoes_vencimento CHECK (data_vencimento BETWEEN '2000-01-01' AND '2100-12-31'),
  CONSTRAINT obrigacoes_concluida CHECK ((status = 'concluida') = (concluida_em IS NOT NULL)),
  CONSTRAINT obrigacoes_cancelada CHECK ((status = 'cancelada') = (cancelada_em IS NOT NULL))
);
CREATE INDEX idx_obrigacoes_empresa ON public.obrigacoes_empresa (id_empresa, data_vencimento);

CREATE TABLE public.historico_obrigacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_obrigacao uuid NOT NULL REFERENCES public.obrigacoes_empresa(id) ON DELETE RESTRICT,
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  acao text NOT NULL,
  dados jsonb,
  id_usuario uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- Situação "atrasada" é CALCULADA (não armazenada)
CREATE VIEW public.obrigacoes_empresa_situacao WITH (security_invoker = true) AS
SELECT o.*,
       CASE WHEN o.status IN ('pendente', 'em_andamento') AND o.data_vencimento < public.hoje_brasil() THEN 'atrasada' ELSE o.status END AS situacao,
       (o.data_vencimento - public.hoje_brasil()) AS dias_para_vencer
  FROM public.obrigacoes_empresa o;

-- 5. RLS: leitura por permissão; nenhuma escrita direta
ALTER TABLE public.documentos_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_solicitacoes_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obrigacoes_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_obrigacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.documentos_empresa, public.historico_documentos, public.solicitacoes_documentos, public.historico_solicitacoes_documentos,
  public.obrigacoes_empresa, public.historico_obrigacoes, public.obrigacoes_empresa_situacao FROM anon, authenticated;
GRANT SELECT ON public.documentos_empresa, public.historico_documentos, public.solicitacoes_documentos, public.historico_solicitacoes_documentos,
  public.obrigacoes_empresa, public.historico_obrigacoes, public.obrigacoes_empresa_situacao TO authenticated;

-- Documento: o dono/sócio vê todos; o contador vê só os COMPARTILHADOS, com vínculo ativo e ver_documentos
CREATE POLICY "Documentos: dono ou contador autorizado" ON public.documentos_empresa FOR SELECT TO authenticated
  USING (excluido_em IS NULL AND (public.e_gestor_empresa(id_empresa) OR (compartilhado_contador AND public.contador_pode(id_empresa, 'ver_documentos'))));
CREATE POLICY "Documentos: histórico" ON public.historico_documentos FOR SELECT TO authenticated
  USING (public.e_gestor_empresa(id_empresa));
CREATE POLICY "Solicitações: empresa e contador autorizado" ON public.solicitacoes_documentos FOR SELECT TO authenticated
  USING (public.e_gestor_empresa(id_empresa) OR public.contador_pode(id_empresa, 'ver_documentos'));
CREATE POLICY "Solicitações: histórico" ON public.historico_solicitacoes_documentos FOR SELECT TO authenticated
  USING (public.e_gestor_empresa(id_empresa) OR public.contador_pode(id_empresa, 'ver_documentos'));
CREATE POLICY "Obrigações: empresa e contador autorizado" ON public.obrigacoes_empresa FOR SELECT TO authenticated
  USING (public.pode_gerenciar_obrigacoes(id_empresa));
CREATE POLICY "Obrigações: histórico" ON public.historico_obrigacoes FOR SELECT TO authenticated
  USING (public.pode_gerenciar_obrigacoes(id_empresa));

-- 6. Storage privado: <id_empresa>/<uuid>.<pdf|jpg|png> — nome gerado pelo servidor (sem nome do usuário no caminho)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documentos-empresas', 'documentos-empresas', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.caminho_documento_valido(p_nome text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(p_nome ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$', false);
$$;

-- Checagens do Storage em funções SECURITY DEFINER: enxergam inclusive documentos já excluídos (a RLS da tabela os esconde)
CREATE OR REPLACE FUNCTION public.pode_ler_arquivo_documento(p_nome text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.documentos_empresa d
                  WHERE d.caminho = p_nome AND d.excluido_em IS NULL
                    AND (public.e_gestor_empresa(d.id_empresa) OR (d.compartilhado_contador AND public.contador_pode(d.id_empresa, 'ver_documentos'))));
$$;
-- Remover: arquivo de documento excluído (dono/sócio) ou arquivo órfão do próprio autor (falha ao registrar o documento)
CREATE OR REPLACE FUNCTION public.pode_remover_arquivo_documento(p_nome text, p_dono_arquivo text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.caminho_documento_valido(p_nome) AND (
    EXISTS (SELECT 1 FROM public.documentos_empresa d WHERE d.caminho = p_nome AND d.excluido_em IS NOT NULL AND public.e_gestor_empresa(d.id_empresa))
    OR (p_dono_arquivo = auth.uid()::text AND NOT EXISTS (SELECT 1 FROM public.documentos_empresa d WHERE d.caminho = p_nome)));
$$;

CREATE POLICY "Documentos de empresas: envio" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documentos-empresas' AND public.caminho_documento_valido(name)
              AND public.pode_enviar_documentos(public.uuid_ou_nulo((storage.foldername(name))[1])));
-- Leitura (URL temporária): documento ativo visível ao usuário. Quem pode remover também enxerga o arquivo
-- (no PostgreSQL, DELETE com filtro só alcança linhas visíveis pela política de leitura).
CREATE POLICY "Documentos de empresas: leitura" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documentos-empresas' AND (public.pode_ler_arquivo_documento(name) OR public.pode_remover_arquivo_documento(name, owner_id)));
CREATE POLICY "Documentos de empresas: remoção" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documentos-empresas' AND public.pode_remover_arquivo_documento(name, owner_id));

-- 7. Funções de documentos
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
  IF NOT ((v_obj.tipo = 'application/pdf' AND v_ext = 'pdf') OR (v_obj.tipo = 'image/jpeg' AND v_ext = 'jpg') OR (v_obj.tipo = 'image/png' AND v_ext = 'png')) THEN
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

-- Editar nome/categoria e compartilhamento: só o dono/sócio (controla o que o contador vê)
CREATE OR REPLACE FUNCTION public.atualizar_documento(p_id uuid, p_nome text, p_categoria text, p_compartilhar boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d public.documentos_empresa;
BEGIN
  SELECT * INTO d FROM public.documentos_empresa WHERE id = p_id AND excluido_em IS NULL FOR UPDATE;
  IF d.id IS NULL OR NOT public.e_gestor_empresa(d.id_empresa) THEN
    RAISE EXCEPTION 'Documento não encontrado.' USING ERRCODE = '42501';
  END IF;
  -- Documento entregue numa solicitação continua visível ao contador
  IF p_compartilhar IS FALSE AND d.id_solicitacao IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.solicitacoes_documentos s WHERE s.id = d.id_solicitacao AND s.status IN ('enviado', 'aceito')) THEN
    RAISE EXCEPTION 'Este documento foi entregue numa solicitação do contador e permanece compartilhado.' USING ERRCODE = 'check_violation';
  END IF;
  BEGIN
    UPDATE public.documentos_empresa
       SET nome = btrim(p_nome), categoria = coalesce(p_categoria, categoria), compartilhado_contador = coalesce(p_compartilhar, compartilhado_contador), atualizado_em = now()
     WHERE id = p_id;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'Nome (até 150 caracteres) ou categoria inválidos.' USING ERRCODE = 'check_violation';
  END;
  IF btrim(p_nome) IS DISTINCT FROM d.nome OR coalesce(p_categoria, d.categoria) IS DISTINCT FROM d.categoria THEN
    INSERT INTO public.historico_documentos (id_documento, id_empresa, acao, dados, id_usuario)
    VALUES (d.id, d.id_empresa, 'editado', jsonb_build_object('nome_anterior', d.nome, 'nome', btrim(p_nome), 'categoria_anterior', d.categoria, 'categoria', coalesce(p_categoria, d.categoria)), auth.uid());
  END IF;
  IF p_compartilhar IS NOT NULL AND p_compartilhar IS DISTINCT FROM d.compartilhado_contador THEN
    INSERT INTO public.historico_documentos (id_documento, id_empresa, acao, id_usuario)
    VALUES (d.id, d.id_empresa, CASE WHEN p_compartilhar THEN 'compartilhado' ELSE 'compartilhamento_removido' END, auth.uid());
  END IF;
END;
$$;

-- Exclusão lógica (registro + histórico); devolve o caminho para o arquivo ser removido do Storage pelo próprio dono
CREATE OR REPLACE FUNCTION public.excluir_documento(p_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d public.documentos_empresa;
BEGIN
  SELECT * INTO d FROM public.documentos_empresa WHERE id = p_id AND excluido_em IS NULL FOR UPDATE;
  IF d.id IS NULL OR NOT public.e_gestor_empresa(d.id_empresa) THEN
    RAISE EXCEPTION 'Documento não encontrado.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.solicitacoes_documentos s WHERE s.id_documento = d.id AND s.status IN ('enviado', 'aceito')) THEN
    RAISE EXCEPTION 'Este documento responde a uma solicitação do contador e não pode ser excluído.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.obrigacoes_empresa o WHERE o.id_documento = d.id AND o.status <> 'cancelada') THEN
    RAISE EXCEPTION 'Este documento está vinculado a uma obrigação. Desvincule antes de excluir.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.documentos_empresa SET excluido_em = now(), excluido_por = auth.uid() WHERE id = p_id;
  INSERT INTO public.historico_documentos (id_documento, id_empresa, acao, dados, id_usuario)
  VALUES (d.id, d.id_empresa, 'excluido', jsonb_build_object('nome', d.nome, 'caminho', d.caminho), auth.uid());
  RETURN d.caminho;
END;
$$;

-- 8. Funções de solicitações
CREATE OR REPLACE FUNCTION public.criar_solicitacao_documento(p_id_empresa uuid, p_titulo text, p_descricao text, p_prazo date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.contador_pode(p_id_empresa, 'ver_documentos') THEN
    RAISE EXCEPTION 'Sem permissão para solicitar documentos desta empresa.' USING ERRCODE = '42501';
  END IF;
  IF p_prazo IS NOT NULL AND p_prazo < public.hoje_brasil() THEN
    RAISE EXCEPTION 'O prazo não pode estar no passado.' USING ERRCODE = 'check_violation';
  END IF;
  BEGIN
    INSERT INTO public.solicitacoes_documentos (id_empresa, titulo, descricao, prazo, id_solicitante)
    VALUES (p_id_empresa, btrim(p_titulo), nullif(btrim(coalesce(p_descricao, '')), ''), p_prazo, auth.uid())
    RETURNING id INTO v_id;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'Informe um título (3 a 150 caracteres) e uma descrição de até 2000 caracteres.' USING ERRCODE = 'check_violation';
  END;
  INSERT INTO public.historico_solicitacoes_documentos (id_solicitacao, id_empresa, acao, status_novo, dados, id_usuario)
  VALUES (v_id, p_id_empresa, 'criada', 'pendente', jsonb_build_object('titulo', btrim(p_titulo), 'prazo', p_prazo), auth.uid());
  RETURN v_id;
END;
$$;

-- Empresário responde com um documento da biblioteca da MESMA empresa
CREATE OR REPLACE FUNCTION public.responder_solicitacao_documento(p_id uuid, p_id_documento uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.solicitacoes_documentos;
  d public.documentos_empresa;
BEGIN
  SELECT * INTO s FROM public.solicitacoes_documentos WHERE id = p_id FOR UPDATE;
  IF s.id IS NULL OR NOT public.e_gestor_empresa(s.id_empresa) THEN
    RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF s.status NOT IN ('pendente', 'correcao_solicitada') THEN
    RAISE EXCEPTION 'Esta solicitação não está aguardando envio.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO d FROM public.documentos_empresa WHERE id = p_id_documento AND excluido_em IS NULL FOR UPDATE;
  IF d.id IS NULL OR d.id_empresa <> s.id_empresa THEN
    RAISE EXCEPTION 'Documento inválido para esta solicitação.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.documentos_empresa SET compartilhado_contador = true, id_solicitacao = s.id, atualizado_em = now() WHERE id = d.id;
  UPDATE public.solicitacoes_documentos
     SET status = 'enviado', id_documento = d.id, respondido_em = now(), respondido_por = auth.uid(), atualizado_em = now()
   WHERE id = s.id;
  INSERT INTO public.historico_documentos (id_documento, id_empresa, acao, dados, id_usuario)
  VALUES (d.id, d.id_empresa, 'anexado_solicitacao', jsonb_build_object('solicitacao', s.id), auth.uid());
  INSERT INTO public.historico_solicitacoes_documentos (id_solicitacao, id_empresa, acao, status_anterior, status_novo, dados, id_usuario)
  VALUES (s.id, s.id_empresa, 'documento_enviado', s.status, 'enviado', jsonb_build_object('documento', d.id, 'nome', d.nome), auth.uid());
END;
$$;

-- Contador aceita ou pede correção (motivo obrigatório)
CREATE OR REPLACE FUNCTION public.analisar_solicitacao_documento(p_id uuid, p_aceitar boolean, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.solicitacoes_documentos;
  v_novo text := CASE WHEN p_aceitar THEN 'aceito' ELSE 'correcao_solicitada' END;
BEGIN
  SELECT * INTO s FROM public.solicitacoes_documentos WHERE id = p_id FOR UPDATE;
  IF s.id IS NULL OR NOT public.contador_pode(s.id_empresa, 'ver_documentos') THEN
    RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF s.status <> 'enviado' THEN
    RAISE EXCEPTION 'Só documentos enviados podem ser analisados.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT p_aceitar AND char_length(btrim(coalesce(p_motivo, ''))) < 3 THEN
    RAISE EXCEPTION 'Explique o que precisa ser corrigido.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.solicitacoes_documentos
     SET status = v_novo, motivo_correcao = CASE WHEN p_aceitar THEN NULL ELSE left(btrim(p_motivo), 1000) END,
         analisado_em = now(), analisado_por = auth.uid(), atualizado_em = now()
   WHERE id = s.id;
  INSERT INTO public.historico_solicitacoes_documentos (id_solicitacao, id_empresa, acao, status_anterior, status_novo, dados, id_usuario)
  VALUES (s.id, s.id_empresa, CASE WHEN p_aceitar THEN 'aceito' ELSE 'correcao_solicitada' END, s.status, v_novo,
          CASE WHEN p_aceitar THEN NULL ELSE jsonb_build_object('motivo', left(btrim(p_motivo), 1000)) END, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_solicitacao_documento(p_id uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.solicitacoes_documentos;
BEGIN
  SELECT * INTO s FROM public.solicitacoes_documentos WHERE id = p_id FOR UPDATE;
  IF s.id IS NULL OR NOT public.contador_pode(s.id_empresa, 'ver_documentos') THEN
    RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF s.status IN ('aceito', 'cancelado') THEN
    RAISE EXCEPTION 'Esta solicitação já foi encerrada.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.solicitacoes_documentos
     SET status = 'cancelado', motivo_cancelamento = nullif(left(btrim(coalesce(p_motivo, '')), 1000), ''), atualizado_em = now()
   WHERE id = s.id;
  INSERT INTO public.historico_solicitacoes_documentos (id_solicitacao, id_empresa, acao, status_anterior, status_novo, dados, id_usuario)
  VALUES (s.id, s.id_empresa, 'cancelada', s.status, 'cancelado', jsonb_build_object('motivo', nullif(btrim(coalesce(p_motivo, '')), '')), auth.uid());
END;
$$;

-- 9. Obrigações
-- Responsáveis possíveis: dono/sócio ativo da empresa ou contador com vínculo ativo e gerenciar_obrigacoes
CREATE OR REPLACE FUNCTION public.responsaveis_obrigacoes(p_id_empresa uuid)
RETURNS TABLE (id_usuario uuid, nome text, papel text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.pode_gerenciar_obrigacoes(p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT u.id_usuario, coalesce(p.nome_completo, 'Usuário'), 'empresa'::text
      FROM public.usuarios_empresas u JOIN public.perfis p ON p.id_usuario = u.id_usuario
     WHERE u.id_empresa = p_id_empresa AND u.ativo AND u.tipo_vinculacao IN ('dono', 'socio')
    UNION
    SELECT v.id_contador, coalesce(p.nome_completo, 'Contador'), 'contador'::text
      FROM public.vinculos_contabeis v JOIN public.perfis p ON p.id_usuario = v.id_contador
     WHERE v.id_empresa = p_id_empresa AND v.status = 'ativo' AND 'gerenciar_obrigacoes' = ANY (v.permissoes);
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_obrigacao(p_id uuid, p_id_empresa uuid, p_titulo text, p_descricao text, p_categoria text,
  p_id_responsavel uuid, p_data_vencimento date, p_observacoes text, p_id_documento uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.obrigacoes_empresa;
  v_empresa uuid := p_id_empresa;
  v_id uuid;
BEGIN
  IF p_id IS NOT NULL THEN
    SELECT * INTO o FROM public.obrigacoes_empresa WHERE id = p_id FOR UPDATE;
    IF o.id IS NULL OR NOT public.pode_gerenciar_obrigacoes(o.id_empresa) THEN
      RAISE EXCEPTION 'Obrigação não encontrada.' USING ERRCODE = '42501';
    END IF;
    IF o.status IN ('concluida', 'cancelada') THEN
      RAISE EXCEPTION 'Obrigação encerrada não pode ser editada. Reabra antes.' USING ERRCODE = 'check_violation';
    END IF;
    v_empresa := o.id_empresa; -- a empresa nunca muda
  ELSIF auth.uid() IS NULL OR NOT public.pode_gerenciar_obrigacoes(v_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para gerenciar obrigações desta empresa.' USING ERRCODE = '42501';
  END IF;
  IF p_id_responsavel IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.responsaveis_obrigacoes(v_empresa) r WHERE r.id_usuario = p_id_responsavel) THEN
    RAISE EXCEPTION 'Responsável inválido para esta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  -- Documento: da mesma empresa e visível a quem está vinculando
  IF p_id_documento IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.documentos_empresa d
        WHERE d.id = p_id_documento AND d.id_empresa = v_empresa AND d.excluido_em IS NULL
          AND (public.e_gestor_empresa(v_empresa) OR (d.compartilhado_contador AND public.contador_pode(v_empresa, 'ver_documentos')))) THEN
    RAISE EXCEPTION 'Documento inválido para esta obrigação.' USING ERRCODE = 'check_violation';
  END IF;
  BEGIN
    IF p_id IS NULL THEN
      INSERT INTO public.obrigacoes_empresa (id_empresa, titulo, descricao, categoria, id_responsavel, data_vencimento, observacoes, id_documento, criado_por, atualizado_por)
      VALUES (v_empresa, btrim(p_titulo), nullif(btrim(coalesce(p_descricao, '')), ''), coalesce(p_categoria, 'outras'), p_id_responsavel, p_data_vencimento,
              nullif(btrim(coalesce(p_observacoes, '')), ''), p_id_documento, auth.uid(), auth.uid())
      RETURNING id INTO v_id;
      INSERT INTO public.historico_obrigacoes (id_obrigacao, id_empresa, acao, dados, id_usuario)
      VALUES (v_id, v_empresa, 'criada', jsonb_build_object('titulo', btrim(p_titulo), 'vencimento', p_data_vencimento, 'responsavel', p_id_responsavel), auth.uid());
    ELSE
      UPDATE public.obrigacoes_empresa
         SET titulo = btrim(p_titulo), descricao = nullif(btrim(coalesce(p_descricao, '')), ''), categoria = coalesce(p_categoria, categoria),
             id_responsavel = p_id_responsavel, data_vencimento = p_data_vencimento, observacoes = nullif(btrim(coalesce(p_observacoes, '')), ''),
             id_documento = p_id_documento, atualizado_por = auth.uid(), atualizado_em = now()
       WHERE id = p_id RETURNING id INTO v_id;
      INSERT INTO public.historico_obrigacoes (id_obrigacao, id_empresa, acao, dados, id_usuario)
      VALUES (v_id, v_empresa, 'editada', jsonb_build_object('antes', jsonb_build_object('titulo', o.titulo, 'vencimento', o.data_vencimento, 'responsavel', o.id_responsavel,
              'categoria', o.categoria, 'documento', o.id_documento), 'depois', jsonb_build_object('titulo', btrim(p_titulo), 'vencimento', p_data_vencimento,
              'responsavel', p_id_responsavel, 'categoria', p_categoria, 'documento', p_id_documento)), auth.uid());
    END IF;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'Dados da obrigação inválidos: título (3 a 150 caracteres), categoria e vencimento.' USING ERRCODE = 'check_violation';
  END;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.alterar_situacao_obrigacao(p_id uuid, p_acao text, p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.obrigacoes_empresa;
  v_novo text;
BEGIN
  SELECT * INTO o FROM public.obrigacoes_empresa WHERE id = p_id FOR UPDATE;
  IF o.id IS NULL OR NOT public.pode_gerenciar_obrigacoes(o.id_empresa) THEN
    RAISE EXCEPTION 'Obrigação não encontrada.' USING ERRCODE = '42501';
  END IF;
  v_novo := CASE p_acao WHEN 'iniciar' THEN 'em_andamento' WHEN 'concluir' THEN 'concluida' WHEN 'cancelar' THEN 'cancelada' WHEN 'reabrir' THEN 'pendente' END;
  IF v_novo IS NULL THEN
    RAISE EXCEPTION 'Ação inválida.' USING ERRCODE = 'check_violation';
  END IF;
  IF (p_acao IN ('iniciar', 'concluir', 'cancelar') AND o.status NOT IN ('pendente', 'em_andamento'))
     OR (p_acao = 'iniciar' AND o.status <> 'pendente')
     OR (p_acao = 'reabrir' AND o.status NOT IN ('concluida', 'cancelada')) THEN
    RAISE EXCEPTION 'Ação não permitida na situação atual.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_acao = 'cancelar' AND char_length(btrim(coalesce(p_motivo, ''))) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.obrigacoes_empresa
     SET status = v_novo,
         concluida_em = CASE WHEN v_novo = 'concluida' THEN now() END, concluida_por = CASE WHEN v_novo = 'concluida' THEN auth.uid() END,
         cancelada_em = CASE WHEN v_novo = 'cancelada' THEN now() END, cancelada_por = CASE WHEN v_novo = 'cancelada' THEN auth.uid() END,
         motivo_cancelamento = CASE WHEN v_novo = 'cancelada' THEN left(btrim(p_motivo), 1000) END,
         atualizado_por = auth.uid(), atualizado_em = now()
   WHERE id = o.id;
  INSERT INTO public.historico_obrigacoes (id_obrigacao, id_empresa, acao, dados, id_usuario)
  VALUES (o.id, o.id_empresa, p_acao, jsonb_build_object('de', o.status, 'para', v_novo, 'motivo', nullif(btrim(coalesce(p_motivo, '')), '')), auth.uid());
END;
$$;

-- Uma obrigação pode originar UMA tarefa (módulo Tarefas existente). Sem sincronização automática de status:
-- cada uma mantém seu próprio histórico; a obrigação só guarda o vínculo.
CREATE OR REPLACE FUNCTION public.criar_tarefa_da_obrigacao(p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.obrigacoes_empresa;
  v_tarefa uuid;
  v_responsavel uuid;
BEGIN
  SELECT * INTO o FROM public.obrigacoes_empresa WHERE id = p_id FOR UPDATE;
  -- Tarefas da empresa são da equipe da empresa: só o dono/sócio cria
  IF o.id IS NULL OR NOT public.e_gestor_empresa(o.id_empresa) THEN
    RAISE EXCEPTION 'Obrigação não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF o.id_tarefa IS NOT NULL THEN
    RAISE EXCEPTION 'Esta obrigação já tem uma tarefa.' USING ERRCODE = 'unique_violation';
  END IF;
  IF o.status NOT IN ('pendente', 'em_andamento') THEN
    RAISE EXCEPTION 'Só obrigações em aberto podem gerar tarefa.' USING ERRCODE = 'check_violation';
  END IF;
  v_responsavel := CASE WHEN o.id_responsavel IS NOT NULL AND public.responsavel_tarefa_valido('empresa', o.id_empresa, o.id_responsavel) THEN o.id_responsavel END;
  v_tarefa := public.salvar_tarefa(NULL, 'empresa', o.id_empresa, left('Obrigação: ' || o.titulo, 200), o.descricao, NULL, 'media',
                                   greatest(o.data_vencimento, '2000-01-01'::date), NULL, v_responsavel);
  UPDATE public.obrigacoes_empresa SET id_tarefa = v_tarefa, atualizado_por = auth.uid(), atualizado_em = now() WHERE id = o.id;
  INSERT INTO public.historico_obrigacoes (id_obrigacao, id_empresa, acao, dados, id_usuario)
  VALUES (o.id, o.id_empresa, 'tarefa_criada', jsonb_build_object('tarefa', v_tarefa), auth.uid());
  RETURN v_tarefa;
END;
$$;

-- Indicadores (para o empresário e para o contador, por empresa)
CREATE OR REPLACE FUNCTION public.resumo_documentos_obrigacoes(p_id_empresa uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := public.hoje_brasil();
  v_ver_obrig boolean := public.pode_gerenciar_obrigacoes(p_id_empresa);
  v_ver_docs boolean := public.e_gestor_empresa(p_id_empresa) OR public.contador_pode(p_id_empresa, 'ver_documentos');
BEGIN
  IF NOT (v_ver_obrig OR v_ver_docs) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'obrigacoes_atrasadas', CASE WHEN v_ver_obrig THEN (SELECT count(*) FROM public.obrigacoes_empresa WHERE id_empresa = p_id_empresa AND status IN ('pendente', 'em_andamento') AND data_vencimento < v_hoje) END,
    'obrigacoes_7_dias', CASE WHEN v_ver_obrig THEN (SELECT count(*) FROM public.obrigacoes_empresa WHERE id_empresa = p_id_empresa AND status IN ('pendente', 'em_andamento') AND data_vencimento BETWEEN v_hoje AND v_hoje + 7) END,
    'obrigacoes_abertas', CASE WHEN v_ver_obrig THEN (SELECT count(*) FROM public.obrigacoes_empresa WHERE id_empresa = p_id_empresa AND status IN ('pendente', 'em_andamento')) END,
    'obrigacoes_concluidas_mes', CASE WHEN v_ver_obrig THEN (SELECT count(*) FROM public.obrigacoes_empresa WHERE id_empresa = p_id_empresa AND status = 'concluida' AND concluida_em >= date_trunc('month', v_hoje)) END,
    'solicitacoes_aguardando_empresa', CASE WHEN v_ver_docs THEN (SELECT count(*) FROM public.solicitacoes_documentos WHERE id_empresa = p_id_empresa AND status IN ('pendente', 'correcao_solicitada')) END,
    'solicitacoes_aguardando_analise', CASE WHEN v_ver_docs THEN (SELECT count(*) FROM public.solicitacoes_documentos WHERE id_empresa = p_id_empresa AND status = 'enviado') END
  );
END;
$$;

-- 10. Permissões de execução
REVOKE ALL ON FUNCTION public.pode_ler_arquivo_documento(text), public.pode_remover_arquivo_documento(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_ler_arquivo_documento(text), public.pode_remover_arquivo_documento(text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.pode_enviar_documentos(uuid), public.pode_gerenciar_obrigacoes(uuid), public.caminho_documento_valido(text),
  public.registrar_documento(uuid, text, text, text, boolean, text), public.atualizar_documento(uuid, text, text, boolean), public.excluir_documento(uuid),
  public.criar_solicitacao_documento(uuid, text, text, date), public.responder_solicitacao_documento(uuid, uuid),
  public.analisar_solicitacao_documento(uuid, boolean, text), public.cancelar_solicitacao_documento(uuid, text), public.responsaveis_obrigacoes(uuid),
  public.salvar_obrigacao(uuid, uuid, text, text, text, uuid, date, text, uuid), public.alterar_situacao_obrigacao(uuid, text, text),
  public.criar_tarefa_da_obrigacao(uuid), public.resumo_documentos_obrigacoes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_enviar_documentos(uuid), public.pode_gerenciar_obrigacoes(uuid), public.caminho_documento_valido(text),
  public.registrar_documento(uuid, text, text, text, boolean, text), public.atualizar_documento(uuid, text, text, boolean), public.excluir_documento(uuid),
  public.criar_solicitacao_documento(uuid, text, text, date), public.responder_solicitacao_documento(uuid, uuid),
  public.analisar_solicitacao_documento(uuid, boolean, text), public.cancelar_solicitacao_documento(uuid, text), public.responsaveis_obrigacoes(uuid),
  public.salvar_obrigacao(uuid, uuid, text, text, text, uuid, date, text, uuid), public.alterar_situacao_obrigacao(uuid, text, text),
  public.criar_tarefa_da_obrigacao(uuid), public.resumo_documentos_obrigacoes(uuid) TO authenticated;
