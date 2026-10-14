-- REVERSÃO da migration 20261013000031 (restaura o estado da 030).
-- Só é segura se nenhum lançamento usar as novas classificações (a checagem abaixo impede perda de informação).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.lancamentos_financeiros WHERE natureza_financeira NOT IN ('operacional', 'financiamento')
                                                              OR (tipo = 'receita' AND natureza_financeira = 'financiamento')) THEN
    RAISE EXCEPTION 'Há lançamentos com as novas classificações; reclassifique-os antes de reverter.';
  END IF;
END;
$$;
DROP FUNCTION public.salvar_lancamento_financeiro(uuid, uuid, text, text, numeric, uuid, date, date, date, text, text, uuid, text);
CREATE OR REPLACE FUNCTION public.salvar_lancamento_financeiro(p_id uuid, p_id_empresa uuid, p_tipo text, p_descricao text, p_valor numeric, p_id_categoria uuid, p_data_competencia date, p_data_vencimento date, p_data_pagamento date, p_contraparte text, p_observacoes text, p_id_conta_financeira uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_atual public.lancamentos_financeiros;
  v_id uuid;
  v_restricao text;
BEGIN
  IF p_valor IS NULL OR p_valor <= 0 OR p_valor <> round(p_valor, 2) THEN
    RAISE EXCEPTION 'Informe um valor maior que zero, com até 2 casas decimais.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_data_competencia IS NULL THEN
    RAISE EXCEPTION 'Informe a data de competência.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_id IS NULL THEN
    IF NOT public.pode_gerenciar_financeiro(p_id_empresa) THEN
      RAISE EXCEPTION 'Sem permissão para lançar no financeiro desta empresa.' USING ERRCODE = '42501';
    END IF;
    IF p_data_pagamento IS NULL AND p_data_vencimento IS NULL THEN
      RAISE EXCEPTION 'Informe o vencimento ou a data de pagamento.' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.lancamentos_financeiros (id_empresa, tipo, descricao, valor, id_categoria, data_competencia, data_vencimento,
                                                data_pagamento, status, contraparte, observacoes, criado_por, atualizado_por)
    VALUES (p_id_empresa, p_tipo, coalesce(p_descricao, ''), p_valor, p_id_categoria, p_data_competencia,
            coalesce(p_data_vencimento, p_data_pagamento), NULL, 'pendente', p_contraparte, p_observacoes, auth.uid(), auth.uid())
    RETURNING id INTO v_id;
    -- Já pago/recebido: a baixa passa pela mesma regra (conta obrigatória, saldo, movimentação única)
    IF p_data_pagamento IS NOT NULL THEN
      PERFORM public.registrar_baixa_lancamento(v_id, p_data_pagamento, p_id_conta_financeira, p_valor);
    END IF;
    RETURN v_id;
  END IF;

  SELECT * INTO v_atual FROM public.lancamentos_financeiros WHERE id = p_id AND excluido_em IS NULL FOR UPDATE;
  IF v_atual.id IS NULL OR NOT public.pode_gerenciar_financeiro(v_atual.id_empresa) THEN
    RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE = '42501';
  END IF;
  IF v_atual.status = 'cancelado' THEN
    RAISE EXCEPTION 'Lançamentos cancelados não podem ser editados.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_atual.status = 'pendente' AND p_data_pagamento IS NOT NULL THEN
    RAISE EXCEPTION 'Para marcar como pago, use "Registrar pagamento".' USING ERRCODE = 'check_violation';
  END IF;
  IF v_atual.status = 'pago' AND (p_valor <> v_atual.valor OR p_data_pagamento IS DISTINCT FROM v_atual.data_pagamento) THEN
    RAISE EXCEPTION 'Para alterar valor ou data de um lançamento pago, estorne o pagamento primeiro.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.lancamentos_financeiros
     SET descricao = coalesce(p_descricao, ''), valor = p_valor, id_categoria = p_id_categoria,
         data_competencia = p_data_competencia, data_vencimento = p_data_vencimento,
         contraparte = p_contraparte, observacoes = p_observacoes, atualizado_por = auth.uid()
   WHERE id = p_id;
  RETURN p_id;
EXCEPTION
  WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_restricao = CONSTRAINT_NAME;
    IF coalesce(v_restricao, '') = '' THEN RAISE; END IF;
    RAISE EXCEPTION 'Dados inválidos: confira descrição, valor e datas.' USING ERRCODE = 'check_violation';
END;
$function$;
REVOKE ALL ON FUNCTION public.salvar_lancamento_financeiro(uuid, uuid, text, text, numeric, uuid, date, date, date, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_lancamento_financeiro(uuid, uuid, text, text, numeric, uuid, date, date, date, text, text, uuid) TO authenticated, service_role;
DROP FUNCTION IF EXISTS public.validar_natureza_lancamento(text, text);
ALTER TABLE public.lancamentos_financeiros DROP CONSTRAINT lancamentos_natureza;
ALTER TABLE public.lancamentos_financeiros ADD CONSTRAINT lancamentos_natureza CHECK ((natureza_financeira = ANY (ARRAY['operacional'::text, 'financiamento'::text])));
CREATE OR REPLACE FUNCTION public.resumo_financeiro(p_id_empresa uuid, p_mes date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inicio date := date_trunc('month', coalesce(p_mes, public.hoje_brasil()))::date;
  v_fim date := (date_trunc('month', coalesce(p_mes, public.hoje_brasil())) + interval '1 month - 1 day')::date;
  v_ini_ant date := (date_trunc('month', coalesce(p_mes, public.hoje_brasil())) - interval '1 month')::date;
  v_hoje date := public.hoje_brasil();
  v_saldo numeric;
  v_qtd_contas integer;
BEGIN
  IF NOT public.pode_ver_financeiro(p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para ver o financeiro desta empresa.' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(sum(public.saldo_conta_financeira(c.id, v_fim)) FILTER (WHERE c.data_saldo_inicial <= v_fim), 0), count(*)
    INTO v_saldo, v_qtd_contas
    FROM public.contas_financeiras c WHERE c.id_empresa = p_id_empresa;
  RETURN (
    WITH base AS (
      SELECT tipo, valor, status, data_pagamento, data_vencimento, id_categoria, natureza_financeira, valor_juros
        FROM public.lancamentos_financeiros
       WHERE id_empresa = p_id_empresa AND excluido_em IS NULL
    )
    SELECT jsonb_build_object(
      'periodo_inicio', v_inicio, 'periodo_fim', v_fim, 'hoje', v_hoje,
      'receitas_mes', coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND status = 'pago' AND data_pagamento BETWEEN v_inicio AND v_fim), 0),
      'despesas_mes', coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND natureza_financeira = 'operacional' AND status = 'pago' AND data_pagamento BETWEEN v_inicio AND v_fim), 0),
      'pagamentos_financiamentos_mes', coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND natureza_financeira = 'financiamento' AND status = 'pago' AND data_pagamento BETWEEN v_inicio AND v_fim), 0),
      'juros_financiamentos_mes', coalesce(sum(valor_juros) FILTER (WHERE tipo = 'despesa' AND natureza_financeira = 'financiamento' AND status = 'pago' AND data_pagamento BETWEEN v_inicio AND v_fim), 0),
      'receitas_mes_anterior', coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND status = 'pago' AND data_pagamento BETWEEN v_ini_ant AND v_inicio - 1), 0),
      'despesas_mes_anterior', coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND natureza_financeira = 'operacional' AND status = 'pago' AND data_pagamento BETWEEN v_ini_ant AND v_inicio - 1), 0),
      'saldo_acumulado', v_saldo,
      'qtd_contas', v_qtd_contas,
      'a_pagar_30_valor', coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND status = 'pendente' AND data_vencimento BETWEEN v_hoje AND v_hoje + 30), 0),
      'a_pagar_30_qtd', count(*) FILTER (WHERE tipo = 'despesa' AND status = 'pendente' AND data_vencimento BETWEEN v_hoje AND v_hoje + 30),
      'a_pagar_vencidas_qtd', count(*) FILTER (WHERE tipo = 'despesa' AND status = 'pendente' AND data_vencimento < v_hoje),
      'a_receber_vencidas_qtd', count(*) FILTER (WHERE tipo = 'receita' AND status = 'pendente' AND data_vencimento < v_hoje),
      'a_receber_30_valor', coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND status = 'pendente' AND data_vencimento BETWEEN v_hoje AND v_hoje + 30), 0),
      'a_receber_30_qtd', count(*) FILTER (WHERE tipo = 'receita' AND status = 'pendente' AND data_vencimento BETWEEN v_hoje AND v_hoje + 30),
      'tem_lancamentos', count(*) > 0,
      'serie', (
        SELECT jsonb_agg(jsonb_build_object(
                 'mes', m.mes,
                 'receitas', coalesce((SELECT sum(b.valor) FROM base b WHERE b.tipo = 'receita' AND b.status = 'pago'
                                        AND b.data_pagamento BETWEEN m.mes AND (m.mes + interval '1 month - 1 day')::date), 0),
                 'despesas', coalesce((SELECT sum(b.valor) FROM base b WHERE b.tipo = 'despesa' AND b.status = 'pago'
                                        AND b.data_pagamento BETWEEN m.mes AND (m.mes + interval '1 month - 1 day')::date), 0))
               ORDER BY m.mes)
          FROM (SELECT (v_inicio - make_interval(months => g))::date AS mes FROM generate_series(0, 5) g) m
      ),
      'despesas_por_categoria', coalesce((
        SELECT jsonb_agg(jsonb_build_object('categoria', c.nome, 'cor', c.cor, 'icone', c.icone, 'valor', t.total) ORDER BY t.total DESC)
          FROM (SELECT b.id_categoria, sum(b.valor) AS total FROM base b
                 WHERE b.tipo = 'despesa' AND b.natureza_financeira = 'operacional' AND b.status = 'pago' AND b.data_pagamento BETWEEN v_inicio AND v_fim
                 GROUP BY b.id_categoria) t
          JOIN public.categorias_financeiras c ON c.id = t.id_categoria), '[]'::jsonb)
    )
    FROM base
  );
END;
$function$;
