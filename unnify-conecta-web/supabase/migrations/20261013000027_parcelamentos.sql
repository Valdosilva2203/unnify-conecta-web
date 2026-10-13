-- Parcelamentos: contratos (compra/boleto parcelado, financiamento, empréstimo) cujas parcelas SÃO lançamentos
-- de despesa comuns (aparecem em Contas a pagar; pagamento/estorno pelas MESMAS funções do Financeiro).
-- Saldo devedor e situação do contrato são CALCULADOS (nunca editados).
-- Empréstimo/financiamento: parcelas com natureza 'financiamento' (não entram em "Despesas do mês" operacionais);
-- juros informados ficam separados. Sem Price/SAC automático nesta fase.

-- 1. Contrato
CREATE TABLE public.contratos_parcelados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  nome text NOT NULL,
  tipo text NOT NULL,
  contraparte text,
  id_categoria uuid NOT NULL REFERENCES public.categorias_financeiras(id) ON DELETE RESTRICT,
  descricao text,
  data_contratacao date NOT NULL,
  valor_principal numeric(14, 2) NOT NULL,
  valor_total numeric(14, 2) NOT NULL,
  taxa_juros_mensal numeric(7, 4),
  modalidade text NOT NULL,
  id_conta_financeira uuid REFERENCES public.contas_financeiras(id) ON DELETE RESTRICT,
  cancelado_em timestamptz,
  cancelado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  motivo_cancelamento text,
  excluido_em timestamptz,
  excluido_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contratos_tipo CHECK (tipo IN ('compra_parcelada', 'boleto_parcelado', 'financiamento', 'emprestimo')),
  CONSTRAINT contratos_modalidade CHECK (modalidade IN ('fixas', 'personalizadas')),
  CONSTRAINT contratos_nome CHECK (char_length(btrim(nome)) BETWEEN 2 AND 120),
  CONSTRAINT contratos_contraparte CHECK (contraparte IS NULL OR char_length(contraparte) <= 120),
  CONSTRAINT contratos_descricao CHECK (descricao IS NULL OR char_length(descricao) <= 1000),
  CONSTRAINT contratos_valores CHECK (valor_principal > 0 AND valor_total > 0 AND valor_total <= 999999999999.99 AND valor_principal <= valor_total),
  CONSTRAINT contratos_juros CHECK (taxa_juros_mensal IS NULL OR taxa_juros_mensal BETWEEN 0 AND 100),
  CONSTRAINT contratos_data CHECK (data_contratacao BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
  CONSTRAINT contratos_motivo CHECK (motivo_cancelamento IS NULL OR char_length(motivo_cancelamento) <= 500)
);
CREATE INDEX idx_contratos_empresa ON public.contratos_parcelados (id_empresa) WHERE excluido_em IS NULL;

-- 2. Parcelas = lançamentos de despesa vinculados ao contrato
ALTER TABLE public.lancamentos_financeiros
  ADD COLUMN id_contrato uuid REFERENCES public.contratos_parcelados(id) ON DELETE RESTRICT,
  ADD COLUMN numero_parcela integer,
  ADD COLUMN natureza_financeira text NOT NULL DEFAULT 'operacional',
  ADD COLUMN valor_juros numeric(14, 2);
ALTER TABLE public.lancamentos_financeiros
  ADD CONSTRAINT lancamentos_natureza CHECK (natureza_financeira IN ('operacional', 'financiamento')),
  ADD CONSTRAINT lancamentos_parcela_contrato CHECK ((id_contrato IS NULL) = (numero_parcela IS NULL) AND (numero_parcela IS NULL OR numero_parcela BETWEEN 0 AND 600)),
  ADD CONSTRAINT lancamentos_juros CHECK (valor_juros IS NULL OR (valor_juros >= 0 AND valor_juros <= valor));
-- Cada parcela existe uma única vez por contrato (0 = entrada)
CREATE UNIQUE INDEX lancamentos_parcela_unica ON public.lancamentos_financeiros (id_contrato, numero_parcela) WHERE id_contrato IS NOT NULL AND excluido_em IS NULL;

-- Parcela de contrato: valor, vencimento, categoria e vínculo não mudam pelas telas genéricas; cancelar/excluir
-- só pelo contrato. Pagamento e estorno continuam pelas funções de baixa (não são bloqueados aqui).
CREATE OR REPLACE FUNCTION public.proteger_parcela_contrato()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.id_contrato IS NULL OR current_setting('unnify.operacao_contrato', true) = 'sim' THEN
    RETURN NEW;
  END IF;
  IF NEW.id_contrato IS DISTINCT FROM OLD.id_contrato OR NEW.numero_parcela IS DISTINCT FROM OLD.numero_parcela
     OR NEW.valor IS DISTINCT FROM OLD.valor OR NEW.data_vencimento IS DISTINCT FROM OLD.data_vencimento
     OR NEW.id_categoria IS DISTINCT FROM OLD.id_categoria OR NEW.natureza_financeira IS DISTINCT FROM OLD.natureza_financeira
     OR NEW.valor_juros IS DISTINCT FROM OLD.valor_juros THEN
    RAISE EXCEPTION 'Esta parcela pertence a um contrato: valor, vencimento e categoria são definidos no contrato.' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.status = 'cancelado' AND OLD.status <> 'cancelado') OR (NEW.excluido_em IS NOT NULL AND OLD.excluido_em IS NULL) THEN
    RAISE EXCEPTION 'Esta parcela pertence a um contrato: cancele ou exclua pelo contrato em Parcelamentos.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER proteger_parcela_contrato BEFORE UPDATE ON public.lancamentos_financeiros
  FOR EACH ROW EXECUTE FUNCTION public.proteger_parcela_contrato();

-- 3. Anexos e histórico do contrato
CREATE TABLE public.anexos_contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_contrato uuid NOT NULL REFERENCES public.contratos_parcelados(id) ON DELETE RESTRICT,
  caminho text NOT NULL UNIQUE,
  nome_arquivo text NOT NULL,
  tipo_mime text NOT NULL,
  tamanho integer NOT NULL,
  enviado_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  excluido_em timestamptz,
  excluido_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL,
  CONSTRAINT anexos_contratos_tipo CHECK (tipo_mime IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT anexos_contratos_tamanho CHECK (tamanho > 0 AND tamanho <= 10485760),
  CONSTRAINT anexos_contratos_nome CHECK (char_length(nome_arquivo) BETWEEN 1 AND 200)
);

CREATE TABLE public.historico_contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  id_contrato uuid NOT NULL REFERENCES public.contratos_parcelados(id) ON DELETE RESTRICT,
  acao text NOT NULL,
  dados jsonb,
  id_usuario uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historico_contratos_acao CHECK (acao IN ('criado', 'cancelado', 'excluido', 'anexo_adicionado', 'anexo_removido'))
);

-- 4. RLS: leitura por permissão financeira; escrita só por funções
ALTER TABLE public.contratos_parcelados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anexos_contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_contratos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contratos_parcelados, public.anexos_contratos, public.historico_contratos FROM anon, authenticated;
GRANT SELECT ON public.contratos_parcelados, public.anexos_contratos, public.historico_contratos TO authenticated;
CREATE POLICY "Parcelamentos: contratos da empresa" ON public.contratos_parcelados FOR SELECT TO authenticated
  USING (excluido_em IS NULL AND public.pode_ver_financeiro(id_empresa));
CREATE POLICY "Parcelamentos: anexos da empresa" ON public.anexos_contratos FOR SELECT TO authenticated
  USING (excluido_em IS NULL AND public.pode_ver_comprovantes_financeiros(id_empresa));
CREATE POLICY "Parcelamentos: histórico da empresa" ON public.historico_contratos FOR SELECT TO authenticated
  USING (public.pode_ver_financeiro(id_empresa));

-- Anexos do contrato: <id_empresa>/contratos/<id_contrato>/<arquivo> no bucket privado de comprovantes
CREATE POLICY "Comprovantes financeiros: envio de anexo de contrato" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'comprovantes-financeiros'
              AND (storage.foldername(name))[2] = 'contratos'
              AND public.pode_gerenciar_financeiro(public.uuid_ou_nulo((storage.foldername(name))[1]))
              AND EXISTS (SELECT 1 FROM public.contratos_parcelados c
                           WHERE c.id = public.uuid_ou_nulo((storage.foldername(name))[3])
                             AND c.id_empresa = public.uuid_ou_nulo((storage.foldername(name))[1])
                             AND c.excluido_em IS NULL));

-- 5. Visão das parcelas na lista do Financeiro (traz contrato e natureza)
CREATE OR REPLACE VIEW public.lancamentos_financeiros_situacao WITH (security_invoker = true) AS
SELECT l.id, l.id_empresa, l.tipo, l.descricao, l.valor, l.id_categoria, c.nome AS categoria_nome, c.cor AS categoria_cor,
       l.data_competencia, l.data_vencimento, l.data_pagamento, l.status,
       CASE WHEN l.status = 'pendente' AND l.data_vencimento < public.hoje_brasil() THEN 'vencido' ELSE l.status END AS situacao,
       l.contraparte, l.observacoes, l.criado_em, l.atualizado_em, l.baixado_em, l.baixado_por,
       (SELECT count(*) FROM public.anexos_financeiros a WHERE a.id_lancamento = l.id AND a.excluido_em IS NULL) AS qtd_anexos,
       l.id_conta_financeira, cf.nome AS conta_nome, c.icone AS categoria_icone,
       l.id_contrato, l.numero_parcela, l.natureza_financeira, l.valor_juros, ct.nome AS contrato_nome,
       (SELECT count(*) FROM public.lancamentos_financeiros x WHERE x.id_contrato = l.id_contrato AND x.numero_parcela > 0 AND x.excluido_em IS NULL) AS contrato_qtd_parcelas
  FROM public.lancamentos_financeiros l
  JOIN public.categorias_financeiras c ON c.id = l.id_categoria
  LEFT JOIN public.contas_financeiras cf ON cf.id = l.id_conta_financeira
  LEFT JOIN public.contratos_parcelados ct ON ct.id = l.id_contrato
 WHERE l.excluido_em IS NULL;

-- 6. Resumo por contrato (saldo devedor e situação CALCULADOS)
CREATE VIEW public.contratos_parcelados_resumo WITH (security_invoker = true) AS
SELECT c.id, c.id_empresa, c.nome, c.tipo, c.contraparte, c.id_categoria, cat.nome AS categoria_nome, cat.cor AS categoria_cor,
       cat.icone AS categoria_icone, c.descricao, c.data_contratacao, c.valor_principal, c.valor_total, c.taxa_juros_mensal,
       c.modalidade, c.id_conta_financeira, cf.nome AS conta_nome, c.cancelado_em, c.motivo_cancelamento, c.criado_em,
       p.qtd_parcelas, p.qtd_pagas, p.qtd_atrasadas, p.qtd_canceladas, p.valor_pago, p.saldo_devedor, p.proximo_vencimento, p.valor_proxima,
       p.juros_previstos, p.tem_entrada,
       CASE WHEN c.cancelado_em IS NOT NULL THEN 'cancelado'
            WHEN p.qtd_pendentes = 0 AND p.qtd_pagas > 0 THEN 'quitado'
            WHEN p.qtd_atrasadas > 0 THEN 'em_atraso'
            ELSE 'ativo' END AS situacao,
       CASE WHEN p.valor_obrigacoes > 0 THEN round(p.valor_pago * 100 / p.valor_obrigacoes, 1) ELSE 0 END AS percentual_quitado
  FROM public.contratos_parcelados c
  JOIN public.categorias_financeiras cat ON cat.id = c.id_categoria
  LEFT JOIN public.contas_financeiras cf ON cf.id = c.id_conta_financeira
  CROSS JOIN LATERAL (
    SELECT count(*) FILTER (WHERE l.numero_parcela > 0) AS qtd_parcelas,
           count(*) FILTER (WHERE l.status = 'pago') AS qtd_pagas,
           count(*) FILTER (WHERE l.status = 'pendente') AS qtd_pendentes,
           count(*) FILTER (WHERE l.status = 'cancelado') AS qtd_canceladas,
           count(*) FILTER (WHERE l.status = 'pendente' AND l.data_vencimento < public.hoje_brasil()) AS qtd_atrasadas,
           coalesce(sum(l.valor) FILTER (WHERE l.status = 'pago'), 0) AS valor_pago,
           coalesce(sum(l.valor) FILTER (WHERE l.status = 'pendente'), 0) AS saldo_devedor,
           coalesce(sum(l.valor) FILTER (WHERE l.status <> 'cancelado'), 0) AS valor_obrigacoes,
           coalesce(sum(l.valor_juros), 0) AS juros_previstos,
           min(l.data_vencimento) FILTER (WHERE l.status = 'pendente') AS proximo_vencimento,
           (SELECT x.valor FROM public.lancamentos_financeiros x WHERE x.id_contrato = c.id AND x.status = 'pendente' AND x.excluido_em IS NULL
             ORDER BY x.data_vencimento, x.numero_parcela LIMIT 1) AS valor_proxima,
           bool_or(l.numero_parcela = 0) AS tem_entrada
      FROM public.lancamentos_financeiros l
     WHERE l.id_contrato = c.id AND l.excluido_em IS NULL
  ) p
 WHERE c.excluido_em IS NULL;
REVOKE ALL ON public.contratos_parcelados_resumo FROM anon, authenticated;
GRANT SELECT ON public.contratos_parcelados_resumo TO authenticated;

-- 7. Parcelas fixas: geração DETERMINÍSTICA no servidor (mesma regra para prévia e gravação).
--    Centavos que sobram da divisão vão para a última parcela. Datas mensais a partir da 1ª (ancoradas nela).
CREATE OR REPLACE FUNCTION public.simular_parcelas_fixas(p_valor_total numeric, p_entrada numeric, p_quantidade integer, p_primeira date)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_saldo numeric := p_valor_total - coalesce(p_entrada, 0);
  v_base numeric;
  v_resultado jsonb := '[]'::jsonb;
BEGIN
  IF p_quantidade IS NULL OR p_quantidade < 1 OR p_quantidade > 360 THEN
    RAISE EXCEPTION 'Quantidade de parcelas inválida (1 a 360).' USING ERRCODE = 'check_violation';
  END IF;
  IF p_valor_total IS NULL OR p_valor_total <= 0 OR coalesce(p_entrada, 0) < 0 OR v_saldo <= 0 THEN
    RAISE EXCEPTION 'Valores inválidos: o total deve ser maior que a entrada.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_primeira IS NULL THEN
    RAISE EXCEPTION 'Informe a data da primeira parcela.' USING ERRCODE = 'check_violation';
  END IF;
  v_base := trunc(v_saldo / p_quantidade, 2);
  IF v_base <= 0 THEN
    RAISE EXCEPTION 'Valor por parcela muito baixo.' USING ERRCODE = 'check_violation';
  END IF;
  FOR i IN 1..p_quantidade LOOP
    v_resultado := v_resultado || jsonb_build_object(
      'numero', i,
      'vencimento', (p_primeira + make_interval(months => i - 1))::date,
      'valor', CASE WHEN i = p_quantidade THEN v_saldo - v_base * (p_quantidade - 1) ELSE v_base END);
  END LOOP;
  RETURN v_resultado;
END;
$$;

-- 8. Criar contrato + parcelas numa ÚNICA transação (falhou → nada fica gravado)
CREATE OR REPLACE FUNCTION public.criar_contrato_parcelado(
  p_id_empresa uuid, p_nome text, p_tipo text, p_contraparte text, p_id_categoria uuid, p_descricao text,
  p_data_contratacao date, p_valor_principal numeric, p_valor_total numeric, p_taxa_juros numeric, p_modalidade text,
  p_id_conta_financeira uuid, p_entrada jsonb, p_parcelas jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_cat public.categorias_financeiras;
  v_natureza text := CASE WHEN p_tipo IN ('financiamento', 'emprestimo') THEN 'financiamento' ELSE 'operacional' END;
  v_qtd integer;
  v_soma numeric := 0;
  v_entrada numeric := 0;
  v_parcela jsonb;
  v_anterior date;
  v_valor numeric;
  v_juros numeric;
  v_venc date;
  v_esperadas jsonb;
  v_restricao text;
BEGIN
  IF NOT public.pode_gerenciar_financeiro(p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para lançar no financeiro desta empresa.' USING ERRCODE = '42501';
  END IF;
  IF p_tipo NOT IN ('compra_parcelada', 'boleto_parcelado', 'financiamento', 'emprestimo') THEN
    RAISE EXCEPTION 'Tipo de parcelamento inválido.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_modalidade NOT IN ('fixas', 'personalizadas') THEN
    RAISE EXCEPTION 'Modalidade inválida.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_cat FROM public.categorias_financeiras WHERE id = p_id_categoria;
  IF v_cat.id IS NULL OR v_cat.id_empresa <> p_id_empresa OR v_cat.tipo <> 'despesa' OR NOT v_cat.ativa THEN
    RAISE EXCEPTION 'Escolha uma categoria de despesa ativa desta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_id_conta_financeira IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.contas_financeiras WHERE id = p_id_conta_financeira AND id_empresa = p_id_empresa AND arquivada_em IS NULL) THEN
    RAISE EXCEPTION 'Conta financeira inválida para esta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_valor_total IS NULL OR p_valor_total <> round(p_valor_total, 2) OR p_valor_principal IS NULL OR p_valor_principal <> round(p_valor_principal, 2) THEN
    RAISE EXCEPTION 'Valores devem ter até 2 casas decimais.' USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(p_parcelas) <> 'array' OR jsonb_array_length(p_parcelas) NOT BETWEEN 1 AND 360 THEN
    RAISE EXCEPTION 'Informe de 1 a 360 parcelas.' USING ERRCODE = 'check_violation';
  END IF;
  v_qtd := jsonb_array_length(p_parcelas);

  -- Entrada (opcional): obrigação nº 0, pendente até ser paga (não mexe em conta nenhuma)
  IF p_entrada IS NOT NULL AND p_entrada <> 'null'::jsonb THEN
    v_entrada := (p_entrada->>'valor')::numeric;
    IF v_entrada IS NULL OR v_entrada <= 0 OR v_entrada <> round(v_entrada, 2) OR (p_entrada->>'vencimento') IS NULL THEN
      RAISE EXCEPTION 'Entrada inválida: informe valor e vencimento.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Validação das parcelas: numeração 1..N, valores positivos com 2 casas, datas válidas e em ordem
  FOR i IN 0..v_qtd - 1 LOOP
    v_parcela := p_parcelas->i;
    v_valor := (v_parcela->>'valor')::numeric;
    v_venc := (v_parcela->>'vencimento')::date;
    v_juros := nullif(v_parcela->>'juros', '')::numeric;
    IF (v_parcela->>'numero')::integer <> i + 1 THEN
      RAISE EXCEPTION 'Numeração das parcelas inválida.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_valor IS NULL OR v_valor <= 0 OR v_valor <> round(v_valor, 2) THEN
      RAISE EXCEPTION 'Parcela %: valor inválido.', i + 1 USING ERRCODE = 'check_violation';
    END IF;
    IF v_venc IS NULL OR v_venc NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31' OR v_venc < p_data_contratacao THEN
      RAISE EXCEPTION 'Parcela %: vencimento inválido (deve ser a partir da contratação).', i + 1 USING ERRCODE = 'check_violation';
    END IF;
    IF v_anterior IS NOT NULL AND v_venc < v_anterior THEN
      RAISE EXCEPTION 'Parcela %: os vencimentos devem estar em ordem.', i + 1 USING ERRCODE = 'check_violation';
    END IF;
    IF v_juros IS NOT NULL AND (v_juros < 0 OR v_juros > v_valor OR v_juros <> round(v_juros, 2)) THEN
      RAISE EXCEPTION 'Parcela %: juros inválidos.', i + 1 USING ERRCODE = 'check_violation';
    END IF;
    v_anterior := v_venc;
    v_soma := v_soma + v_valor;
  END LOOP;
  IF v_soma + v_entrada <> p_valor_total THEN
    RAISE EXCEPTION 'A soma da entrada e das parcelas (%) deve ser igual ao valor total previsto (%).',
      to_char(v_soma + v_entrada, 'FM999G999G999G990D00'), to_char(p_valor_total, 'FM999G999G999G990D00') USING ERRCODE = 'check_violation';
  END IF;
  -- Parcelas fixas: precisam ser exatamente as geradas pela regra determinística do servidor
  IF p_modalidade = 'fixas' THEN
    v_esperadas := public.simular_parcelas_fixas(p_valor_total, v_entrada, v_qtd, (p_parcelas->0->>'vencimento')::date);
    FOR i IN 0..v_qtd - 1 LOOP
      IF (p_parcelas->i->>'valor')::numeric <> (v_esperadas->i->>'valor')::numeric OR (p_parcelas->i->>'vencimento')::date <> (v_esperadas->i->>'vencimento')::date THEN
        RAISE EXCEPTION 'Parcelas fixas não conferem com o cálculo. Use "Parcelas personalizadas" para alterar valores ou datas.' USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.contratos_parcelados (id_empresa, nome, tipo, contraparte, id_categoria, descricao, data_contratacao,
                                           valor_principal, valor_total, taxa_juros_mensal, modalidade, id_conta_financeira, criado_por)
  VALUES (p_id_empresa, btrim(p_nome), p_tipo, nullif(btrim(coalesce(p_contraparte, '')), ''), p_id_categoria, nullif(btrim(coalesce(p_descricao, '')), ''),
          p_data_contratacao, p_valor_principal, p_valor_total, p_taxa_juros, p_modalidade, p_id_conta_financeira, auth.uid())
  RETURNING id INTO v_id;

  PERFORM set_config('unnify.operacao_contrato', 'sim', true);
  IF v_entrada > 0 THEN
    INSERT INTO public.lancamentos_financeiros (id_empresa, tipo, descricao, valor, id_categoria, data_competencia, data_vencimento, status,
                                                contraparte, criado_por, atualizado_por, id_contrato, numero_parcela, natureza_financeira)
    VALUES (p_id_empresa, 'despesa', left(btrim(p_nome), 180) || ' — entrada', v_entrada, p_id_categoria, (p_entrada->>'vencimento')::date,
            (p_entrada->>'vencimento')::date, 'pendente', nullif(btrim(coalesce(p_contraparte, '')), ''), auth.uid(), auth.uid(), v_id, 0, v_natureza);
  END IF;
  FOR i IN 0..v_qtd - 1 LOOP
    v_parcela := p_parcelas->i;
    INSERT INTO public.lancamentos_financeiros (id_empresa, tipo, descricao, valor, id_categoria, data_competencia, data_vencimento, status,
                                                contraparte, criado_por, atualizado_por, id_contrato, numero_parcela, natureza_financeira, valor_juros)
    VALUES (p_id_empresa, 'despesa', left(btrim(p_nome), 170) || ' — parcela ' || (i + 1) || '/' || v_qtd, (v_parcela->>'valor')::numeric,
            p_id_categoria, (v_parcela->>'vencimento')::date, (v_parcela->>'vencimento')::date, 'pendente',
            nullif(btrim(coalesce(p_contraparte, '')), ''), auth.uid(), auth.uid(), v_id, i + 1, v_natureza, nullif(v_parcela->>'juros', '')::numeric);
  END LOOP;
  PERFORM set_config('unnify.operacao_contrato', '', true);

  INSERT INTO public.historico_contratos (id_empresa, id_contrato, acao, dados, id_usuario)
  VALUES (p_id_empresa, v_id, 'criado', jsonb_build_object('valor_total', p_valor_total, 'parcelas', v_qtd, 'entrada', v_entrada), auth.uid());
  RETURN v_id;
EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS v_restricao = CONSTRAINT_NAME;
  IF coalesce(v_restricao, '') = '' THEN RAISE; END IF;
  RAISE EXCEPTION 'Dados do contrato inválidos: confira nome, valores e datas.' USING ERRCODE = 'check_violation';
END;
$$;

-- 9. Cancelar: preserva as parcelas pagas; cancela as pendentes. Excluir: só sem nenhum pagamento (nem estornado).
CREATE OR REPLACE FUNCTION public.cancelar_contrato_parcelado(p_id uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_contrato public.contratos_parcelados;
  v_qtd integer;
BEGIN
  SELECT * INTO v_contrato FROM public.contratos_parcelados WHERE id = p_id AND excluido_em IS NULL FOR UPDATE;
  IF v_contrato.id IS NULL OR NOT public.pode_gerenciar_financeiro(v_contrato.id_empresa) THEN
    RAISE EXCEPTION 'Contrato não encontrado.' USING ERRCODE = '42501';
  END IF;
  IF v_contrato.cancelado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Este contrato já está cancelado.' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(btrim(coalesce(p_motivo, ''))) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento.' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('unnify.operacao_contrato', 'sim', true);
  UPDATE public.lancamentos_financeiros SET status = 'cancelado', cancelado_por = auth.uid(), cancelado_em = now(), atualizado_por = auth.uid()
   WHERE id_contrato = p_id AND status = 'pendente' AND excluido_em IS NULL;
  GET DIAGNOSTICS v_qtd = ROW_COUNT;
  PERFORM set_config('unnify.operacao_contrato', '', true);
  UPDATE public.contratos_parcelados SET cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = btrim(p_motivo), atualizado_em = now()
   WHERE id = p_id;
  INSERT INTO public.historico_contratos (id_empresa, id_contrato, acao, dados, id_usuario)
  VALUES (v_contrato.id_empresa, p_id, 'cancelado', jsonb_build_object('motivo', btrim(p_motivo), 'parcelas_canceladas', v_qtd), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_contrato_parcelado(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_contrato public.contratos_parcelados;
BEGIN
  SELECT * INTO v_contrato FROM public.contratos_parcelados WHERE id = p_id AND excluido_em IS NULL FOR UPDATE;
  IF v_contrato.id IS NULL OR NOT public.pode_gerenciar_financeiro(v_contrato.id_empresa) THEN
    RAISE EXCEPTION 'Contrato não encontrado.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.movimentacoes_financeiras m JOIN public.lancamentos_financeiros l ON l.id = m.id_lancamento WHERE l.id_contrato = p_id) THEN
    RAISE EXCEPTION 'Este contrato tem pagamentos registrados e não pode ser excluído. Use "Cancelar contrato".' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('unnify.operacao_contrato', 'sim', true);
  UPDATE public.lancamentos_financeiros SET excluido_em = now(), excluido_por = auth.uid(), atualizado_por = auth.uid()
   WHERE id_contrato = p_id AND excluido_em IS NULL;
  PERFORM set_config('unnify.operacao_contrato', '', true);
  UPDATE public.contratos_parcelados SET excluido_em = now(), excluido_por = auth.uid(), atualizado_em = now() WHERE id = p_id;
  INSERT INTO public.historico_contratos (id_empresa, id_contrato, acao, id_usuario) VALUES (v_contrato.id_empresa, p_id, 'excluido', auth.uid());
END;
$$;

-- 10. Anexos do contrato
CREATE OR REPLACE FUNCTION public.registrar_anexo_contrato(p_id_contrato uuid, p_caminho text, p_nome_arquivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_contrato public.contratos_parcelados;
  v_obj record;
  v_id uuid;
BEGIN
  SELECT * INTO v_contrato FROM public.contratos_parcelados WHERE id = p_id_contrato AND excluido_em IS NULL;
  IF v_contrato.id IS NULL OR NOT public.pode_gerenciar_financeiro(v_contrato.id_empresa) THEN
    RAISE EXCEPTION 'Contrato não encontrado.' USING ERRCODE = '42501';
  END IF;
  IF p_caminho IS NULL OR p_caminho NOT LIKE v_contrato.id_empresa::text || '/contratos/' || v_contrato.id::text || '/%' THEN
    RAISE EXCEPTION 'Anexo inválido.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT (o.metadata->>'size')::integer AS tamanho, o.metadata->>'mimetype' AS tipo INTO v_obj
    FROM storage.objects o WHERE o.bucket_id = 'comprovantes-financeiros' AND o.name = p_caminho;
  IF v_obj.tamanho IS NULL THEN
    RAISE EXCEPTION 'Arquivo não encontrado.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.anexos_contratos (id_empresa, id_contrato, caminho, nome_arquivo, tipo_mime, tamanho, enviado_por)
  VALUES (v_contrato.id_empresa, v_contrato.id, p_caminho, left(coalesce(nullif(btrim(p_nome_arquivo), ''), 'anexo'), 200), v_obj.tipo, v_obj.tamanho, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.historico_contratos (id_empresa, id_contrato, acao, dados, id_usuario)
  VALUES (v_contrato.id_empresa, v_contrato.id, 'anexo_adicionado', jsonb_build_object('arquivo', p_nome_arquivo), auth.uid());
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remover_anexo_contrato(p_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_anexo public.anexos_contratos;
BEGIN
  SELECT * INTO v_anexo FROM public.anexos_contratos WHERE id = p_id AND excluido_em IS NULL;
  IF v_anexo.id IS NULL OR NOT public.pode_gerenciar_financeiro(v_anexo.id_empresa) THEN
    RAISE EXCEPTION 'Anexo não encontrado.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.anexos_contratos SET excluido_em = now(), excluido_por = auth.uid() WHERE id = p_id;
  INSERT INTO public.historico_contratos (id_empresa, id_contrato, acao, dados, id_usuario)
  VALUES (v_anexo.id_empresa, v_anexo.id_contrato, 'anexo_removido', jsonb_build_object('arquivo', v_anexo.nome_arquivo), auth.uid());
  RETURN v_anexo.caminho;
END;
$$;

-- 11. Indicadores de parcelamentos (regra única no banco; respeitam filtros de tipo e categoria)
CREATE OR REPLACE FUNCTION public.resumo_parcelamentos(p_id_empresa uuid, p_tipo text DEFAULT NULL, p_id_categoria uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.pode_ver_financeiro(p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para ver o financeiro desta empresa.' USING ERRCODE = '42501';
  END IF;
  RETURN (
    WITH c AS (
      SELECT c.id FROM public.contratos_parcelados c
       WHERE c.id_empresa = p_id_empresa AND c.excluido_em IS NULL
         AND (p_tipo IS NULL OR p_tipo = '' OR c.tipo = p_tipo) AND (p_id_categoria IS NULL OR c.id_categoria = p_id_categoria)
    ), l AS (
      SELECT l.* FROM public.lancamentos_financeiros l JOIN c ON c.id = l.id_contrato WHERE l.excluido_em IS NULL
    )
    SELECT jsonb_build_object(
      'contratos_ativos', (SELECT count(*) FROM public.contratos_parcelados x JOIN c ON c.id = x.id
                            WHERE x.cancelado_em IS NULL AND EXISTS (SELECT 1 FROM l WHERE l.id_contrato = x.id AND l.status = 'pendente')),
      'saldo_devedor_total', coalesce((SELECT sum(valor) FROM l WHERE status = 'pendente'), 0),
      'parcelas_pagas', (SELECT count(*) FROM l WHERE status = 'pago'),
      'parcelas_em_atraso', (SELECT count(*) FROM l WHERE status = 'pendente' AND data_vencimento < public.hoje_brasil())
    )
  );
END;
$$;

-- 12. Resumo financeiro: parcelas de empréstimo/financiamento NÃO são despesa operacional (aparecem à parte).
--     O fluxo de caixa (série) continua com todas as saídas pagas — é caixa real. Demais regras inalteradas.
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.resumo_financeiro(uuid,date)'::regprocedure);
BEGIN
  IF position('pagamentos_financiamentos_mes' IN v_def) = 0 THEN
    v_def := replace(v_def,
      $a$'despesas_mes', coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND status = 'pago' AND data_pagamento BETWEEN v_inicio AND v_fim), 0),$a$,
      $b$'despesas_mes', coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND natureza_financeira = 'operacional' AND status = 'pago' AND data_pagamento BETWEEN v_inicio AND v_fim), 0),
      'pagamentos_financiamentos_mes', coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND natureza_financeira = 'financiamento' AND status = 'pago' AND data_pagamento BETWEEN v_inicio AND v_fim), 0),
      'juros_financiamentos_mes', coalesce(sum(valor_juros) FILTER (WHERE tipo = 'despesa' AND natureza_financeira = 'financiamento' AND status = 'pago' AND data_pagamento BETWEEN v_inicio AND v_fim), 0),$b$);
    v_def := replace(v_def,
      $a$'despesas_mes_anterior', coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND status = 'pago'$a$,
      $b$'despesas_mes_anterior', coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND natureza_financeira = 'operacional' AND status = 'pago'$b$);
    v_def := replace(v_def,
      $a$SELECT tipo, valor, status, data_pagamento, data_vencimento, id_categoria$a$,
      $b$SELECT tipo, valor, status, data_pagamento, data_vencimento, id_categoria, natureza_financeira, valor_juros$b$);
    v_def := replace(v_def,
      $a$WHERE b.tipo = 'despesa' AND b.status = 'pago' AND b.data_pagamento BETWEEN v_inicio AND v_fim
                 GROUP BY b.id_categoria$a$,
      $b$WHERE b.tipo = 'despesa' AND b.natureza_financeira = 'operacional' AND b.status = 'pago' AND b.data_pagamento BETWEEN v_inicio AND v_fim
                 GROUP BY b.id_categoria$b$);
    IF position('pagamentos_financiamentos_mes' IN v_def) = 0 OR position('natureza_financeira, valor_juros' IN v_def) = 0
       OR position('b.natureza_financeira = ''operacional''' IN v_def) = 0 THEN
      RAISE EXCEPTION 'resumo_financeiro: trechos esperados não encontrados; ajuste manual necessário.';
    END IF;
    EXECUTE v_def;
  END IF;
END $$;

-- 13. Permissões de execução
REVOKE ALL ON FUNCTION public.proteger_parcela_contrato() FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'simular_parcelas_fixas(numeric, numeric, integer, date)',
    'criar_contrato_parcelado(uuid, text, text, text, uuid, text, date, numeric, numeric, numeric, text, uuid, jsonb, jsonb)',
    'cancelar_contrato_parcelado(uuid, text)', 'excluir_contrato_parcelado(uuid)',
    'registrar_anexo_contrato(uuid, text, text)', 'remover_anexo_contrato(uuid)', 'resumo_parcelamentos(uuid, text, uuid)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
