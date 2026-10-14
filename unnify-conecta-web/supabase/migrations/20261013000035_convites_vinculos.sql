-- E4.1 — Convites e vinculação recíproca (empresa ↔ contador), notificações e fila de e-mails.
-- REAPROVEITA o modelo de vínculos (vinculos_contabeis + histórico + funções existentes); não cria segundo relacionamento.
--   A) contador solicita vínculo com empresa cadastrada (consulta protegida por CNPJ) → empresário aceita DEFININDO permissões
--   B) contador convida empresa não cadastrada (CNPJ + e-mail) → empresário cria conta, cadastra a empresa e aceita no onboarding
--   C) empresário solicita pelo catálogo (já existia) → contador aceita (permissões já autorizadas pelo empresário)
--   D) empresário convida contador não cadastrado (e-mail + permissões) → contador cria conta e aceita no onboarding
-- Convites: token aleatório de 256 bits gerado no SERVIDOR; o banco guarda só o SHA-256; validade de 7 dias; uso único;
--   aceite exige usuário autenticado, e-mail CONFIRMADO e igual ao do convite, cadastro concluído e aceite explícito.
-- Notificações no sistema por gatilho nos vínculos; e-mails de aviso vão para fila_emails (sem dados financeiros),
--   processada no servidor (rota /api/notificacoes/processar). Usuários não leem a fila.
-- Admin Master: sem acesso a convites, consultas ou notificações alheias.
-- Ordem: depois da 000034 (usa is_admin_master/E0 apenas indiretamente). Reversão: rollback/20261013000035_convites_vinculos_reverter.sql

DO $$
BEGIN
  IF to_regclass('public.vinculos_contabeis') IS NULL OR to_regprocedure('public.solicitar_vinculo_contabil(uuid,uuid,uuid,text,text[])') IS NULL THEN
    RAISE EXCEPTION 'E4.1: modelo de vínculos não encontrado; nada foi alterado.';
  END IF;
END;
$$;

-- ===== 1. Auxiliares =====
CREATE OR REPLACE FUNCTION public.cnpj_valido(p_cnpj text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  d text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  p1 int[] := '{5,4,3,2,9,8,7,6,5,4,3,2}';
  p2 int[] := '{6,5,4,3,2,9,8,7,6,5,4,3,2}';
  s int; r int;
BEGIN
  IF length(d) <> 14 OR d ~ '^(\d)\1{13}$' THEN RETURN false; END IF;
  s := 0; FOR i IN 1..12 LOOP s := s + substr(d, i, 1)::int * p1[i]; END LOOP;
  r := CASE WHEN s % 11 < 2 THEN 0 ELSE 11 - s % 11 END;
  IF r <> substr(d, 13, 1)::int THEN RETURN false; END IF;
  s := 0; FOR i IN 1..13 LOOP s := s + substr(d, i, 1)::int * p2[i]; END LOOP;
  r := CASE WHEN s % 11 < 2 THEN 0 ELSE 11 - s % 11 END;
  RETURN r = substr(d, 14, 1)::int;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_empresas_cnpj_digitos ON public.empresas ((regexp_replace(cnpj, '\D', '', 'g')));

CREATE OR REPLACE FUNCTION public.e_contador_ativo()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfis WHERE id_usuario = auth.uid() AND tipo_usuario = 'contador' AND status = 'active');
$$;

CREATE OR REPLACE FUNCTION public.escritorio_do_contador(p_id_usuario uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ue.id_empresa FROM public.usuarios_empresas ue JOIN public.empresas e ON e.id = ue.id_empresa
   WHERE ue.id_usuario = p_id_usuario AND ue.ativo AND e.tipo_empresa = 'escritorio_contabil'
   ORDER BY ue.id_empresa LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.nome_da_empresa(p_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(nullif(btrim(nome_comercial), ''), razao_social) FROM public.empresas WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.gestores_da_empresa(p_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id_usuario FROM public.usuarios_empresas WHERE id_empresa = p_id AND ativo AND tipo_vinculacao IN ('dono', 'socio');
$$;

-- ===== 2. Notificações no sistema =====
CREATE TABLE public.notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  titulo text NOT NULL,
  mensagem text NOT NULL,
  link text,
  lida_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notificacoes_link_interno CHECK (link IS NULL OR link ~ '^/[A-Za-z0-9/_#?=&.-]*$'),
  CONSTRAINT notificacoes_tamanhos CHECK (char_length(titulo) <= 120 AND char_length(mensagem) <= 500)
);
CREATE INDEX idx_notificacoes_usuario ON public.notificacoes (id_usuario, criado_em DESC);
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notificacoes FROM anon, authenticated;
GRANT SELECT ON public.notificacoes TO authenticated;
CREATE POLICY "Usuario ve as proprias notificacoes" ON public.notificacoes FOR SELECT TO authenticated USING (id_usuario = auth.uid());

CREATE OR REPLACE FUNCTION public.marcar_notificacoes_lidas(p_ids uuid[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v integer;
BEGIN
  UPDATE public.notificacoes SET lida_em = now()
   WHERE id_usuario = auth.uid() AND lida_em IS NULL AND (p_ids IS NULL OR id = ANY (p_ids));
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
END;
$$;

-- ===== 3. Fila de e-mails de aviso (sem acesso de usuários; processada no servidor) =====
CREATE TABLE public.fila_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  assunto text NOT NULL,
  titulo text NOT NULL,
  texto text NOT NULL,
  link text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  tentativas integer NOT NULL DEFAULT 0,
  ultimo_erro text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  reservado_em timestamptz,
  enviado_em timestamptz,
  CONSTRAINT fila_emails_status CHECK (status IN ('pendente', 'enviando', 'enviado', 'falhou')),
  CONSTRAINT fila_emails_link_interno CHECK (link ~ '^/[A-Za-z0-9/_#?=&.-]*$')
);
CREATE INDEX idx_fila_emails_pendentes ON public.fila_emails (criado_em) WHERE status IN ('pendente', 'enviando', 'falhou');
ALTER TABLE public.fila_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fila_emails FROM anon, authenticated;

-- Reserva lote para envio (tentativas limitadas; reserva vencida volta para a fila). Só service_role (servidor).
CREATE OR REPLACE FUNCTION public.reservar_emails_pendentes(p_limite integer DEFAULT 10)
RETURNS SETOF public.fila_emails LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.fila_emails f
     SET status = 'enviando', reservado_em = now(), tentativas = f.tentativas + 1
   WHERE f.id IN (SELECT id FROM public.fila_emails
                   WHERE (status = 'pendente')
                      OR (status = 'falhou' AND tentativas < 3)
                      OR (status = 'enviando' AND reservado_em < now() - interval '10 minutes' AND tentativas < 3)
                   ORDER BY criado_em LIMIT LEAST(GREATEST(p_limite, 1), 50) FOR UPDATE SKIP LOCKED)
  RETURNING f.*;
$$;

CREATE OR REPLACE FUNCTION public.concluir_email(p_id uuid, p_ok boolean, p_erro text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.fila_emails
     SET status = CASE WHEN p_ok THEN 'enviado' ELSE 'falhou' END,
         enviado_em = CASE WHEN p_ok THEN now() END, ultimo_erro = left(p_erro, 300)
   WHERE id = p_id AND status = 'enviando';
$$;

-- Notifica (interno: nenhum usuário chama diretamente)
CREATE OR REPLACE FUNCTION public.notificar_usuario(p_id_usuario uuid, p_tipo text, p_titulo text, p_mensagem text, p_link text, p_email boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_id_usuario IS NULL THEN RETURN; END IF;
  INSERT INTO public.notificacoes (id_usuario, tipo, titulo, mensagem, link)
  VALUES (p_id_usuario, p_tipo, left(p_titulo, 120), left(p_mensagem, 500), p_link);
  IF p_email THEN
    INSERT INTO public.fila_emails (id_usuario, email, assunto, titulo, texto, link)
    SELECT p_id_usuario, p.email, left(p_titulo, 120) || ' - Unnify Conecta', left(p_titulo, 120), left(p_mensagem, 500), p_link
      FROM public.perfis p WHERE p.id_usuario = p_id_usuario AND p.email IS NOT NULL;
  END IF;
END;
$$;

-- ===== 4. Notificações das mudanças de vínculo (vale para catálogo, CNPJ e convites) =====
CREATE OR REPLACE FUNCTION public.notificar_mudanca_vinculo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa text := coalesce(public.nome_da_empresa(NEW.id_empresa), 'A empresa');
  v_contador text := coalesce((SELECT nome_completo FROM public.perfis WHERE id_usuario = NEW.id_contador), 'O contador');
  v_escritorio text := public.nome_da_empresa(NEW.id_escritorio);
  v_quem text;
  v_link_solicitante text := CASE WHEN NEW.origem = 'empresa' THEN '/app/meu-contador' ELSE '/contador/empresas' END;
  g uuid;
BEGIN
  v_quem := v_contador || coalesce(' (' || v_escritorio || ')', '');
  IF TG_OP = 'INSERT' AND NEW.status = 'pendente' THEN
    IF NEW.origem = 'empresa' THEN
      IF NEW.id_contador IS NOT NULL THEN
        PERFORM public.notificar_usuario(NEW.id_contador, 'vinculo_solicitado', 'Nova solicitação de vínculo',
          v_empresa || ' quer trabalhar com você no Unnify Conecta. Revise a solicitação.', '/contador/empresas', true);
      ELSE
        FOR g IN SELECT public.gestores_da_empresa(NEW.id_escritorio) LOOP
          PERFORM public.notificar_usuario(g, 'vinculo_solicitado', 'Nova solicitação de vínculo',
            v_empresa || ' quer trabalhar com o seu escritório no Unnify Conecta.', '/contador/empresas', true);
        END LOOP;
      END IF;
    ELSE
      FOR g IN SELECT public.gestores_da_empresa(NEW.id_empresa) LOOP
        PERFORM public.notificar_usuario(g, 'vinculo_solicitado', 'Nova solicitação de vínculo',
          v_quem || ' solicitou vínculo com ' || v_empresa || '. Revise e defina as permissões antes de aceitar.', '/app/meu-contador', true);
      END LOOP;
    END IF;
  ELSIF TG_OP = 'INSERT' AND NEW.status = 'ativo' AND NEW.solicitado_por IS DISTINCT FROM auth.uid() THEN
    PERFORM public.notificar_usuario(NEW.solicitado_por, 'vinculo_ativado', 'Convite aceito: vínculo ativado',
      CASE WHEN NEW.origem = 'empresa' THEN v_quem || ' aceitou o convite e agora está vinculado a ' || v_empresa || '.'
           ELSE v_empresa || ' aceitou o seu convite. O vínculo está ativo.' END, v_link_solicitante, true);
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pendente' AND NEW.status = 'ativo' THEN
    PERFORM public.notificar_usuario(NEW.solicitado_por, 'vinculo_aceito', 'Solicitação aceita',
      CASE WHEN NEW.origem = 'empresa' THEN v_quem || ' aceitou a solicitação. O vínculo está ativo.'
           ELSE v_empresa || ' aceitou a sua solicitação. O vínculo está ativo.' END, v_link_solicitante, true);
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pendente' AND NEW.status = 'recusado' THEN
    PERFORM public.notificar_usuario(NEW.solicitado_por, 'vinculo_recusado', 'Solicitação recusada',
      CASE WHEN NEW.origem = 'empresa' THEN v_quem || ' recusou a solicitação de vínculo.'
           ELSE v_empresa || ' recusou a sua solicitação de vínculo.' END, v_link_solicitante, true);
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'ativo' AND NEW.status = 'encerrado' THEN
    IF NEW.encerrado_por IS NOT DISTINCT FROM NEW.id_contador THEN
      FOR g IN SELECT public.gestores_da_empresa(NEW.id_empresa) LOOP
        PERFORM public.notificar_usuario(g, 'vinculo_encerrado', 'Vínculo encerrado', v_quem || ' encerrou o vínculo com ' || v_empresa || '.', '/app/meu-contador', false);
      END LOOP;
    ELSE
      PERFORM public.notificar_usuario(NEW.id_contador, 'vinculo_encerrado', 'Vínculo encerrado',
        'O vínculo com ' || v_empresa || ' foi encerrado. O acesso aos dados foi removido.', '/contador/empresas', false);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER notificar_mudanca_vinculo
  AFTER INSERT OR UPDATE ON public.vinculos_contabeis
  FOR EACH ROW EXECUTE FUNCTION public.notificar_mudanca_vinculo();

-- ===== 5. Cenário A: consulta protegida por CNPJ e solicitação do contador =====
CREATE TABLE public.consultas_cnpj (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_usuario uuid NOT NULL,
  cnpj text NOT NULL,
  encontrada boolean NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_consultas_cnpj_usuario ON public.consultas_cnpj (id_usuario, criado_em);
ALTER TABLE public.consultas_cnpj ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consultas_cnpj FROM anon, authenticated;

-- Só contador ativo; CNPJ com dígitos válidos; até 30 consultas/hora por usuário (registradas). Retorna o mínimo:
-- nome, cidade e UF (dados públicos do CNPJ) e a situação do vínculo DO PRÓPRIO contador. Nada de sócios, e-mails ou finanças.
CREATE OR REPLACE FUNCTION public.consultar_empresa_por_cnpj(p_cnpj text)
RETURNS TABLE (encontrada boolean, nome text, cidade text, estado text, situacao_vinculo text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  d text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  e public.empresas%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.e_contador_ativo() THEN
    RAISE EXCEPTION 'Apenas contadores podem vincular empresas.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.cnpj_valido(d) THEN
    RAISE EXCEPTION 'CNPJ inválido. Confira os números digitados.' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(*) FROM public.consultas_cnpj c WHERE c.id_usuario = v_uid AND c.criado_em > now() - interval '1 hour') >= 30 THEN
    RAISE EXCEPTION 'Limite de consultas atingido. Tente novamente mais tarde.' USING ERRCODE = '54000';
  END IF;
  SELECT * INTO e FROM public.empresas x WHERE regexp_replace(x.cnpj, '\D', '', 'g') = d AND x.tipo_empresa = 'comum' LIMIT 1;
  INSERT INTO public.consultas_cnpj (id_usuario, cnpj, encontrada) VALUES (v_uid, d, e.id IS NOT NULL);
  IF e.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::text, NULL::text;
  ELSE
    RETURN QUERY SELECT true, coalesce(nullif(btrim(e.nome_comercial), ''), e.razao_social), e.cidade, e.estado::text,
      (SELECT v.status FROM public.vinculos_contabeis v WHERE v.id_empresa = e.id AND v.id_contador = v_uid AND v.status IN ('pendente', 'ativo') LIMIT 1);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.solicitar_vinculo_por_cnpj(p_cnpj text, p_funcao text DEFAULT 'principal')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  d text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  v_emp uuid;
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.e_contador_ativo() THEN
    RAISE EXCEPTION 'Apenas contadores podem vincular empresas.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.cnpj_valido(d) THEN
    RAISE EXCEPTION 'CNPJ inválido. Confira os números digitados.' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(*) FROM public.vinculos_contabeis v WHERE v.solicitado_por = v_uid AND v.criado_em > now() - interval '1 day') >= 30 THEN
    RAISE EXCEPTION 'Limite diário de solicitações atingido. Tente novamente amanhã.' USING ERRCODE = '54000';
  END IF;
  SELECT x.id INTO v_emp FROM public.empresas x WHERE regexp_replace(x.cnpj, '\D', '', 'g') = d AND x.tipo_empresa = 'comum' LIMIT 1;
  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'Empresa não encontrada. Envie um convite ao empresário.' USING ERRCODE = 'P0002';
  END IF;
  -- Permissões padrão da função ficam como SUGESTÃO; o empresário confirma ou reduz ao aceitar (aceitar_vinculo_contabil)
  v_id := public.solicitar_vinculo_contabil(v_emp, v_uid, public.escritorio_do_contador(v_uid), coalesce(p_funcao, 'principal'), NULL);
  INSERT INTO public.auditoria (id_usuario, acao, nome_tabela, id_registro, valores_novos)
  VALUES (v_uid, 'vinculo_solicitado_por_cnpj', 'vinculos_contabeis', v_id, jsonb_build_object('funcao', p_funcao));
  RETURN v_id;
END;
$$;

-- Empresário aceita uma solicitação recebida DEFININDO função e permissões, numa única transação
CREATE OR REPLACE FUNCTION public.aceitar_vinculo_contabil(p_id_vinculo uuid, p_funcao text, p_permissoes text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.vinculos_contabeis%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.vinculos_contabeis WHERE id = p_id_vinculo FOR UPDATE;
  IF NOT FOUND OR NOT public.e_gestor_empresa(v.id_empresa) OR v.origem = 'empresa' THEN
    RAISE EXCEPTION 'Você não tem permissão para aceitar este vínculo.' USING ERRCODE = '42501';
  END IF;
  IF v.status <> 'pendente' THEN
    RAISE EXCEPTION 'Este vínculo não está mais pendente.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_permissoes IS NULL OR cardinality(p_permissoes) = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos uma permissão.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.vinculos_contabeis SET funcao = coalesce(p_funcao, funcao), permissoes = p_permissoes WHERE id = p_id_vinculo;
  PERFORM public.responder_vinculo_contabil(p_id_vinculo, true, NULL);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A empresa já possui um contador principal ativo. Escolha outra função para este vínculo.' USING ERRCODE = '23505';
END;
$$;

-- ===== 6. Convites por e-mail (cenários B e D) =====
CREATE TABLE public.convites_vinculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sentido text NOT NULL,
  hash_token text NOT NULL UNIQUE,
  email_destino text NOT NULL,
  nome_destino text,
  cnpj_convidado text,
  mensagem text,
  id_empresa uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  id_contador uuid REFERENCES public.perfis(id_usuario) ON DELETE CASCADE,
  id_escritorio uuid REFERENCES public.empresas(id) ON DELETE SET NULL,
  funcao text NOT NULL DEFAULT 'principal',
  permissoes text[] NOT NULL DEFAULT '{}',
  enviado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pendente',
  expira_em timestamptz NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  respondido_em timestamptz,
  respondido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  id_vinculo uuid REFERENCES public.vinculos_contabeis(id) ON DELETE SET NULL,
  envio_status text NOT NULL DEFAULT 'pendente',
  envios integer NOT NULL DEFAULT 0,
  ultimo_envio_em timestamptz,
  CONSTRAINT convites_sentido CHECK (sentido IN ('contador_para_empresa', 'empresa_para_contador')),
  CONSTRAINT convites_hash CHECK (hash_token ~ '^[0-9a-f]{64}$'),
  CONSTRAINT convites_email CHECK (email_destino = lower(btrim(email_destino)) AND char_length(email_destino) <= 254 AND email_destino ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  CONSTRAINT convites_nome CHECK (nome_destino IS NULL OR char_length(nome_destino) <= 120),
  CONSTRAINT convites_mensagem CHECK (mensagem IS NULL OR char_length(mensagem) <= 500),
  CONSTRAINT convites_cnpj CHECK (cnpj_convidado IS NULL OR cnpj_convidado ~ '^[0-9]{14}$'),
  CONSTRAINT convites_funcao CHECK (funcao IN ('principal', 'fiscal', 'folha_pagamento', 'consultoria', 'auxiliar')),
  CONSTRAINT convites_permissoes CHECK (permissoes <@ ARRAY['ver_dados_cadastrais', 'ver_documentos', 'enviar_documentos', 'ver_financeiro',
    'gerenciar_obrigacoes', 'ver_folha', 'ver_comprovantes_financeiros', 'exportar_financeiro', 'gerenciar_financeiro']::text[]),
  CONSTRAINT convites_status CHECK (status IN ('pendente', 'aceito', 'recusado', 'cancelado')),
  CONSTRAINT convites_envio CHECK (envio_status IN ('pendente', 'enviado', 'falhou')),
  CONSTRAINT convites_dados_sentido CHECK (
    (sentido = 'contador_para_empresa' AND cnpj_convidado IS NOT NULL AND id_contador IS NOT NULL)
    OR (sentido = 'empresa_para_contador' AND id_empresa IS NOT NULL AND cardinality(permissoes) > 0))
);
-- Um convite em aberto por remetente + destinatário (concorrência garantida pelo banco)
CREATE UNIQUE INDEX convites_um_pendente ON public.convites_vinculos
  (sentido, enviado_por, email_destino, coalesce(cnpj_convidado, ''), coalesce(id_empresa::text, '')) WHERE status = 'pendente';
CREATE INDEX idx_convites_remetente ON public.convites_vinculos (enviado_por, criado_em DESC);
CREATE INDEX idx_convites_empresa ON public.convites_vinculos (id_empresa, criado_em DESC) WHERE id_empresa IS NOT NULL;
-- Sem acesso direto: o hash nunca sai do banco; tudo passa pelas funções abaixo
ALTER TABLE public.convites_vinculos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.convites_vinculos FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.hash_convite(p_token text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

-- Cria o convite. O token é gerado no servidor; aqui chega SÓ o hash.
CREATE OR REPLACE FUNCTION public.criar_convite_vinculo(
  p_sentido text, p_hash text, p_email text, p_nome text DEFAULT NULL, p_mensagem text DEFAULT NULL,
  p_cnpj text DEFAULT NULL, p_id_empresa uuid DEFAULT NULL, p_funcao text DEFAULT 'principal', p_permissoes text[] DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  d text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  v_id uuid;
  v_perms text[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Faça login para enviar convites.' USING ERRCODE = '28000'; END IF;
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR char_length(v_email) > 254 THEN
    RAISE EXCEPTION 'Informe um e-mail válido.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_email = lower((SELECT email FROM auth.users WHERE id = v_uid)) THEN
    RAISE EXCEPTION 'Você não pode convidar o seu próprio e-mail.' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(coalesce(p_mensagem, '')) > 500 OR char_length(coalesce(p_nome, '')) > 120 THEN
    RAISE EXCEPTION 'Mensagem ou nome muito longos.' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(*) FROM public.convites_vinculos c WHERE c.enviado_por = v_uid AND c.criado_em > now() - interval '1 day') >= 20 THEN
    RAISE EXCEPTION 'Limite diário de convites atingido. Tente novamente amanhã.' USING ERRCODE = '54000';
  END IF;

  IF p_sentido = 'contador_para_empresa' THEN
    IF NOT public.e_contador_ativo() THEN RAISE EXCEPTION 'Apenas contadores podem convidar empresas.' USING ERRCODE = '42501'; END IF;
    IF NOT public.cnpj_valido(d) THEN RAISE EXCEPTION 'CNPJ inválido. Confira os números digitados.' USING ERRCODE = 'check_violation'; END IF;
    IF EXISTS (SELECT 1 FROM public.empresas x WHERE regexp_replace(x.cnpj, '\D', '', 'g') = d AND x.tipo_empresa = 'comum') THEN
      RAISE EXCEPTION 'Esta empresa já está no Unnify Conecta. Use "Solicitar vínculo".' USING ERRCODE = 'check_violation';
    END IF;
    v_perms := coalesce(p_permissoes, ARRAY['ver_dados_cadastrais', 'ver_documentos', 'enviar_documentos', 'ver_financeiro', 'gerenciar_obrigacoes', 'ver_folha']);
    INSERT INTO public.convites_vinculos (sentido, hash_token, email_destino, nome_destino, cnpj_convidado, mensagem, id_contador, id_escritorio,
                                          funcao, permissoes, enviado_por, expira_em)
    VALUES (p_sentido, p_hash, v_email, nullif(btrim(p_nome), ''), d, nullif(btrim(p_mensagem), ''), v_uid, public.escritorio_do_contador(v_uid),
            coalesce(p_funcao, 'principal'), v_perms, v_uid, now() + interval '7 days')
    RETURNING id INTO v_id;
  ELSIF p_sentido = 'empresa_para_contador' THEN
    IF p_id_empresa IS NULL OR NOT public.e_gestor_empresa(p_id_empresa) THEN
      RAISE EXCEPTION 'Você não tem permissão para convidar contadores para esta empresa.' USING ERRCODE = '42501';
    END IF;
    IF p_permissoes IS NULL OR cardinality(p_permissoes) = 0 THEN
      RAISE EXCEPTION 'Selecione ao menos uma permissão para o contador.' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.convites_vinculos (sentido, hash_token, email_destino, nome_destino, mensagem, id_empresa, funcao, permissoes, enviado_por, expira_em)
    VALUES (p_sentido, p_hash, v_email, nullif(btrim(p_nome), ''), nullif(btrim(p_mensagem), ''), p_id_empresa,
            coalesce(p_funcao, 'principal'), p_permissoes, v_uid, now() + interval '7 days')
    RETURNING id INTO v_id;
  ELSE
    RAISE EXCEPTION 'Tipo de convite inválido.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.auditoria (id_usuario, acao, nome_tabela, id_registro, valores_novos)
  VALUES (v_uid, 'convite_criado', 'convites_vinculos', v_id, jsonb_build_object('sentido', p_sentido));
  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe um convite pendente para este destinatário. Use "Reenviar".' USING ERRCODE = '23505';
  WHEN check_violation THEN
    IF SQLERRM LIKE '%violates check constraint%' THEN
      RAISE EXCEPTION 'Dados do convite inválidos.' USING ERRCODE = 'check_violation';
    END IF;
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.pode_gerir_convite(c public.convites_vinculos)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.enviado_por = auth.uid() OR (c.sentido = 'empresa_para_contador' AND public.e_gestor_empresa(c.id_empresa));
$$;

-- Resultado do envio do e-mail (o servidor informa; falha NUNCA aparece como entregue)
CREATE OR REPLACE FUNCTION public.registrar_envio_convite(p_id uuid, p_ok boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.convites_vinculos%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.convites_vinculos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.pode_gerir_convite(c) THEN RAISE EXCEPTION 'Convite não encontrado.' USING ERRCODE = '42501'; END IF;
  UPDATE public.convites_vinculos
     SET envio_status = CASE WHEN p_ok THEN 'enviado' ELSE 'falhou' END, envios = envios + 1, ultimo_envio_em = now(), atualizado_em = now()
   WHERE id = p_id;
END;
$$;

-- Reenvio: novo token (o anterior deixa de valer) e nova validade; só convites ainda não respondidos
-- Devolve o destinatário (só para quem pode gerir o convite) para o servidor reenviar o e-mail
CREATE OR REPLACE FUNCTION public.reenviar_convite(p_id uuid, p_hash text)
RETURNS TABLE (email_destino text, nome_destino text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.convites_vinculos%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.convites_vinculos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.pode_gerir_convite(c) THEN RAISE EXCEPTION 'Convite não encontrado.' USING ERRCODE = '42501'; END IF;
  IF c.status <> 'pendente' THEN RAISE EXCEPTION 'Este convite já foi respondido ou cancelado.' USING ERRCODE = 'check_violation'; END IF;
  IF c.ultimo_envio_em > now() - interval '1 minute' THEN RAISE EXCEPTION 'Aguarde um minuto antes de reenviar.' USING ERRCODE = '54000'; END IF;
  IF c.envios >= 10 THEN RAISE EXCEPTION 'Limite de reenvios atingido para este convite.' USING ERRCODE = '54000'; END IF;
  UPDATE public.convites_vinculos
     SET hash_token = p_hash, expira_em = now() + interval '7 days', envio_status = 'pendente', atualizado_em = now()
   WHERE id = p_id;
  INSERT INTO public.auditoria (id_usuario, acao, nome_tabela, id_registro) VALUES (auth.uid(), 'convite_reenviado', 'convites_vinculos', p_id);
  RETURN QUERY SELECT c.email_destino, c.nome_destino;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_convite(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.convites_vinculos%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.convites_vinculos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.pode_gerir_convite(c) THEN RAISE EXCEPTION 'Convite não encontrado.' USING ERRCODE = '42501'; END IF;
  IF c.status <> 'pendente' THEN RAISE EXCEPTION 'Este convite já foi respondido ou cancelado.' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.convites_vinculos SET status = 'cancelado', respondido_em = now(), respondido_por = auth.uid(), atualizado_em = now() WHERE id = p_id;
  INSERT INTO public.auditoria (id_usuario, acao, nome_tabela, id_registro) VALUES (auth.uid(), 'convite_cancelado', 'convites_vinculos', p_id);
END;
$$;

-- Convites enviados (situação "expirado" é CALCULADA). Empresa: convites a contadores; sem empresa: os do próprio contador.
CREATE OR REPLACE FUNCTION public.convites_enviados(p_id_empresa uuid DEFAULT NULL)
RETURNS TABLE (id uuid, sentido text, email_destino text, nome_destino text, cnpj_convidado text, funcao text, permissoes text[],
               situacao text, envio_status text, criado_em timestamptz, expira_em timestamptz, respondido_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_id_empresa IS NOT NULL AND NOT public.e_gestor_empresa(p_id_empresa) THEN
    RAISE EXCEPTION 'Você não tem permissão para ver os convites desta empresa.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT c.id, c.sentido, c.email_destino, c.nome_destino, c.cnpj_convidado, c.funcao, c.permissoes,
           CASE WHEN c.status = 'pendente' AND c.expira_em < now() THEN 'expirado' ELSE c.status END,
           c.envio_status, c.criado_em, c.expira_em, c.respondido_em
      FROM public.convites_vinculos c
     WHERE (p_id_empresa IS NOT NULL AND c.sentido = 'empresa_para_contador' AND c.id_empresa = p_id_empresa)
        OR (p_id_empresa IS NULL AND c.sentido = 'contador_para_empresa' AND c.enviado_por = auth.uid())
     ORDER BY c.criado_em DESC
     LIMIT 100;
END;
$$;

-- Dados mínimos do convite para quem tem o token (página pública /convite). Sem token válido: nenhuma linha.
CREATE OR REPLACE FUNCTION public.dados_convite(p_token text)
RETURNS TABLE (sentido text, remetente text, escritorio text, cnpj_convidado text, mensagem text, email_mascarado text,
               situacao text, expira_em timestamptz, funcao text, permissoes text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.sentido,
         CASE WHEN c.sentido = 'contador_para_empresa' THEN (SELECT nome_completo FROM public.perfis WHERE id_usuario = c.id_contador)
              ELSE public.nome_da_empresa(c.id_empresa) END,
         public.nome_da_empresa(c.id_escritorio),
         c.cnpj_convidado, c.mensagem,
         left(split_part(c.email_destino, '@', 1), 1) || '•••@' || split_part(c.email_destino, '@', 2),
         CASE WHEN c.status = 'pendente' AND c.expira_em < now() THEN 'expirado' ELSE c.status END,
         c.expira_em, c.funcao, c.permissoes
    FROM public.convites_vinculos c
   WHERE char_length(coalesce(p_token, '')) BETWEEN 32 AND 128 AND c.hash_token = public.hash_convite(p_token);
$$;

-- Aceite/recusa. Regra central: convite válido, não expirado/cancelado/usado; usuário autenticado com e-mail CONFIRMADO e
-- igual ao convite; cadastro concluído; empresa correta; aceite explícito; permissões já definidas; sem vínculo duplicado.
-- Tudo numa transação; o convite fica travado (FOR UPDATE) — aceites simultâneos não duplicam; repetir é idempotente.
CREATE OR REPLACE FUNCTION public.aceitar_convite_vinculo(p_token text, p_aceitar boolean, p_id_empresa uuid DEFAULT NULL, p_permissoes text[] DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  c public.convites_vinculos%ROWTYPE;
  u record;
  v_emp uuid; v_cont uuid; v_esc uuid; v_origem text; v_perms text[]; v_funcao text;
  v_exist public.vinculos_contabeis%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Faça login para responder ao convite.' USING ERRCODE = '28000'; END IF;
  SELECT * INTO c FROM public.convites_vinculos WHERE hash_token = public.hash_convite(p_token) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convite inválido ou substituído por um novo envio.' USING ERRCODE = '42501'; END IF;

  SELECT lower(email) AS email, email_confirmed_at INTO u FROM auth.users WHERE id = v_uid;
  IF u.email IS DISTINCT FROM c.email_destino THEN
    RAISE EXCEPTION 'Este convite foi enviado para outro e-mail.' USING ERRCODE = '42501';
  END IF;
  IF c.status = 'aceito' THEN
    IF c.respondido_por = v_uid THEN RETURN c.id_vinculo; END IF; -- repetição do mesmo aceite: idempotente
    RAISE EXCEPTION 'Este convite já foi utilizado.' USING ERRCODE = 'check_violation';
  END IF;
  IF c.status <> 'pendente' THEN RAISE EXCEPTION 'Este convite foi cancelado ou recusado.' USING ERRCODE = 'check_violation'; END IF;
  IF c.expira_em < now() THEN RAISE EXCEPTION 'Este convite expirou. Peça um novo convite.' USING ERRCODE = 'check_violation'; END IF;
  IF u.email_confirmed_at IS NULL THEN RAISE EXCEPTION 'Confirme seu e-mail antes de responder ao convite.' USING ERRCODE = '42501'; END IF;

  IF NOT coalesce(p_aceitar, false) THEN
    UPDATE public.convites_vinculos SET status = 'recusado', respondido_em = now(), respondido_por = v_uid, atualizado_em = now() WHERE id = c.id;
    PERFORM public.notificar_usuario(c.enviado_por, 'convite_recusado', 'Convite recusado',
      'O convite enviado para ' || c.email_destino || ' foi recusado.', CASE WHEN c.sentido = 'empresa_para_contador' THEN '/app/meu-contador' ELSE '/contador/empresas' END, true);
    INSERT INTO public.auditoria (id_usuario, acao, nome_tabela, id_registro) VALUES (v_uid, 'convite_recusado', 'convites_vinculos', c.id);
    RETURN NULL;
  END IF;

  IF c.sentido = 'contador_para_empresa' THEN
    IF p_id_empresa IS NULL OR NOT public.e_gestor_empresa(p_id_empresa) THEN
      RAISE EXCEPTION 'Cadastre a sua empresa antes de aceitar o convite.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.empresas x WHERE x.id = p_id_empresa AND x.tipo_empresa = 'comum'
                     AND regexp_replace(x.cnpj, '\D', '', 'g') = c.cnpj_convidado) THEN
      RAISE EXCEPTION 'A empresa cadastrada não corresponde ao CNPJ do convite.' USING ERRCODE = 'check_violation';
    END IF;
    v_emp := p_id_empresa; v_cont := c.id_contador; v_origem := 'contador';
    v_esc := CASE WHEN c.id_escritorio IS NOT NULL AND EXISTS (SELECT 1 FROM public.usuarios_empresas
                    WHERE id_usuario = c.id_contador AND id_empresa = c.id_escritorio AND ativo) THEN c.id_escritorio END;
    -- O empresário define as permissões no aceite (pode reduzir a sugestão do contador)
    v_perms := coalesce(p_permissoes, c.permissoes);
  ELSE
    IF NOT public.e_contador_ativo() THEN
      RAISE EXCEPTION 'Conclua o seu cadastro de contador antes de aceitar o convite.' USING ERRCODE = '42501';
    END IF;
    v_emp := c.id_empresa; v_cont := v_uid; v_origem := 'empresa'; v_esc := public.escritorio_do_contador(v_uid);
    v_perms := c.permissoes; -- autorizadas pelo empresário no convite; o contador não pode ampliar
  END IF;
  IF v_perms IS NULL OR cardinality(v_perms) = 0 THEN RAISE EXCEPTION 'Selecione ao menos uma permissão.' USING ERRCODE = 'check_violation'; END IF;

  v_funcao := c.funcao;
  IF v_funcao = 'principal' AND EXISTS (SELECT 1 FROM public.vinculos_contabeis WHERE id_empresa = v_emp AND funcao = 'principal' AND status = 'ativo' AND id_contador IS DISTINCT FROM v_cont) THEN
    v_funcao := 'auxiliar'; -- a empresa já tem principal: entra como contador adicional (pode ser alterado depois)
  END IF;

  SELECT * INTO v_exist FROM public.vinculos_contabeis WHERE id_empresa = v_emp AND id_contador = v_cont AND status IN ('pendente', 'ativo') FOR UPDATE;
  IF v_exist.id IS NOT NULL AND v_exist.status = 'ativo' THEN
    v_id := v_exist.id; -- já vinculados: não duplica nem amplia permissões
  ELSIF v_exist.id IS NOT NULL THEN
    UPDATE public.vinculos_contabeis SET permissoes = v_perms, funcao = v_funcao, status = 'ativo', aprovado_em = now(), aprovado_por = v_uid
     WHERE id = v_exist.id;
    v_id := v_exist.id;
  ELSE
    INSERT INTO public.vinculos_contabeis (id_empresa, id_contador, id_escritorio, funcao, status, permissoes, origem, solicitado_por, aprovado_por, aprovado_em)
    VALUES (v_emp, v_cont, v_esc, v_funcao, 'ativo', v_perms, v_origem, c.enviado_por, v_uid, now())
    RETURNING id INTO v_id;
  END IF;

  UPDATE public.convites_vinculos SET status = 'aceito', respondido_em = now(), respondido_por = v_uid, id_vinculo = v_id, atualizado_em = now() WHERE id = c.id;
  INSERT INTO public.auditoria (id_usuario, acao, nome_tabela, id_registro, valores_novos)
  VALUES (v_uid, 'convite_aceito', 'convites_vinculos', c.id, jsonb_build_object('id_vinculo', v_id));
  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe um vínculo para esta relação.' USING ERRCODE = '23505';
END;
$$;

-- ===== 7. Permissões de execução =====
REVOKE ALL ON FUNCTION public.cnpj_valido(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.e_contador_ativo(), public.escritorio_do_contador(uuid), public.nome_da_empresa(uuid), public.gestores_da_empresa(uuid),
  public.notificar_usuario(uuid, text, text, text, text, boolean), public.notificar_mudanca_vinculo(),
  public.reservar_emails_pendentes(integer), public.concluir_email(uuid, boolean, text), public.pode_gerir_convite(public.convites_vinculos),
  public.hash_convite(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marcar_notificacoes_lidas(uuid[]), public.consultar_empresa_por_cnpj(text), public.solicitar_vinculo_por_cnpj(text, text),
  public.aceitar_vinculo_contabil(uuid, text, text[]),
  public.criar_convite_vinculo(text, text, text, text, text, text, uuid, text, text[]), public.registrar_envio_convite(uuid, boolean),
  public.reenviar_convite(uuid, text), public.cancelar_convite(uuid), public.convites_enviados(uuid),
  public.dados_convite(text), public.aceitar_convite_vinculo(text, boolean, uuid, text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cnpj_valido(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_notificacoes_lidas(uuid[]), public.consultar_empresa_por_cnpj(text), public.solicitar_vinculo_por_cnpj(text, text),
  public.aceitar_vinculo_contabil(uuid, text, text[]),
  public.criar_convite_vinculo(text, text, text, text, text, text, uuid, text, text[]), public.registrar_envio_convite(uuid, boolean),
  public.reenviar_convite(uuid, text), public.cancelar_convite(uuid), public.convites_enviados(uuid),
  public.dados_convite(text), public.aceitar_convite_vinculo(text, boolean, uuid, text[])
  TO authenticated;
-- A página pública do convite (antes do cadastro) só lê o mínimo, e só com o token
GRANT EXECUTE ON FUNCTION public.dados_convite(text) TO anon;
GRANT EXECUTE ON FUNCTION public.reservar_emails_pendentes(integer), public.concluir_email(uuid, boolean, text) TO service_role;
