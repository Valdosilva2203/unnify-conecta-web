-- Recibos (Etapa 1). O recibo COMPROVA um pagamento; não cria receita/despesa nem movimenta caixa.
--   * Vinculado: emitido a partir de um lançamento PAGO do Financeiro (receita → recibo de recebimento; despesa → comprovante
--     de pagamento, que NÃO substitui o recibo de quitação do fornecedor). Um recibo ativo por lançamento (sem duplicidade).
--     Pagamento parcial (venda/compra/folha com saldo pendente) fica marcado como parcial — nunca "quitação integral".
--   * Manual: só de recebimento, com declaração explícita; fica "não conciliado" até ser vinculado a um recebimento confirmado.
--   * Documento imutável: dados do emitente/pagador/valor/extenso gravados na emissão. Segunda via = mesmo número.
--     Cancelamento com motivo; nada é apagado. Numeração sequencial por empresa, segura sob concorrência; idempotência.
-- Acesso: dono/sócio emite/cancela; contador com vínculo ATIVO e "Ver/Gerenciar financeiro" só lê. Admin Master sem acesso.
-- Depende de 041/042 (id_venda, id_compra). Reversão: rollback/20261014000043_recibos_reverter.sql

-- ===== Valor por extenso (pt-BR, reais e centavos) =====
CREATE OR REPLACE FUNCTION public.extenso_ate_999(n integer)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  u text[] := ARRAY['um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
  d text[] := ARRAY['','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
  c text[] := ARRAY['cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
  partes text[] := '{}';
  r integer;
BEGIN
  IF n = 0 THEN RETURN ''; END IF;
  IF n = 100 THEN RETURN 'cem'; END IF;
  IF n >= 100 THEN partes := array_append(partes, c[n / 100]); END IF;
  r := n % 100;
  IF r > 0 AND r < 20 THEN partes := array_append(partes, u[r]);
  ELSIF r >= 20 THEN
    partes := array_append(partes, d[r / 10]);
    IF r % 10 > 0 THEN partes := array_append(partes, u[r % 10]); END IF;
  END IF;
  RETURN array_to_string(partes, ' e ');
END;
$$;

CREATE OR REPLACE FUNCTION public.valor_por_extenso(p_valor numeric)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v numeric := round(abs(coalesce(p_valor, 0)), 2);
  inteiro bigint := trunc(v);
  cent integer := ((v - trunc(v)) * 100)::integer;
  grupos integer[] := ARRAY[(inteiro / 1000000000) % 1000, (inteiro / 1000000) % 1000, (inteiro / 1000) % 1000, inteiro % 1000];
  sing text[] := ARRAY['bilhão', 'milhão', 'mil', ''];
  plur text[] := ARRAY['bilhões', 'milhões', 'mil', ''];
  partes text[] := '{}';
  vals integer[] := '{}';
  t text; texto text := ''; reais text := ''; i integer;
BEGIN
  IF inteiro > 999999999999 THEN RAISE EXCEPTION 'Valor alto demais para escrever por extenso.' USING ERRCODE = 'check_violation'; END IF;
  FOR i IN 1..4 LOOP
    IF grupos[i] > 0 THEN
      t := CASE WHEN i = 3 AND grupos[i] = 1 THEN 'mil'
                ELSE public.extenso_ate_999(grupos[i]) || CASE WHEN i < 4 THEN ' ' || CASE WHEN grupos[i] = 1 THEN sing[i] ELSE plur[i] END ELSE '' END END;
      partes := array_append(partes, t);
      vals := array_append(vals, grupos[i]);
    END IF;
  END LOOP;
  FOR i IN 1..coalesce(array_length(partes, 1), 0) LOOP
    IF i = 1 THEN texto := partes[1];
    ELSE texto := texto || CASE WHEN vals[i] < 100 OR vals[i] % 100 = 0 THEN ' e ' ELSE ' ' END || partes[i];
    END IF;
  END LOOP;
  IF inteiro > 0 THEN
    reais := texto || CASE WHEN inteiro = 1 THEN ' real' WHEN inteiro % 1000000 = 0 THEN ' de reais' ELSE ' reais' END;
  END IF;
  IF cent > 0 THEN
    RETURN CASE WHEN reais <> '' THEN reais || ' e ' ELSE '' END || public.extenso_ate_999(cent) || CASE WHEN cent = 1 THEN ' centavo' ELSE ' centavos' END;
  END IF;
  RETURN CASE WHEN reais = '' THEN 'zero real' ELSE reais END;
END;
$$;

-- ===== Recibos =====
CREATE TABLE public.recibos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  numero integer NOT NULL,
  tipo text NOT NULL, -- recebimento: a empresa recebeu; pagamento: comprovante de pagamento feito pela empresa
  situacao text NOT NULL DEFAULT 'emitido',
  origem text NOT NULL, -- financeiro (lançamento pago) | manual
  conciliado boolean NOT NULL DEFAULT false,
  id_lancamento uuid REFERENCES public.lancamentos_financeiros(id) ON DELETE RESTRICT,
  id_cliente uuid REFERENCES public.clientes(id) ON DELETE RESTRICT,
  id_venda uuid REFERENCES public.vendas(id) ON DELETE RESTRICT,
  id_compra uuid REFERENCES public.compras(id) ON DELETE RESTRICT,
  -- Dados gravados na emissão (o documento não muda depois)
  emitente_nome text NOT NULL,
  emitente_documento text,
  emitente_cidade text,
  emitente_contato text,
  pessoa_nome text NOT NULL, -- pagador (recebimento) ou beneficiário (pagamento)
  pessoa_documento text,
  descricao text NOT NULL,
  valor numeric(14, 2) NOT NULL,
  valor_extenso text NOT NULL,
  data_pagamento date NOT NULL,
  forma_pagamento text NOT NULL,
  parcial boolean NOT NULL DEFAULT false,
  valor_total_operacao numeric(14, 2),
  declaracao_recebimento boolean NOT NULL DEFAULT false,
  observacoes text,
  chave_idempotencia uuid,
  cancelado_em timestamptz,
  cancelado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  motivo_cancelamento text,
  emitido_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  emitido_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recibos_tipo CHECK (tipo IN ('recebimento', 'pagamento')),
  CONSTRAINT recibos_situacao CHECK (situacao IN ('emitido', 'cancelado')),
  CONSTRAINT recibos_origem CHECK (origem IN ('financeiro', 'manual')),
  CONSTRAINT recibos_manual CHECK (origem = 'financeiro' OR (tipo = 'recebimento' AND declaracao_recebimento)),
  CONSTRAINT recibos_vinculo CHECK (origem = 'manual' OR id_lancamento IS NOT NULL),
  CONSTRAINT recibos_valor CHECK (valor > 0 AND valor <= 999999999.99 AND (valor_total_operacao IS NULL OR valor_total_operacao >= valor)),
  CONSTRAINT recibos_forma CHECK (forma_pagamento IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'cheque', 'outro')),
  CONSTRAINT recibos_textos CHECK (char_length(pessoa_nome) BETWEEN 2 AND 150 AND char_length(descricao) BETWEEN 3 AND 300
    AND (pessoa_documento IS NULL OR pessoa_documento ~ '^[0-9]{11}$|^[0-9]{14}$') AND (observacoes IS NULL OR char_length(observacoes) <= 500)
    AND (motivo_cancelamento IS NULL OR char_length(motivo_cancelamento) <= 500)),
  CONSTRAINT recibos_cancelamento CHECK ((situacao = 'cancelado') = (cancelado_em IS NOT NULL)),
  CONSTRAINT recibos_numero_unico UNIQUE (id_empresa, numero)
);
CREATE UNIQUE INDEX recibos_um_por_lancamento ON public.recibos (id_lancamento) WHERE id_lancamento IS NOT NULL AND situacao = 'emitido';
CREATE UNIQUE INDEX recibos_idempotencia ON public.recibos (id_empresa, chave_idempotencia) WHERE chave_idempotencia IS NOT NULL;
CREATE INDEX idx_recibos_empresa ON public.recibos (id_empresa, data_pagamento DESC);
CREATE INDEX idx_recibos_cliente ON public.recibos (id_cliente) WHERE id_cliente IS NOT NULL;

CREATE TABLE public.historico_recibos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_recibo uuid NOT NULL REFERENCES public.recibos(id) ON DELETE RESTRICT,
  acao text NOT NULL CHECK (acao IN ('emitido', 'conciliado', 'segunda_via', 'download', 'compartilhado', 'cancelado')),
  dados jsonb,
  id_usuario uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_historico_recibos ON public.historico_recibos (id_recibo, criado_em DESC);

-- Recibo emitido não é editado: só conciliação (manual → vínculo) e cancelamento, pelas funções
CREATE OR REPLACE FUNCTION public.proteger_recibo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.numero, NEW.tipo, NEW.origem, NEW.emitente_nome, NEW.emitente_documento, NEW.pessoa_nome, NEW.pessoa_documento, NEW.descricao, NEW.valor,
      NEW.valor_extenso, NEW.data_pagamento, NEW.forma_pagamento, NEW.parcial, NEW.id_empresa, NEW.emitido_em)
     IS DISTINCT FROM
     (OLD.numero, OLD.tipo, OLD.origem, OLD.emitente_nome, OLD.emitente_documento, OLD.pessoa_nome, OLD.pessoa_documento, OLD.descricao, OLD.valor,
      OLD.valor_extenso, OLD.data_pagamento, OLD.forma_pagamento, OLD.parcial, OLD.id_empresa, OLD.emitido_em) THEN
    RAISE EXCEPTION 'Recibo emitido não pode ser alterado. Cancele e emita outro.' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.situacao = 'cancelado' AND NEW.situacao <> 'cancelado' THEN RAISE EXCEPTION 'Recibo cancelado não pode ser reativado.' USING ERRCODE = 'check_violation'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER proteger_recibo BEFORE UPDATE ON public.recibos FOR EACH ROW EXECUTE FUNCTION public.proteger_recibo();
CREATE OR REPLACE FUNCTION public.impedir_exclusao_recibo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Recibos não são excluídos; use o cancelamento.' USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER impedir_exclusao_recibo BEFORE DELETE ON public.recibos FOR EACH ROW EXECUTE FUNCTION public.impedir_exclusao_recibo();

ALTER TABLE public.historico_clientes DROP CONSTRAINT historico_clientes_acao_check;
ALTER TABLE public.historico_clientes ADD CONSTRAINT historico_clientes_acao_check
  CHECK (acao IN ('criado', 'editado', 'status', 'receita_vinculada', 'receita_desvinculada', 'venda_registrada', 'venda_cancelada', 'recibo_emitido', 'recibo_cancelado'));

ALTER TABLE public.recibos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_recibos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recibos, public.historico_recibos FROM anon, authenticated;
GRANT SELECT ON public.recibos, public.historico_recibos TO authenticated;
CREATE POLICY "Recibos: empresa autorizada" ON public.recibos FOR SELECT TO authenticated USING (public.pode_ver_comercial(id_empresa));
CREATE POLICY "Histórico de recibos: empresa autorizada" ON public.historico_recibos FOR SELECT TO authenticated USING (public.pode_ver_comercial(id_empresa));

-- ===== Emissão =====
-- Vinculada (p_id_lancamento): valor, data, pessoa e parcial vêm do Financeiro (lançamento PAGO); p_valor/p_data são ignorados.
-- Manual: só recebimento, com p_declaracao = true; fica não conciliado.
CREATE OR REPLACE FUNCTION public.emitir_recibo(
  p_id_empresa uuid, p_id_lancamento uuid, p_id_cliente uuid, p_pessoa_nome text, p_pessoa_documento text, p_descricao text, p_valor numeric,
  p_data_pagamento date, p_forma_pagamento text, p_parcial boolean, p_valor_total numeric, p_declaracao boolean, p_observacoes text, p_chave uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.empresas; l public.lancamentos_financeiros; cl public.clientes; vd public.vendas; cp public.compras; fo public.fornecedores;
  v_id uuid; v_numero integer; v_tipo text; v_nome text; v_doc text; v_desc text; v_valor numeric; v_data date; v_forma text;
  v_parcial boolean := false; v_total numeric; v_hoje date := public.hoje_brasil(); v_existente integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login para emitir recibos.' USING ERRCODE = '28000'; END IF;
  IF p_id_empresa IS NULL OR NOT public.pode_operar_comercial(p_id_empresa) THEN RAISE EXCEPTION 'Sem permissão para emitir recibos nesta empresa.' USING ERRCODE = '42501'; END IF;
  IF p_chave IS NOT NULL THEN
    SELECT id INTO v_id FROM public.recibos WHERE id_empresa = p_id_empresa AND chave_idempotencia = p_chave;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  SELECT * INTO e FROM public.empresas WHERE id = p_id_empresa;
  v_desc := btrim(coalesce(p_descricao, ''));
  v_doc := nullif(regexp_replace(coalesce(p_pessoa_documento, ''), '\D', '', 'g'), '');

  IF p_id_lancamento IS NOT NULL THEN
    SELECT * INTO l FROM public.lancamentos_financeiros WHERE id = p_id_lancamento FOR UPDATE;
    IF l.id IS NULL OR l.id_empresa <> p_id_empresa OR l.excluido_em IS NOT NULL THEN RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE = '42501'; END IF;
    IF l.status <> 'pago' THEN RAISE EXCEPTION 'Só pagamentos confirmados (baixados) geram recibo.' USING ERRCODE = 'check_violation'; END IF;
    SELECT numero INTO v_existente FROM public.recibos WHERE id_lancamento = l.id AND situacao = 'emitido';
    IF v_existente IS NOT NULL THEN RAISE EXCEPTION 'Este pagamento já tem o recibo nº %. Use a segunda via.', lpad(v_existente::text, 6, '0') USING ERRCODE = 'check_violation'; END IF;
    v_tipo := CASE WHEN l.tipo = 'receita' THEN 'recebimento' ELSE 'pagamento' END;
    v_valor := l.valor; v_data := l.data_pagamento;
    IF v_desc = '' THEN v_desc := l.descricao; END IF;
    IF l.id_venda IS NOT NULL THEN SELECT * INTO vd FROM public.vendas WHERE id = l.id_venda; END IF;
    IF l.id_compra IS NOT NULL THEN SELECT * INTO cp FROM public.compras WHERE id = l.id_compra; SELECT * INTO fo FROM public.fornecedores WHERE id = cp.id_fornecedor; END IF;
    v_forma := coalesce(vd.forma_pagamento, cp.forma_pagamento, CASE WHEN p_forma_pagamento IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'cheque', 'outro') THEN p_forma_pagamento END, 'outro');
    -- Parcial: a mesma operação (venda/compra/folha) ainda tem saldo pendente
    IF l.id_venda IS NOT NULL OR l.id_compra IS NOT NULL OR l.id_folha IS NOT NULL THEN
      SELECT EXISTS (SELECT 1 FROM public.lancamentos_financeiros x WHERE x.excluido_em IS NULL AND x.status = 'pendente' AND x.id <> l.id
                       AND ((l.id_venda IS NOT NULL AND x.id_venda = l.id_venda) OR (l.id_compra IS NOT NULL AND x.id_compra = l.id_compra) OR (l.id_folha IS NOT NULL AND x.id_folha = l.id_folha))),
             (SELECT sum(x.valor) FROM public.lancamentos_financeiros x WHERE x.excluido_em IS NULL AND x.status <> 'cancelado'
                AND ((l.id_venda IS NOT NULL AND x.id_venda = l.id_venda) OR (l.id_compra IS NOT NULL AND x.id_compra = l.id_compra) OR (l.id_folha IS NOT NULL AND x.id_folha = l.id_folha)))
        INTO v_parcial, v_total;
      IF NOT v_parcial THEN v_total := NULL; END IF;
    END IF;
    -- Pessoa: cliente do lançamento; senão fornecedor da compra; senão contraparte/informado
    IF l.id_cliente IS NOT NULL THEN SELECT * INTO cl FROM public.clientes WHERE id = l.id_cliente; END IF;
    v_nome := coalesce(nullif(cl.nome, ''), nullif(fo.nome, ''), nullif(btrim(coalesce(p_pessoa_nome, '')), ''), l.contraparte);
    v_doc := coalesce(cl.documento, fo.documento, v_doc);
    IF v_nome IS NULL OR char_length(v_nome) < 2 THEN RAISE EXCEPTION 'Informe o nome de quem pagou (ou recebeu).' USING ERRCODE = 'check_violation'; END IF;
  ELSE
    IF NOT coalesce(p_declaracao, false) THEN RAISE EXCEPTION 'Confirme que o valor foi efetivamente recebido.' USING ERRCODE = 'check_violation'; END IF;
    IF p_valor IS NULL OR p_valor <= 0 OR p_valor <> round(p_valor, 2) OR p_valor > 999999999.99 THEN RAISE EXCEPTION 'Informe um valor válido.' USING ERRCODE = 'check_violation'; END IF;
    IF p_data_pagamento IS NULL OR p_data_pagamento > v_hoje OR p_data_pagamento < v_hoje - 3650 THEN RAISE EXCEPTION 'Data do pagamento inválida (não pode ser futura).' USING ERRCODE = 'check_violation'; END IF;
    IF coalesce(p_forma_pagamento, '') NOT IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'cheque', 'outro') THEN RAISE EXCEPTION 'Forma de pagamento inválida.' USING ERRCODE = 'check_violation'; END IF;
    IF coalesce(p_parcial, false) AND p_valor_total IS NOT NULL AND p_valor_total <= p_valor THEN RAISE EXCEPTION 'No pagamento parcial, o total da operação deve ser maior que o valor recebido.' USING ERRCODE = 'check_violation'; END IF;
    v_tipo := 'recebimento'; v_valor := p_valor; v_data := p_data_pagamento; v_forma := p_forma_pagamento;
    v_parcial := coalesce(p_parcial, false); v_total := CASE WHEN v_parcial THEN p_valor_total END;
    IF p_id_cliente IS NOT NULL THEN
      SELECT * INTO cl FROM public.clientes WHERE id = p_id_cliente;
      IF cl.id IS NULL OR cl.id_empresa <> p_id_empresa THEN RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE = '42501'; END IF;
      v_nome := cl.nome; v_doc := cl.documento;
    ELSE
      v_nome := btrim(coalesce(p_pessoa_nome, ''));
      IF char_length(v_nome) NOT BETWEEN 2 AND 150 THEN RAISE EXCEPTION 'Informe o nome do pagador.' USING ERRCODE = 'check_violation'; END IF;
      IF v_doc IS NOT NULL AND NOT ((length(v_doc) = 11 AND public.cpf_valido(v_doc)) OR (length(v_doc) = 14 AND public.cnpj_valido(v_doc))) THEN
        RAISE EXCEPTION 'CPF/CNPJ do pagador inválido.' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    IF char_length(v_desc) < 3 THEN RAISE EXCEPTION 'Descreva o pagamento (mínimo 3 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('recibos:' || p_id_empresa::text));
  -- Rechecagem após a trava (duas emissões simultâneas do mesmo pagamento / mesma chave)
  IF p_chave IS NOT NULL THEN
    SELECT id INTO v_id FROM public.recibos WHERE id_empresa = p_id_empresa AND chave_idempotencia = p_chave;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  SELECT coalesce(max(numero), 0) + 1 INTO v_numero FROM public.recibos WHERE id_empresa = p_id_empresa;
  INSERT INTO public.recibos (id_empresa, numero, tipo, origem, conciliado, id_lancamento, id_cliente, id_venda, id_compra,
                              emitente_nome, emitente_documento, emitente_cidade, emitente_contato, pessoa_nome, pessoa_documento, descricao, valor, valor_extenso,
                              data_pagamento, forma_pagamento, parcial, valor_total_operacao, declaracao_recebimento, observacoes, chave_idempotencia, emitido_por)
  VALUES (p_id_empresa, v_numero, v_tipo, CASE WHEN l.id IS NULL THEN 'manual' ELSE 'financeiro' END, l.id IS NOT NULL, l.id, cl.id, l.id_venda, l.id_compra,
          coalesce(nullif(e.razao_social, ''), e.nome_comercial), e.cnpj, nullif(concat_ws('/', e.cidade, e.estado), ''), coalesce(e.telefone, e.email_comercial),
          left(v_nome, 150), v_doc, left(v_desc, 300), v_valor, public.valor_por_extenso(v_valor), v_data, v_forma, v_parcial, v_total,
          l.id IS NULL OR coalesce(p_declaracao, false), nullif(btrim(coalesce(p_observacoes, '')), ''), p_chave, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.historico_recibos (id_empresa, id_recibo, acao, dados, id_usuario)
  VALUES (p_id_empresa, v_id, 'emitido', jsonb_build_object('numero', v_numero, 'valor', v_valor, 'origem', CASE WHEN l.id IS NULL THEN 'manual' ELSE 'financeiro' END), auth.uid());
  IF cl.id IS NOT NULL THEN
    INSERT INTO public.historico_clientes (id_empresa, id_cliente, acao, dados, id_usuario)
    VALUES (p_id_empresa, cl.id, 'recibo_emitido', jsonb_build_object('descricao', 'Recibo nº ' || lpad(v_numero::text, 6, '0'), 'valor', v_valor), auth.uid());
  END IF;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Já existe um recibo ativo para este pagamento.' USING ERRCODE = '23505';
END;
$$;

-- Manual → vínculo com um recebimento confirmado (mesmo valor). Só muda vínculo/conciliação; o documento fica igual.
CREATE OR REPLACE FUNCTION public.conciliar_recibo(p_id_recibo uuid, p_id_lancamento uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.recibos; l public.lancamentos_financeiros;
BEGIN
  SELECT * INTO r FROM public.recibos WHERE id = p_id_recibo FOR UPDATE;
  IF r.id IS NULL OR NOT public.pode_operar_comercial(r.id_empresa) THEN RAISE EXCEPTION 'Recibo não encontrado.' USING ERRCODE = '42501'; END IF;
  IF r.situacao <> 'emitido' OR r.origem <> 'manual' OR r.conciliado THEN RAISE EXCEPTION 'Só recibos manuais emitidos e não conciliados podem ser vinculados.' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO l FROM public.lancamentos_financeiros WHERE id = p_id_lancamento FOR UPDATE;
  IF l.id IS NULL OR l.id_empresa <> r.id_empresa OR l.excluido_em IS NOT NULL THEN RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE = '42501'; END IF;
  IF l.tipo <> 'receita' OR l.status <> 'pago' THEN RAISE EXCEPTION 'Vincule a um recebimento confirmado (receita paga).' USING ERRCODE = 'check_violation'; END IF;
  IF l.valor <> r.valor THEN RAISE EXCEPTION 'O valor do recebimento (%) é diferente do recibo (%).', l.valor, r.valor USING ERRCODE = 'check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM public.recibos x WHERE x.id_lancamento = l.id AND x.situacao = 'emitido') THEN RAISE EXCEPTION 'Este recebimento já tem recibo.' USING ERRCODE = '23505'; END IF;
  UPDATE public.recibos SET id_lancamento = l.id, id_venda = l.id_venda, conciliado = true WHERE id = r.id;
  INSERT INTO public.historico_recibos (id_empresa, id_recibo, acao, dados, id_usuario) VALUES (r.id_empresa, r.id, 'conciliado', jsonb_build_object('lancamento', l.descricao), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_recibo(p_id_recibo uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.recibos;
BEGIN
  SELECT * INTO r FROM public.recibos WHERE id = p_id_recibo FOR UPDATE;
  IF r.id IS NULL OR NOT public.pode_operar_comercial(r.id_empresa) THEN RAISE EXCEPTION 'Recibo não encontrado.' USING ERRCODE = '42501'; END IF;
  IF r.situacao = 'cancelado' THEN RAISE EXCEPTION 'Este recibo já está cancelado.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(btrim(coalesce(p_motivo, ''))) < 5 THEN RAISE EXCEPTION 'Informe a justificativa do cancelamento (mínimo 5 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.recibos SET situacao = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = left(btrim(p_motivo), 500) WHERE id = r.id;
  INSERT INTO public.historico_recibos (id_empresa, id_recibo, acao, dados, id_usuario) VALUES (r.id_empresa, r.id, 'cancelado', jsonb_build_object('motivo', btrim(p_motivo)), auth.uid());
  IF r.id_cliente IS NOT NULL THEN
    INSERT INTO public.historico_clientes (id_empresa, id_cliente, acao, dados, id_usuario)
    VALUES (r.id_empresa, r.id_cliente, 'recibo_cancelado', jsonb_build_object('descricao', 'Recibo nº ' || lpad(r.numero::text, 6, '0'), 'valor', r.valor), auth.uid());
  END IF;
END;
$$;

-- Auditoria de segunda via, download e compartilhamento (quem pode ver, pode registrar)
CREATE OR REPLACE FUNCTION public.registrar_evento_recibo(p_id_recibo uuid, p_acao text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.recibos;
BEGIN
  SELECT * INTO r FROM public.recibos WHERE id = p_id_recibo;
  IF r.id IS NULL OR NOT public.pode_ver_comercial(r.id_empresa) THEN RAISE EXCEPTION 'Recibo não encontrado.' USING ERRCODE = '42501'; END IF;
  IF coalesce(p_acao, '') NOT IN ('segunda_via', 'download', 'compartilhado') THEN RAISE EXCEPTION 'Ação inválida.' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.historico_recibos (id_empresa, id_recibo, acao, id_usuario) VALUES (r.id_empresa, r.id, p_acao, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.buscar_recibos(p_id_empresa uuid, p_busca text DEFAULT NULL, p_tipo text DEFAULT NULL, p_situacao text DEFAULT NULL,
  p_id_cliente uuid DEFAULT NULL, p_inicio date DEFAULT NULL, p_fim date DEFAULT NULL, p_limite integer DEFAULT 10, p_deslocamento integer DEFAULT 0)
RETURNS TABLE (id uuid, numero integer, tipo text, situacao text, origem text, conciliado boolean, pessoa_nome text, descricao text, valor numeric,
               data_pagamento date, forma_pagamento text, parcial boolean, id_cliente uuid, emitido_em timestamptz, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b text := nullif(btrim(coalesce(p_busca, '')), ''); bn text := nullif(ltrim(regexp_replace(coalesce(p_busca, ''), '\D', '', 'g'), '0'), '');
BEGIN
  IF NOT public.pode_ver_comercial(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso aos recibos desta empresa.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT x.id, x.numero, x.tipo, x.situacao, x.origem, x.conciliado, x.pessoa_nome, x.descricao, x.valor, x.data_pagamento, x.forma_pagamento, x.parcial, x.id_cliente, x.emitido_em, count(*) OVER ()
      FROM public.recibos x
     WHERE x.id_empresa = p_id_empresa
       AND (p_tipo IS NULL OR x.tipo = p_tipo) AND (p_situacao IS NULL OR x.situacao = p_situacao) AND (p_id_cliente IS NULL OR x.id_cliente = p_id_cliente)
       AND (p_inicio IS NULL OR x.data_pagamento >= p_inicio) AND (p_fim IS NULL OR x.data_pagamento <= p_fim)
       AND (b IS NULL OR x.pessoa_nome ILIKE '%' || b || '%' OR x.descricao ILIKE '%' || b || '%' OR (bn IS NOT NULL AND (x.numero::text = bn OR (x.valor * 100)::bigint::text = bn OR trunc(x.valor)::text = bn)))
     ORDER BY x.numero DESC
     LIMIT least(greatest(coalesce(p_limite, 10), 1), 100) OFFSET greatest(coalesce(p_deslocamento, 0), 0);
END;
$$;

-- Indicadores (cancelados nunca entram nos valores válidos)
CREATE OR REPLACE FUNCTION public.resumo_recibos(p_id_empresa uuid, p_inicio date, p_fim date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dias integer; v_ai date; v_af date; v_mes date := date_trunc('month', public.hoje_brasil())::date;
BEGIN
  IF NOT public.pode_ver_comercial(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso aos recibos desta empresa.' USING ERRCODE = '42501'; END IF;
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio OR p_fim - p_inicio > 366 THEN RAISE EXCEPTION 'Período inválido.' USING ERRCODE = 'check_violation'; END IF;
  v_dias := p_fim - p_inicio + 1; v_af := p_inicio - 1; v_ai := p_inicio - v_dias;
  RETURN (SELECT jsonb_build_object(
    'emitidos', count(*) FILTER (WHERE situacao = 'emitido' AND data_pagamento BETWEEN p_inicio AND p_fim),
    'emitidos_anterior', count(*) FILTER (WHERE situacao = 'emitido' AND data_pagamento BETWEEN v_ai AND v_af),
    'valor_recebido', coalesce(sum(valor) FILTER (WHERE situacao = 'emitido' AND tipo = 'recebimento' AND data_pagamento BETWEEN p_inicio AND p_fim), 0),
    'valor_recebido_anterior', coalesce(sum(valor) FILTER (WHERE situacao = 'emitido' AND tipo = 'recebimento' AND data_pagamento BETWEEN v_ai AND v_af), 0),
    'valor_pago', coalesce(sum(valor) FILTER (WHERE situacao = 'emitido' AND tipo = 'pagamento' AND data_pagamento BETWEEN p_inicio AND p_fim), 0),
    'cancelados', count(*) FILTER (WHERE situacao = 'cancelado' AND data_pagamento BETWEEN p_inicio AND p_fim),
    'nao_conciliados', count(*) FILTER (WHERE situacao = 'emitido' AND NOT conciliado),
    'mes_quantidade', count(*) FILTER (WHERE situacao = 'emitido' AND (emitido_em AT TIME ZONE 'America/Sao_Paulo')::date >= v_mes),
    'mes_valor', coalesce(sum(valor) FILTER (WHERE situacao = 'emitido' AND (emitido_em AT TIME ZONE 'America/Sao_Paulo')::date >= v_mes), 0))
    FROM public.recibos WHERE id_empresa = p_id_empresa);
END;
$$;

-- Pagamentos confirmados ainda sem recibo ativo (para emitir vinculado)
CREATE OR REPLACE FUNCTION public.pagamentos_sem_recibo(p_id_empresa uuid, p_tipo text DEFAULT NULL, p_busca text DEFAULT NULL)
RETURNS TABLE (id uuid, tipo text, descricao text, valor numeric, data_pagamento date, contraparte text, cliente text, id_venda uuid, id_compra uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b text := nullif(btrim(coalesce(p_busca, '')), '');
BEGIN
  IF NOT public.pode_operar_comercial(p_id_empresa) THEN RAISE EXCEPTION 'Sem permissão para emitir recibos nesta empresa.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT l.id, l.tipo, l.descricao, l.valor, l.data_pagamento, l.contraparte, c.nome, l.id_venda, l.id_compra
      FROM public.lancamentos_financeiros l LEFT JOIN public.clientes c ON c.id = l.id_cliente
     WHERE l.id_empresa = p_id_empresa AND l.status = 'pago' AND l.excluido_em IS NULL
       AND (p_tipo IS NULL OR l.tipo = p_tipo)
       AND NOT EXISTS (SELECT 1 FROM public.recibos r WHERE r.id_lancamento = l.id AND r.situacao = 'emitido')
       AND (b IS NULL OR l.descricao ILIKE '%' || b || '%' OR l.contraparte ILIKE '%' || b || '%' OR c.nome ILIKE '%' || b || '%')
     ORDER BY l.data_pagamento DESC, l.descricao LIMIT 50;
END;
$$;

REVOKE ALL ON FUNCTION public.proteger_recibo(), public.impedir_exclusao_recibo() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.extenso_ate_999(integer), public.valor_por_extenso(numeric),
  public.emitir_recibo(uuid, uuid, uuid, text, text, text, numeric, date, text, boolean, numeric, boolean, text, uuid),
  public.conciliar_recibo(uuid, uuid), public.cancelar_recibo(uuid, text), public.registrar_evento_recibo(uuid, text),
  public.buscar_recibos(uuid, text, text, text, uuid, date, date, integer, integer), public.resumo_recibos(uuid, date, date),
  public.pagamentos_sem_recibo(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.valor_por_extenso(numeric),
  public.emitir_recibo(uuid, uuid, uuid, text, text, text, numeric, date, text, boolean, numeric, boolean, text, uuid),
  public.conciliar_recibo(uuid, uuid), public.cancelar_recibo(uuid, text), public.registrar_evento_recibo(uuid, text),
  public.buscar_recibos(uuid, text, text, text, uuid, date, date, integer, integer), public.resumo_recibos(uuid, date, date),
  public.pagamentos_sem_recibo(uuid, text, text) TO authenticated;
