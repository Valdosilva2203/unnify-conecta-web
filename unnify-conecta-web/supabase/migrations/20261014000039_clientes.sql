-- Clientes (Etapa 1): cadastro PF/PJ, status (prospect/ativo/inativo), histórico de alterações e vínculo com RECEITAS do Financeiro.
-- Integração mínima e sem controle paralelo: lancamentos_financeiros.id_cliente (opcional, só receitas, mesma empresa).
-- Valores do cliente vêm só dos lançamentos reais e seus status. Inativar não apaga nada; não há exclusão física.
-- Acesso: dono/sócio gerencia; contador com vínculo ATIVO e "Ver financeiro"/"Gerenciar financeiro" só lê (pode_ver_financeiro).
--         Admin Master sem acesso automático. Histórico guarda QUAIS campos mudaram (não os valores pessoais — LGPD).
-- Depende de 20261013000035 (cnpj_valido). Reversão: rollback/20261014000039_clientes_reverter.sql

CREATE OR REPLACE FUNCTION public.cpf_valido(p_cpf text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE d text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'); s int; r int;
BEGIN
  IF length(d) <> 11 OR d ~ '^(\d)\1{10}$' THEN RETURN false; END IF;
  s := 0; FOR i IN 1..9 LOOP s := s + substr(d, i, 1)::int * (11 - i); END LOOP;
  r := (s * 10) % 11; IF r = 10 THEN r := 0; END IF;
  IF r <> substr(d, 10, 1)::int THEN RETURN false; END IF;
  s := 0; FOR i IN 1..10 LOOP s := s + substr(d, i, 1)::int * (12 - i); END LOOP;
  r := (s * 10) % 11; IF r = 10 THEN r := 0; END IF;
  RETURN r = substr(d, 11, 1)::int;
END;
$$;

CREATE OR REPLACE FUNCTION public.pode_gerenciar_clientes(p_id_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.e_gestor_empresa(p_id_empresa);
$$;
CREATE OR REPLACE FUNCTION public.pode_ver_clientes(p_id_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.e_gestor_empresa(p_id_empresa) OR public.pode_ver_financeiro(p_id_empresa);
$$;

CREATE TABLE public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  tipo_pessoa text NOT NULL DEFAULT 'pf',
  nome text NOT NULL,
  nome_fantasia text,
  documento text,
  telefone text,
  email text,
  cep text, logradouro text, numero text, complemento text, bairro text, cidade text, estado text,
  status text NOT NULL DEFAULT 'ativo',
  observacoes text,
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clientes_tipo CHECK (tipo_pessoa IN ('pf', 'pj')),
  CONSTRAINT clientes_status CHECK (status IN ('prospect', 'ativo', 'inativo')),
  CONSTRAINT clientes_nome CHECK (char_length(btrim(nome)) BETWEEN 2 AND 150),
  CONSTRAINT clientes_fantasia CHECK (nome_fantasia IS NULL OR char_length(nome_fantasia) <= 150),
  CONSTRAINT clientes_documento CHECK (documento IS NULL OR (tipo_pessoa = 'pf' AND public.cpf_valido(documento) AND documento ~ '^[0-9]{11}$')
                                                        OR (tipo_pessoa = 'pj' AND public.cnpj_valido(documento) AND documento ~ '^[0-9]{14}$')),
  CONSTRAINT clientes_telefone CHECK (telefone IS NULL OR telefone ~ '^[0-9]{10,13}$'),
  CONSTRAINT clientes_email CHECK (email IS NULL OR (email = lower(email) AND char_length(email) <= 254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  CONSTRAINT clientes_cep CHECK (cep IS NULL OR cep ~ '^[0-9]{8}$'),
  CONSTRAINT clientes_estado CHECK (estado IS NULL OR estado ~ '^[A-Z]{2}$'),
  CONSTRAINT clientes_textos CHECK (char_length(coalesce(logradouro, '') || coalesce(numero, '') || coalesce(complemento, '') || coalesce(bairro, '') || coalesce(cidade, '')) <= 400
                                    AND (observacoes IS NULL OR char_length(observacoes) <= 2000))
);
-- Sem duplicidade de documento na mesma empresa (clientes sem documento são permitidos)
CREATE UNIQUE INDEX clientes_documento_unico ON public.clientes (id_empresa, documento) WHERE documento IS NOT NULL;
CREATE INDEX idx_clientes_empresa ON public.clientes (id_empresa, status, criado_em DESC);
CREATE INDEX idx_clientes_nome ON public.clientes (id_empresa, lower(nome));

CREATE TABLE public.historico_clientes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_cliente uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  acao text NOT NULL CHECK (acao IN ('criado', 'editado', 'status', 'receita_vinculada', 'receita_desvinculada')),
  dados jsonb,
  id_usuario uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_historico_clientes ON public.historico_clientes (id_cliente, criado_em DESC);

ALTER TABLE public.lancamentos_financeiros ADD COLUMN id_cliente uuid REFERENCES public.clientes(id) ON DELETE RESTRICT;
CREATE INDEX idx_lancamentos_cliente ON public.lancamentos_financeiros (id_cliente) WHERE id_cliente IS NOT NULL;

-- Integridade do vínculo: cliente da MESMA empresa e só em receitas (impede vínculo cruzado por manipulação de IDs)
CREATE OR REPLACE FUNCTION public.validar_cliente_lancamento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.id_cliente IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.id_cliente IS DISTINCT FROM OLD.id_cliente) THEN
    IF NEW.tipo <> 'receita' THEN RAISE EXCEPTION 'Só receitas podem ser vinculadas a clientes.' USING ERRCODE = 'check_violation'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = NEW.id_cliente AND c.id_empresa = NEW.id_empresa) THEN
      RAISE EXCEPTION 'Cliente inválido para esta empresa.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validar_cliente_lancamento BEFORE INSERT OR UPDATE OF id_cliente ON public.lancamentos_financeiros
  FOR EACH ROW EXECUTE FUNCTION public.validar_cliente_lancamento();

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_clientes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clientes, public.historico_clientes FROM anon, authenticated;
GRANT SELECT ON public.clientes, public.historico_clientes TO authenticated;
CREATE POLICY "Clientes: empresa autorizada" ON public.clientes FOR SELECT TO authenticated USING (public.pode_ver_clientes(id_empresa));
CREATE POLICY "Histórico de clientes: empresa autorizada" ON public.historico_clientes FOR SELECT TO authenticated USING (public.pode_ver_clientes(id_empresa));

CREATE OR REPLACE FUNCTION public.salvar_cliente(
  p_id uuid, p_id_empresa uuid, p_tipo_pessoa text, p_nome text, p_nome_fantasia text, p_documento text, p_telefone text, p_email text,
  p_cep text, p_logradouro text, p_numero text, p_complemento text, p_bairro text, p_cidade text, p_estado text, p_status text, p_observacoes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.clientes;
  v_id uuid;
  v_doc text := nullif(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g'), '');
  v_tel text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_cep text := nullif(regexp_replace(coalesce(p_cep, ''), '\D', '', 'g'), '');
  v_uf text := nullif(upper(btrim(coalesce(p_estado, ''))), '');
  v_campos text[] := '{}';
BEGIN
  IF p_id IS NOT NULL THEN
    SELECT * INTO v FROM public.clientes WHERE id = p_id FOR UPDATE;
    IF v.id IS NULL OR NOT public.pode_gerenciar_clientes(v.id_empresa) THEN RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE = '42501'; END IF;
    p_id_empresa := v.id_empresa;
  ELSIF p_id_empresa IS NULL OR NOT public.pode_gerenciar_clientes(p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para gerenciar clientes desta empresa.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_tipo_pessoa, '') NOT IN ('pf', 'pj') THEN RAISE EXCEPTION 'Escolha pessoa física ou jurídica.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(btrim(coalesce(p_nome, ''))) NOT BETWEEN 2 AND 150 THEN RAISE EXCEPTION 'Informe o nome (2 a 150 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  IF v_doc IS NOT NULL AND p_tipo_pessoa = 'pf' AND NOT public.cpf_valido(v_doc) THEN RAISE EXCEPTION 'CPF inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF v_doc IS NOT NULL AND p_tipo_pessoa = 'pj' AND NOT public.cnpj_valido(v_doc) THEN RAISE EXCEPTION 'CNPJ inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF v_tel IS NOT NULL AND v_tel !~ '^[0-9]{10,13}$' THEN RAISE EXCEPTION 'Telefone inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF v_email IS NOT NULL AND v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'E-mail inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF v_cep IS NOT NULL AND v_cep !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'CEP inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF v_uf IS NOT NULL AND v_uf !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'UF inválida.' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(p_status, '') NOT IN ('prospect', 'ativo', 'inativo') THEN RAISE EXCEPTION 'Situação inválida.' USING ERRCODE = 'check_violation'; END IF;
  IF v_doc IS NOT NULL AND EXISTS (SELECT 1 FROM public.clientes c WHERE c.id_empresa = p_id_empresa AND c.documento = v_doc AND c.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'Já existe um cliente com este %.', CASE WHEN p_tipo_pessoa = 'pf' THEN 'CPF' ELSE 'CNPJ' END USING ERRCODE = '23505';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.clientes (id_empresa, tipo_pessoa, nome, nome_fantasia, documento, telefone, email, cep, logradouro, numero, complemento, bairro, cidade, estado,
                                 status, observacoes, criado_por, atualizado_por)
    VALUES (p_id_empresa, p_tipo_pessoa, btrim(p_nome), nullif(btrim(coalesce(p_nome_fantasia, '')), ''), v_doc, v_tel, v_email, v_cep,
            nullif(btrim(coalesce(p_logradouro, '')), ''), nullif(btrim(coalesce(p_numero, '')), ''), nullif(btrim(coalesce(p_complemento, '')), ''),
            nullif(btrim(coalesce(p_bairro, '')), ''), nullif(btrim(coalesce(p_cidade, '')), ''), v_uf, p_status, nullif(btrim(coalesce(p_observacoes, '')), ''), auth.uid(), auth.uid())
    RETURNING id INTO v_id;
    INSERT INTO public.historico_clientes (id_empresa, id_cliente, acao, dados, id_usuario) VALUES (p_id_empresa, v_id, 'criado', jsonb_build_object('status', p_status), auth.uid());
    RETURN v_id;
  END IF;

  -- Quais campos mudaram (sem registrar os valores pessoais)
  IF v.tipo_pessoa IS DISTINCT FROM p_tipo_pessoa THEN v_campos := array_append(v_campos, 'tipo'); END IF;
  IF v.nome IS DISTINCT FROM btrim(p_nome) OR v.nome_fantasia IS DISTINCT FROM nullif(btrim(coalesce(p_nome_fantasia, '')), '') THEN v_campos := array_append(v_campos, 'nome'); END IF;
  IF v.documento IS DISTINCT FROM v_doc THEN v_campos := array_append(v_campos, 'documento'); END IF;
  IF v.telefone IS DISTINCT FROM v_tel OR v.email IS DISTINCT FROM v_email THEN v_campos := array_append(v_campos, 'contato'); END IF;
  IF (v.cep, v.logradouro, v.numero, v.complemento, v.bairro, v.cidade, v.estado) IS DISTINCT FROM
     (v_cep, nullif(btrim(coalesce(p_logradouro, '')), ''), nullif(btrim(coalesce(p_numero, '')), ''), nullif(btrim(coalesce(p_complemento, '')), ''),
      nullif(btrim(coalesce(p_bairro, '')), ''), nullif(btrim(coalesce(p_cidade, '')), ''), v_uf) THEN v_campos := array_append(v_campos, 'endereco'); END IF;
  IF v.observacoes IS DISTINCT FROM nullif(btrim(coalesce(p_observacoes, '')), '') THEN v_campos := array_append(v_campos, 'observacoes'); END IF;

  UPDATE public.clientes
     SET tipo_pessoa = p_tipo_pessoa, nome = btrim(p_nome), nome_fantasia = nullif(btrim(coalesce(p_nome_fantasia, '')), ''), documento = v_doc, telefone = v_tel, email = v_email,
         cep = v_cep, logradouro = nullif(btrim(coalesce(p_logradouro, '')), ''), numero = nullif(btrim(coalesce(p_numero, '')), ''),
         complemento = nullif(btrim(coalesce(p_complemento, '')), ''), bairro = nullif(btrim(coalesce(p_bairro, '')), ''), cidade = nullif(btrim(coalesce(p_cidade, '')), ''),
         estado = v_uf, status = p_status, observacoes = nullif(btrim(coalesce(p_observacoes, '')), ''), atualizado_por = auth.uid(), atualizado_em = now()
   WHERE id = p_id;
  IF v.status <> p_status THEN
    INSERT INTO public.historico_clientes (id_empresa, id_cliente, acao, dados, id_usuario) VALUES (v.id_empresa, p_id, 'status', jsonb_build_object('de', v.status, 'para', p_status), auth.uid());
  END IF;
  IF cardinality(v_campos) > 0 THEN
    INSERT INTO public.historico_clientes (id_empresa, id_cliente, acao, dados, id_usuario) VALUES (v.id_empresa, p_id, 'editado', jsonb_build_object('campos', to_jsonb(v_campos)), auth.uid());
  END IF;
  RETURN p_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Já existe um cliente com este documento.' USING ERRCODE = '23505';
END;
$$;

-- Vincula (ou desvincula, com p_id_cliente NULL) uma RECEITA existente a um cliente. Não altera valores nem status.
CREATE OR REPLACE FUNCTION public.vincular_cliente_lancamento(p_id_lancamento uuid, p_id_cliente uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.lancamentos_financeiros; v_ant uuid;
BEGIN
  SELECT * INTO l FROM public.lancamentos_financeiros WHERE id = p_id_lancamento AND excluido_em IS NULL FOR UPDATE;
  IF l.id IS NULL OR NOT public.pode_gerenciar_financeiro(l.id_empresa) THEN RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE = '42501'; END IF;
  IF l.tipo <> 'receita' THEN RAISE EXCEPTION 'Só receitas podem ser vinculadas a clientes.' USING ERRCODE = 'check_violation'; END IF;
  IF p_id_cliente IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_id_cliente AND id_empresa = l.id_empresa) THEN
    RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE = '42501';
  END IF;
  v_ant := l.id_cliente;
  IF v_ant IS NOT DISTINCT FROM p_id_cliente THEN RETURN; END IF;
  -- id_cliente é só uma referência: liberado mesmo em parcelas/folha (os gatilhos de proteção não olham este campo)
  UPDATE public.lancamentos_financeiros SET id_cliente = p_id_cliente, atualizado_por = auth.uid() WHERE id = p_id_lancamento;
  IF v_ant IS NOT NULL THEN
    INSERT INTO public.historico_clientes (id_empresa, id_cliente, acao, dados, id_usuario) VALUES (l.id_empresa, v_ant, 'receita_desvinculada', jsonb_build_object('descricao', l.descricao, 'valor', l.valor), auth.uid());
  END IF;
  IF p_id_cliente IS NOT NULL THEN
    INSERT INTO public.historico_clientes (id_empresa, id_cliente, acao, dados, id_usuario) VALUES (l.id_empresa, p_id_cliente, 'receita_vinculada', jsonb_build_object('descricao', l.descricao, 'valor', l.valor), auth.uid());
  END IF;
END;
$$;

-- Lista paginada no servidor com a situação financeira (calculada dos lançamentos reais)
CREATE OR REPLACE FUNCTION public.buscar_clientes(p_id_empresa uuid, p_busca text DEFAULT NULL, p_status text DEFAULT NULL, p_tipo text DEFAULT NULL,
  p_financeiro text DEFAULT NULL, p_limite integer DEFAULT 10, p_deslocamento integer DEFAULT 0)
RETURNS TABLE (id uuid, tipo_pessoa text, nome text, nome_fantasia text, documento text, telefone text, email text, cidade text, estado text, status text,
               criado_em timestamptz, situacao_financeira text, a_receber numeric, total_recebido numeric, ultimo_movimento date, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fin boolean := public.pode_ver_financeiro(p_id_empresa);
  v_hoje date := public.hoje_brasil();
  b text := nullif(btrim(coalesce(p_busca, '')), '');
  bd text := nullif(regexp_replace(coalesce(p_busca, ''), '\D', '', 'g'), '');
BEGIN
  IF NOT public.pode_ver_clientes(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso aos clientes desta empresa.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    WITH f AS (
      SELECT l.id_cliente,
             coalesce(sum(l.valor) FILTER (WHERE l.status = 'pendente'), 0) AS pend,
             count(*) FILTER (WHERE l.status = 'pendente' AND l.data_vencimento < v_hoje) AS venc,
             coalesce(sum(l.valor) FILTER (WHERE l.status = 'pago'), 0) AS rec,
             max(coalesce(l.data_pagamento, l.data_vencimento)) AS ult
        FROM public.lancamentos_financeiros l
       WHERE v_fin AND l.id_empresa = p_id_empresa AND l.id_cliente IS NOT NULL AND l.excluido_em IS NULL AND l.status <> 'cancelado'
       GROUP BY l.id_cliente),
    base AS (
      SELECT c.*, f.pend, f.venc, f.rec, f.ult,
             CASE WHEN NOT v_fin THEN NULL WHEN f.id_cliente IS NULL THEN 'sem_movimento' WHEN f.venc > 0 THEN 'atrasado' WHEN f.pend > 0 THEN 'pendente' ELSE 'em_dia' END AS sit
        FROM public.clientes c LEFT JOIN f ON f.id_cliente = c.id
       WHERE c.id_empresa = p_id_empresa
         AND (p_status IS NULL OR c.status = p_status)
         AND (p_tipo IS NULL OR c.tipo_pessoa = p_tipo)
         AND (b IS NULL OR c.nome ILIKE '%' || b || '%' OR c.nome_fantasia ILIKE '%' || b || '%' OR c.email ILIKE '%' || b || '%'
              OR (bd IS NOT NULL AND char_length(bd) >= 3 AND (c.documento LIKE '%' || bd || '%' OR c.telefone LIKE '%' || bd || '%'))))
    SELECT base.id, base.tipo_pessoa, base.nome, base.nome_fantasia, base.documento, base.telefone, base.email, base.cidade, base.estado, base.status,
           base.criado_em, base.sit, CASE WHEN v_fin THEN coalesce(base.pend, 0) END, CASE WHEN v_fin THEN coalesce(base.rec, 0) END, base.ult, count(*) OVER ()
      FROM base
     WHERE p_financeiro IS NULL OR base.sit = p_financeiro
     ORDER BY base.nome
     LIMIT least(greatest(coalesce(p_limite, 10), 1), 100) OFFSET greatest(coalesce(p_deslocamento, 0), 0);
END;
$$;

-- Indicadores do módulo (a receber: só lançamentos reais pendentes vinculados; null sem permissão financeira)
CREATE OR REPLACE FUNCTION public.resumo_clientes(p_id_empresa uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fin boolean := public.pode_ver_financeiro(p_id_empresa);
  v_ini date := date_trunc('month', public.hoje_brasil())::date;
  v jsonb;
BEGIN
  IF NOT public.pode_ver_clientes(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso aos clientes desta empresa.' USING ERRCODE = '42501'; END IF;
  SELECT jsonb_build_object(
    'total', count(*), 'ativos', count(*) FILTER (WHERE status = 'ativo'), 'inativos', count(*) FILTER (WHERE status = 'inativo'),
    'prospects', count(*) FILTER (WHERE status = 'prospect'),
    'novos_mes', count(*) FILTER (WHERE (criado_em AT TIME ZONE 'America/Sao_Paulo')::date >= v_ini),
    'novos_mes_anterior', count(*) FILTER (WHERE (criado_em AT TIME ZONE 'America/Sao_Paulo')::date >= (v_ini - interval '1 month')::date
                                                AND (criado_em AT TIME ZONE 'America/Sao_Paulo')::date < v_ini),
    'evolucao', (SELECT jsonb_agg(jsonb_build_object('mes', m.mes,
                   'novos', (SELECT count(*) FROM public.clientes c WHERE c.id_empresa = p_id_empresa AND date_trunc('month', c.criado_em AT TIME ZONE 'America/Sao_Paulo')::date = m.mes),
                   'cadastrados', (SELECT count(*) FROM public.clientes c WHERE c.id_empresa = p_id_empresa AND (c.criado_em AT TIME ZONE 'America/Sao_Paulo')::date < (m.mes + interval '1 month')::date))
                   ORDER BY m.mes)
                   FROM (SELECT (v_ini - make_interval(months => g))::date mes FROM generate_series(0, 9) g) m))
    INTO v FROM public.clientes WHERE id_empresa = p_id_empresa;
  RETURN v || jsonb_build_object(
    'a_receber', CASE WHEN v_fin THEN (SELECT coalesce(sum(valor), 0) FROM public.lancamentos_financeiros
                                        WHERE id_empresa = p_id_empresa AND id_cliente IS NOT NULL AND status = 'pendente' AND excluido_em IS NULL) END,
    'a_receber_vencido', CASE WHEN v_fin THEN (SELECT coalesce(sum(valor), 0) FROM public.lancamentos_financeiros
                                        WHERE id_empresa = p_id_empresa AND id_cliente IS NOT NULL AND status = 'pendente' AND excluido_em IS NULL AND data_vencimento < public.hoje_brasil()) END);
END;
$$;

-- Financeiro do cliente: receitas vinculadas (reais), totais e situação
CREATE OR REPLACE FUNCTION public.financeiro_cliente(p_id_cliente uuid)
RETURNS TABLE (id uuid, descricao text, valor numeric, status text, situacao text, data_vencimento date, data_pagamento date, categoria text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.clientes;
BEGIN
  SELECT * INTO c FROM public.clientes WHERE clientes.id = p_id_cliente;
  IF c.id IS NULL OR NOT public.pode_ver_financeiro(c.id_empresa) THEN RAISE EXCEPTION 'Sem acesso ao financeiro deste cliente.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT l.id, l.descricao, l.valor, l.status,
           CASE WHEN l.status = 'pago' THEN 'pago' WHEN l.status = 'cancelado' THEN 'cancelado' WHEN l.data_vencimento < public.hoje_brasil() THEN 'vencido' ELSE 'pendente' END,
           l.data_vencimento, l.data_pagamento, cat.nome
      FROM public.lancamentos_financeiros l LEFT JOIN public.categorias_financeiras cat ON cat.id = l.id_categoria
     WHERE l.id_cliente = c.id AND l.id_empresa = c.id_empresa AND l.excluido_em IS NULL
     ORDER BY coalesce(l.data_pagamento, l.data_vencimento) DESC NULLS LAST
     LIMIT 200;
END;
$$;

-- Receitas da empresa ainda sem cliente (para vincular a partir do perfil)
CREATE OR REPLACE FUNCTION public.receitas_sem_cliente(p_id_empresa uuid, p_busca text DEFAULT NULL)
RETURNS TABLE (id uuid, descricao text, valor numeric, status text, data_vencimento date, contraparte text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.pode_gerenciar_financeiro(p_id_empresa) THEN RAISE EXCEPTION 'Sem permissão para vincular receitas.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT l.id, l.descricao, l.valor, l.status, l.data_vencimento, l.contraparte FROM public.lancamentos_financeiros l
     WHERE l.id_empresa = p_id_empresa AND l.tipo = 'receita' AND l.id_cliente IS NULL AND l.excluido_em IS NULL AND l.status <> 'cancelado'
       AND (nullif(btrim(coalesce(p_busca, '')), '') IS NULL OR l.descricao ILIKE '%' || btrim(p_busca) || '%' OR l.contraparte ILIKE '%' || btrim(p_busca) || '%')
     ORDER BY l.data_vencimento DESC NULLS LAST LIMIT 30;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_cliente_lancamento() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cpf_valido(text), public.pode_gerenciar_clientes(uuid), public.pode_ver_clientes(uuid),
  public.salvar_cliente(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text),
  public.vincular_cliente_lancamento(uuid, uuid), public.buscar_clientes(uuid, text, text, text, text, integer, integer),
  public.resumo_clientes(uuid), public.financeiro_cliente(uuid), public.receitas_sem_cliente(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cpf_valido(text), public.pode_gerenciar_clientes(uuid), public.pode_ver_clientes(uuid),
  public.salvar_cliente(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text),
  public.vincular_cliente_lancamento(uuid, uuid), public.buscar_clientes(uuid, text, text, text, text, integer, integer),
  public.resumo_clientes(uuid), public.financeiro_cliente(uuid), public.receitas_sem_cliente(uuid, text) TO authenticated;
