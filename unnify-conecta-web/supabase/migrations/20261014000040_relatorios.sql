-- Relatórios (Etapa 1): agregação financeira do período em uma única função de LEITURA (sem tabela nova).
-- Critérios (os mesmos do Financeiro/E2):
--   Realizado = lançamento PAGO, pela data de pagamento. Receitas/despesas do relatório = natureza "operacional".
--   Resultado gerencial = receitas realizadas − despesas realizadas (caixa, operacional). NÃO é lucro contábil/DRE.
--   Contas a receber/pagar = lançamentos PENDENTES na data de hoje: vencido (< hoje), vencendo (hoje até +7 dias), em dia (> +7 dias).
--   Fluxo de caixa = movimentações efetivas nas contas (transferências internas fora). Previsto nunca entra como realizado.
--   Comparação: período anterior de MESMA duração, imediatamente antes. Pagamento parcial = lançamentos próprios (sem duplicar).
-- Acesso: pode_ver_financeiro (dono/sócio; contador com vínculo ATIVO e "Ver/Gerenciar financeiro"). Admin Master sem acesso.
-- Reversão: rollback/20261014000040_relatorios_reverter.sql

CREATE OR REPLACE FUNCTION public.relatorio_financeiro(p_id_empresa uuid, p_inicio date, p_fim date, p_id_categoria uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := public.hoje_brasil();
  v_dias integer;
  v_ant_ini date;
  v_ant_fim date;
  v_serie_ini date;
  a record;
BEGIN
  IF NOT public.pode_ver_financeiro(p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para ver os relatórios financeiros desta empresa.' USING ERRCODE = '42501';
  END IF;
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio OR p_fim - p_inicio > 366 THEN
    RAISE EXCEPTION 'Período inválido (até 1 ano).' USING ERRCODE = 'check_violation';
  END IF;
  IF p_id_categoria IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categorias_financeiras WHERE id = p_id_categoria AND id_empresa = p_id_empresa) THEN
    RAISE EXCEPTION 'Categoria inválida para esta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  v_dias := p_fim - p_inicio + 1;
  v_ant_fim := p_inicio - 1;
  v_ant_ini := p_inicio - v_dias;
  v_serie_ini := (date_trunc('month', p_fim) - interval '11 months')::date;

  SELECT
    coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND natureza_financeira = 'operacional' AND status = 'pago' AND data_pagamento BETWEEN p_inicio AND p_fim), 0) rec,
    coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND natureza_financeira = 'operacional' AND status = 'pago' AND data_pagamento BETWEEN v_ant_ini AND v_ant_fim), 0) rec_ant,
    coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND natureza_financeira = 'operacional' AND status = 'pago' AND data_pagamento BETWEEN p_inicio AND p_fim), 0) desp,
    coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND natureza_financeira = 'operacional' AND status = 'pago' AND data_pagamento BETWEEN v_ant_ini AND v_ant_fim), 0) desp_ant,
    count(*) FILTER (WHERE tipo = 'receita' AND natureza_financeira = 'operacional' AND status = 'pago' AND data_pagamento BETWEEN p_inicio AND p_fim) rec_qtd,
    count(*) FILTER (WHERE tipo = 'despesa' AND natureza_financeira = 'operacional' AND status = 'pago' AND data_pagamento BETWEEN p_inicio AND p_fim) desp_qtd,
    coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND status = 'pendente' AND data_vencimento < v_hoje), 0) rv,
    coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND status = 'pendente' AND data_vencimento BETWEEN v_hoje AND v_hoje + 7), 0) r7,
    coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND status = 'pendente' AND data_vencimento > v_hoje + 7), 0) rd,
    count(*) FILTER (WHERE tipo = 'receita' AND status = 'pendente') r_qtd,
    coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND status = 'pendente' AND data_vencimento < v_hoje), 0) pv,
    coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND status = 'pendente' AND data_vencimento BETWEEN v_hoje AND v_hoje + 7), 0) p7,
    coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND status = 'pendente' AND data_vencimento > v_hoje + 7), 0) pd,
    count(*) FILTER (WHERE tipo = 'despesa' AND status = 'pendente') p_qtd,
    -- Movimentações não operacionais realizadas no período (aparecem à parte, sem distorcer receitas/despesas)
    coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND natureza_financeira <> 'operacional' AND status = 'pago' AND data_pagamento BETWEEN p_inicio AND p_fim), 0) nop_ent,
    coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND natureza_financeira <> 'operacional' AND status = 'pago' AND data_pagamento BETWEEN p_inicio AND p_fim), 0) nop_sai
  INTO a
  FROM public.lancamentos_financeiros
  WHERE id_empresa = p_id_empresa AND excluido_em IS NULL AND status <> 'cancelado'
    AND (p_id_categoria IS NULL OR id_categoria = p_id_categoria);

  RETURN jsonb_build_object(
    'periodo_inicio', p_inicio, 'periodo_fim', p_fim, 'anterior_inicio', v_ant_ini, 'anterior_fim', v_ant_fim, 'hoje', v_hoje,
    'receitas', a.rec, 'receitas_anterior', a.rec_ant, 'receitas_qtd', a.rec_qtd,
    'despesas', a.desp, 'despesas_anterior', a.desp_ant, 'despesas_qtd', a.desp_qtd,
    'resultado', a.rec - a.desp, 'resultado_anterior', a.rec_ant - a.desp_ant,
    'nao_operacionais_entradas', a.nop_ent, 'nao_operacionais_saidas', a.nop_sai,
    'a_receber', jsonb_build_object('total', a.rv + a.r7 + a.rd, 'vencido', a.rv, 'vencendo_7', a.r7, 'em_dia', a.rd, 'qtd', a.r_qtd),
    'a_pagar', jsonb_build_object('total', a.pv + a.p7 + a.pd, 'vencido', a.pv, 'vencendo_7', a.p7, 'em_dia', a.pd, 'qtd', a.p_qtd),
    'despesas_por_categoria', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id_categoria', t.id_categoria, 'categoria', coalesce(c.nome, 'Sem categoria'), 'cor', coalesce(c.cor, '#9ca3af'),
                                          'icone', coalesce(c.icone, 'tag'), 'valor', t.total) ORDER BY t.total DESC)
        FROM (SELECT l.id_categoria, sum(l.valor) total FROM public.lancamentos_financeiros l
               WHERE l.id_empresa = p_id_empresa AND l.excluido_em IS NULL AND l.tipo = 'despesa' AND l.natureza_financeira = 'operacional'
                 AND l.status = 'pago' AND l.data_pagamento BETWEEN p_inicio AND p_fim AND (p_id_categoria IS NULL OR l.id_categoria = p_id_categoria)
               GROUP BY l.id_categoria) t
        LEFT JOIN public.categorias_financeiras c ON c.id = t.id_categoria), '[]'::jsonb),
    -- Série de 12 meses até o fim do período: operacional realizado + fluxo de caixa efetivo (movimentações)
    'serie', (
      SELECT jsonb_agg(jsonb_build_object('mes', m.mes,
               'receitas', coalesce((SELECT sum(l.valor) FROM public.lancamentos_financeiros l WHERE l.id_empresa = p_id_empresa AND l.excluido_em IS NULL AND l.tipo = 'receita'
                             AND l.natureza_financeira = 'operacional' AND l.status = 'pago' AND l.data_pagamento BETWEEN m.mes AND m.fim
                             AND (p_id_categoria IS NULL OR l.id_categoria = p_id_categoria)), 0),
               'despesas', coalesce((SELECT sum(l.valor) FROM public.lancamentos_financeiros l WHERE l.id_empresa = p_id_empresa AND l.excluido_em IS NULL AND l.tipo = 'despesa'
                             AND l.natureza_financeira = 'operacional' AND l.status = 'pago' AND l.data_pagamento BETWEEN m.mes AND m.fim
                             AND (p_id_categoria IS NULL OR l.id_categoria = p_id_categoria)), 0),
               'entradas', coalesce((SELECT sum(mv.valor) FROM public.movimentacoes_financeiras mv JOIN public.lancamentos_financeiros l ON l.id = mv.id_lancamento
                             WHERE mv.id_empresa = p_id_empresa AND mv.origem = 'lancamento' AND mv.estornada_em IS NULL AND mv.natureza = 'entrada'
                               AND mv.data BETWEEN m.mes AND m.fim AND (p_id_categoria IS NULL OR l.id_categoria = p_id_categoria)), 0),
               'saidas', coalesce((SELECT sum(mv.valor) FROM public.movimentacoes_financeiras mv JOIN public.lancamentos_financeiros l ON l.id = mv.id_lancamento
                             WHERE mv.id_empresa = p_id_empresa AND mv.origem = 'lancamento' AND mv.estornada_em IS NULL AND mv.natureza = 'saida'
                               AND mv.data BETWEEN m.mes AND m.fim AND (p_id_categoria IS NULL OR l.id_categoria = p_id_categoria)), 0)) ORDER BY m.mes)
        FROM (SELECT g::date mes, (g + interval '1 month - 1 day')::date fim FROM generate_series(v_serie_ini, date_trunc('month', p_fim), interval '1 month') g) m)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.relatorio_financeiro(uuid, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.relatorio_financeiro(uuid, date, date, uuid) TO authenticated;
