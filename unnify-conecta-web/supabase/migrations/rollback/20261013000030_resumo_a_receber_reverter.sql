-- REVERSÃO da migration 20261013000030 (restaura resumo_financeiro anterior).

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
