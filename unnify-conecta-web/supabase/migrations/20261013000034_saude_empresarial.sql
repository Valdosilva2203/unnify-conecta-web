-- E5 — Saúde Empresarial: indicadores, índice 0–100 (metodologia "saude-v1") e regras de recomendação.
-- Somente LEITURA. Nenhuma tabela nova. Uma função SECURITY DEFINER que confere pode_ver_financeiro ANTES de ler qualquer dado:
--   dono/sócio da empresa, ou contador com vínculo ATIVO e "Ver financeiro"/"Gerenciar financeiro" (revogou → bloqueia na hora).
--   Admin Master não tem acesso automático.
-- Fontes (classificação da E2 — natureza_financeira):
--   lancamentos_financeiros  → receitas/despesas operacionais PAGAS (data_pagamento), contas a pagar/receber, regularidade
--   movimentacoes_financeiras → fluxo de caixa realizado (fonte única do saldo; transferências internas ficam de fora)
--   saldo_conta_financeira   → saldo REGISTRADO no sistema (não é saldo bancário confirmado)
--   resumo_financeiro        → série mensal operacional (reaproveitada, não recalculada)
-- Metodologia documentada em lib/saude-empresarial.ts e CLAUDE.md (seção E5). Alterar regras/pesos = nova versão.
-- DEPENDE de 20261013000031 (classificação financeira). Ordem: 029 → 030 → 031 → 032 → 033 → 034.
-- Reversão: rollback/20261013000034_saude_empresarial_reverter.sql

DO $$
BEGIN
  IF to_regprocedure('public.validar_natureza_lancamento(text,text)') IS NULL
     OR position('receitas_operacionais' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.resumo_financeiro(uuid,date)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'E5: aplique antes a migration 20261013000031; nada foi alterado.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.saude_empresarial(p_id_empresa uuid, p_meses integer DEFAULT 6)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := public.hoje_brasil();
  v_ini date;
  v_ini_ant date;
  l record;
  v_saldo numeric;
  v_qtd_contas integer;
  v_obrig numeric;
  v_res numeric;
  v_res_ant numeric;
  v_var_rec numeric;
  v_var_desp numeric;
  v_var_res numeric;
  v_margem numeric;
  v_comprom numeric;
  v_cobertura numeric;
  v_regular numeric;
  v_inad numeric;
  v_pmr numeric;
  v_evolucao numeric;
  v_categorias jsonb;
  v_qtd_cats integer;
  v_pts numeric;
  v_motivo text;
  v_margem_aplicavel boolean;
  v_comp jsonb := '[]'::jsonb;
  v_soma_pesos integer := 0;
  v_soma_pontos numeric := 0;
  v_indice integer;
  v_insuf jsonb := '[]'::jsonb;
  v_rec jsonb := '[]'::jsonb;
  v_fluxo jsonb;
  v_contas jsonb;
BEGIN
  IF NOT public.pode_ver_financeiro(p_id_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para ver a saúde financeira desta empresa.' USING ERRCODE = '42501';
  END IF;
  IF p_meses IS NULL OR p_meses NOT IN (1, 3, 6, 12) THEN
    RAISE EXCEPTION 'Período inválido.' USING ERRCODE = 'check_violation';
  END IF;

  -- Período analisado: últimos N meses até hoje (janela móvel). Período anterior: mesma duração, imediatamente antes.
  v_ini := ((v_hoje - make_interval(months => p_meses))::date + 1);
  v_ini_ant := (v_ini - make_interval(months => p_meses))::date;

  SELECT
    coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND natureza_financeira = 'operacional' AND status = 'pago' AND data_pagamento BETWEEN v_ini AND v_hoje), 0) AS rec_op,
    coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND natureza_financeira = 'operacional' AND status = 'pago' AND data_pagamento BETWEEN v_ini_ant AND v_ini - 1), 0) AS rec_op_ant,
    coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND natureza_financeira = 'operacional' AND status = 'pago' AND data_pagamento BETWEEN v_ini AND v_hoje), 0) AS desp_op,
    coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND natureza_financeira = 'operacional' AND status = 'pago' AND data_pagamento BETWEEN v_ini_ant AND v_ini - 1), 0) AS desp_op_ant,
    count(*) FILTER (WHERE natureza_financeira = 'operacional' AND status = 'pago' AND data_pagamento BETWEEN v_ini AND v_hoje) AS qtd_op,
    -- Contas a pagar (todas as classificações: pró-labore e parcelas de empréstimo também são obrigações)
    coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND status = 'pendente' AND data_vencimento < v_hoje), 0) AS venc_valor,
    count(*) FILTER (WHERE tipo = 'despesa' AND status = 'pendente' AND data_vencimento < v_hoje) AS venc_qtd,
    coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND status = 'pendente' AND data_vencimento BETWEEN v_hoje AND v_hoje + 30), 0) AS avencer_valor,
    count(*) FILTER (WHERE tipo = 'despesa' AND status = 'pendente' AND data_vencimento BETWEEN v_hoje AND v_hoje + 30) AS avencer_qtd,
    -- Contas que estavam vencidas há 30 dias (vencimento anterior e ainda não pagas naquela data)
    count(*) FILTER (WHERE tipo = 'despesa' AND status <> 'cancelado' AND data_vencimento < v_hoje - 30
                       AND (status = 'pendente' OR data_pagamento > v_hoje - 30)) AS venc_qtd_30,
    -- Regularidade: despesas com vencimento no período (já vencidas) pagas até o vencimento
    count(*) FILTER (WHERE tipo = 'despesa' AND status <> 'cancelado' AND data_vencimento BETWEEN v_ini AND v_hoje - 1) AS reg_total,
    count(*) FILTER (WHERE tipo = 'despesa' AND status = 'pago' AND data_vencimento BETWEEN v_ini AND v_hoje - 1 AND data_pagamento <= data_vencimento) AS reg_em_dia,
    -- Inadimplência: receitas operacionais com vencimento no período (já vencidas) que seguem em aberto, em valor
    coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND natureza_financeira = 'operacional' AND status <> 'cancelado' AND data_vencimento BETWEEN v_ini AND v_hoje - 1), 0) AS inad_base,
    coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND natureza_financeira = 'operacional' AND status = 'pendente' AND data_vencimento BETWEEN v_ini AND v_hoje - 1), 0) AS inad_aberto,
    count(*) FILTER (WHERE tipo = 'receita' AND natureza_financeira = 'operacional' AND status = 'pendente' AND data_vencimento BETWEEN v_ini AND v_hoje - 1) AS inad_qtd,
    -- Prazo médio de recebimento: dias entre competência e recebimento, ponderado pelo valor
    count(*) FILTER (WHERE tipo = 'receita' AND natureza_financeira = 'operacional' AND status = 'pago' AND data_pagamento BETWEEN v_ini AND v_hoje) AS pmr_qtd,
    coalesce(sum(valor * greatest(data_pagamento - data_competencia, 0)) FILTER (WHERE tipo = 'receita' AND natureza_financeira = 'operacional' AND status = 'pago' AND data_pagamento BETWEEN v_ini AND v_hoje), 0) AS pmr_pond,
    count(*) AS total
  INTO l
  FROM public.lancamentos_financeiros
  WHERE id_empresa = p_id_empresa AND excluido_em IS NULL;

  -- Saldo registrado: soma das contas existentes até hoje (NULL = nenhuma conta cadastrada, não "zero")
  SELECT sum(public.saldo_conta_financeira(c.id, v_hoje)), count(*) INTO v_saldo, v_qtd_contas
    FROM public.contas_financeiras c
   WHERE c.id_empresa = p_id_empresa AND c.data_saldo_inicial <= v_hoje;

  v_res := l.rec_op - l.desp_op;
  v_res_ant := l.rec_op_ant - l.desp_op_ant;
  v_obrig := l.venc_valor + l.avencer_valor;
  v_var_rec := CASE WHEN l.rec_op_ant > 0 THEN round((l.rec_op - l.rec_op_ant) / l.rec_op_ant * 100, 1) END;
  v_var_desp := CASE WHEN l.desp_op_ant > 0 THEN round((l.desp_op - l.desp_op_ant) / l.desp_op_ant * 100, 1) END;
  v_var_res := CASE WHEN v_res_ant <> 0 AND (l.rec_op_ant > 0 OR l.desp_op_ant > 0) THEN round((v_res - v_res_ant) / abs(v_res_ant) * 100, 1) END;
  v_margem := CASE WHEN l.rec_op > 0 THEN round(v_res / l.rec_op * 100, 1) END;
  v_comprom := CASE WHEN l.rec_op > 0 THEN round(l.desp_op / l.rec_op * 100, 1) END;
  v_cobertura := CASE WHEN v_saldo IS NOT NULL AND v_obrig > 0 THEN round(v_saldo / v_obrig, 2) END;
  v_regular := CASE WHEN l.reg_total >= 3 THEN round(l.reg_em_dia::numeric / l.reg_total * 100, 1) END;
  v_inad := CASE WHEN l.inad_base > 0 THEN round(l.inad_aberto / l.inad_base * 100, 1) END;
  v_pmr := CASE WHEN l.pmr_qtd >= 5 AND l.rec_op > 0 THEN round(l.pmr_pond / l.rec_op, 0) END;
  v_evolucao := CASE WHEN v_var_rec IS NOT NULL AND v_var_desp IS NOT NULL THEN v_var_rec - v_var_desp END;

  -- ===== Índice (saude-v1): 5 componentes, cada um 0–100 pontos, média ponderada SÓ dos aplicáveis =====
  -- A. Margem operacional de caixa (peso 30): −10% → 0 … 20% → 100 (linear). Despesa sem receita = 0.
  v_margem_aplicavel := true;
  IF l.rec_op > 0 THEN
    v_pts := round(greatest(0, least(100, (v_margem + 10) / 30 * 100)), 1); v_motivo := NULL;
  ELSIF l.desp_op > 0 THEN
    v_pts := 0; v_motivo := NULL;
  ELSE
    v_pts := NULL; v_motivo := 'sem_movimento_operacional'; v_margem_aplicavel := false;
  END IF;
  v_comp := v_comp || jsonb_build_object('codigo', 'margem', 'peso', 30, 'valor', v_margem, 'pontos', v_pts, 'aplicavel', v_pts IS NOT NULL, 'motivo', v_motivo);
  IF v_pts IS NOT NULL THEN v_soma_pesos := v_soma_pesos + 30; v_soma_pontos := v_soma_pontos + v_pts * 30; END IF;

  -- B. Cobertura de obrigações de curto prazo (peso 25): saldo ÷ (vencidas + a vencer em 30 dias). 0,5 → 0 … 1,5 → 100.
  IF v_cobertura IS NOT NULL THEN
    v_pts := round(greatest(0, least(100, (v_cobertura - 0.5) * 100)), 1); v_motivo := NULL;
  ELSE
    v_pts := NULL; v_motivo := CASE WHEN v_saldo IS NULL THEN 'sem_contas' ELSE 'sem_obrigacoes' END;
  END IF;
  v_comp := v_comp || jsonb_build_object('codigo', 'cobertura', 'peso', 25, 'valor', v_cobertura, 'pontos', v_pts, 'aplicavel', v_pts IS NOT NULL, 'motivo', v_motivo);
  IF v_pts IS NOT NULL THEN v_soma_pesos := v_soma_pesos + 25; v_soma_pontos := v_soma_pontos + v_pts * 25; END IF;

  -- C. Regularidade de pagamentos (peso 20): % das despesas vencidas no período pagas até o vencimento (mín. 3 contas).
  v_pts := v_regular; v_motivo := CASE WHEN v_regular IS NULL THEN 'poucas_contas_vencidas' END;
  v_comp := v_comp || jsonb_build_object('codigo', 'regularidade', 'peso', 20, 'valor', v_regular, 'pontos', v_pts, 'aplicavel', v_pts IS NOT NULL, 'motivo', v_motivo,
                                         'base', l.reg_total, 'em_dia', l.reg_em_dia);
  IF v_pts IS NOT NULL THEN v_soma_pesos := v_soma_pesos + 20; v_soma_pontos := v_soma_pontos + v_pts * 20; END IF;

  -- D. Evolução receitas × despesas (peso 15): variação da receita − variação da despesa (p.p.). −20 → 0 … 0 → 50 … +20 → 100.
  IF v_evolucao IS NOT NULL THEN
    v_pts := round(greatest(0, least(100, 50 + v_evolucao * 2.5)), 1); v_motivo := NULL;
  ELSE
    v_pts := NULL; v_motivo := 'sem_periodo_anterior';
  END IF;
  v_comp := v_comp || jsonb_build_object('codigo', 'evolucao', 'peso', 15, 'valor', v_evolucao, 'pontos', v_pts, 'aplicavel', v_pts IS NOT NULL, 'motivo', v_motivo);
  IF v_pts IS NOT NULL THEN v_soma_pesos := v_soma_pesos + 15; v_soma_pontos := v_soma_pontos + v_pts * 15; END IF;

  -- E. Inadimplência de recebíveis (peso 10): 2% → 100 … 20% → 0 (linear).
  IF v_inad IS NOT NULL THEN
    v_pts := round(greatest(0, least(100, (20 - v_inad) / 18 * 100)), 1); v_motivo := NULL;
  ELSE
    v_pts := NULL; v_motivo := 'sem_recebiveis_vencidos';
  END IF;
  v_comp := v_comp || jsonb_build_object('codigo', 'inadimplencia', 'peso', 10, 'valor', v_inad, 'pontos', v_pts, 'aplicavel', v_pts IS NOT NULL, 'motivo', v_motivo);
  IF v_pts IS NOT NULL THEN v_soma_pesos := v_soma_pesos + 10; v_soma_pontos := v_soma_pontos + v_pts * 10; END IF;

  -- Confiabilidade mínima: margem aplicável, ≥ 5 lançamentos operacionais liquidados e ≥ 50% dos pesos aplicáveis.
  IF NOT v_margem_aplicavel THEN v_insuf := v_insuf || '"sem_movimento_operacional"'::jsonb; END IF;
  IF l.qtd_op < 5 THEN v_insuf := v_insuf || '"poucos_lancamentos"'::jsonb; END IF;
  IF v_soma_pesos < 50 THEN v_insuf := v_insuf || '"cobertura_baixa"'::jsonb; END IF;
  v_indice := CASE WHEN jsonb_array_length(v_insuf) = 0 THEN round(v_soma_pontos / v_soma_pesos)::integer END;

  -- Despesas operacionais pagas no período por categoria
  SELECT coalesce(jsonb_agg(jsonb_build_object('id_categoria', t.id_categoria, 'categoria', coalesce(cat.nome, 'Sem categoria'),
                                               'cor', coalesce(cat.cor, '#9ca3af'), 'icone', coalesce(cat.icone, 'tag'),
                                               'valor', t.total, 'qtd', t.qtd, 'percentual', round(t.total / l.desp_op * 100, 1))
                            ORDER BY t.total DESC, cat.nome), '[]'::jsonb), count(*)
    INTO v_categorias, v_qtd_cats
    FROM (SELECT id_categoria, sum(valor) AS total, count(*) AS qtd
            FROM public.lancamentos_financeiros
           WHERE id_empresa = p_id_empresa AND excluido_em IS NULL AND tipo = 'despesa' AND natureza_financeira = 'operacional'
             AND status = 'pago' AND data_pagamento BETWEEN v_ini AND v_hoje
           GROUP BY id_categoria) t
    LEFT JOIN public.categorias_financeiras cat ON cat.id = t.id_categoria;

  -- Fluxo de caixa realizado (6 meses-calendário): movimentações efetivas + saldo registrado ao fim de cada mês.
  -- Transferências entre contas da empresa não entram (não mudam o total). Saldo NULL = ainda não havia conta cadastrada.
  SELECT jsonb_agg(jsonb_build_object(
           'mes', m.mes, 'parcial', m.fim > v_hoje,
           'saldo_final', (SELECT sum(public.saldo_conta_financeira(c.id, m.ate)) FROM public.contas_financeiras c
                            WHERE c.id_empresa = p_id_empresa AND c.data_saldo_inicial <= m.ate),
           'entradas', coalesce(mv.entradas, 0), 'saidas', coalesce(mv.saidas, 0),
           'entradas_nao_operacionais', coalesce(mv.entradas_nop, 0), 'saidas_nao_operacionais', coalesce(mv.saidas_nop, 0))
         ORDER BY m.mes)
    INTO v_fluxo
    FROM (SELECT g.mes, (g.mes + interval '1 month - 1 day')::date AS fim, least((g.mes + interval '1 month - 1 day')::date, v_hoje) AS ate
            FROM (SELECT (date_trunc('month', v_hoje) - make_interval(months => s))::date AS mes FROM generate_series(0, 5) s) g) m
    LEFT JOIN LATERAL (
      SELECT sum(mf.valor) FILTER (WHERE mf.natureza = 'entrada') AS entradas,
             sum(mf.valor) FILTER (WHERE mf.natureza = 'saida') AS saidas,
             sum(mf.valor) FILTER (WHERE mf.natureza = 'entrada' AND lf.natureza_financeira <> 'operacional') AS entradas_nop,
             sum(mf.valor) FILTER (WHERE mf.natureza = 'saida' AND lf.natureza_financeira <> 'operacional') AS saidas_nop
        FROM public.movimentacoes_financeiras mf
        JOIN public.lancamentos_financeiros lf ON lf.id = mf.id_lancamento
       WHERE mf.id_empresa = p_id_empresa AND mf.origem = 'lancamento' AND mf.estornada_em IS NULL AND mf.data BETWEEN m.mes AND m.ate
    ) mv ON true;

  -- Contas a pagar vencidas e a vencer em 30 dias (o mesmo cadastro do Financeiro)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'descricao', x.descricao, 'valor', x.valor, 'data_vencimento', x.data_vencimento,
                                               'dias', x.data_vencimento - v_hoje, 'natureza', x.natureza_financeira, 'categoria', x.categoria)
                            ORDER BY x.data_vencimento, x.descricao), '[]'::jsonb)
    INTO v_contas
    FROM (SELECT lf.id, lf.descricao, lf.valor, lf.data_vencimento, lf.natureza_financeira, cat.nome AS categoria
            FROM public.lancamentos_financeiros lf
            LEFT JOIN public.categorias_financeiras cat ON cat.id = lf.id_categoria
           WHERE lf.id_empresa = p_id_empresa AND lf.excluido_em IS NULL AND lf.tipo = 'despesa' AND lf.status = 'pendente'
             AND lf.data_vencimento <= v_hoje + 30
           ORDER BY lf.data_vencimento, lf.descricao
           LIMIT 50) x;

  -- ===== Recomendações (regras determinísticas; o texto é montado na interface a partir de "dados") =====
  IF v_saldo IS NOT NULL AND v_obrig > 0 AND v_saldo < v_obrig THEN
    v_rec := v_rec || jsonb_build_object('codigo', 'saldo_insuficiente', 'severidade', 'alta',
                        'dados', jsonb_build_object('saldo', v_saldo, 'obrigacoes', v_obrig, 'falta', v_obrig - v_saldo, 'cobertura', v_cobertura));
  END IF;
  IF l.venc_qtd > 0 THEN
    v_rec := v_rec || jsonb_build_object('codigo', 'contas_vencidas', 'severidade', 'alta',
                        'dados', jsonb_build_object('qtd', l.venc_qtd, 'valor', l.venc_valor, 'qtd_30_dias_atras', l.venc_qtd_30, 'aumentou', l.venc_qtd > l.venc_qtd_30));
  END IF;
  IF (l.rec_op > 0 OR l.desp_op > 0) AND v_res < 0 THEN
    v_rec := v_rec || jsonb_build_object('codigo', 'resultado_negativo', 'severidade', 'alta',
                        'dados', jsonb_build_object('resultado', v_res, 'receitas', l.rec_op, 'despesas', l.desp_op));
  END IF;
  IF v_var_desp IS NOT NULL AND v_var_desp > 0 AND v_var_desp - coalesce(v_var_rec, 0) >= 5 THEN
    v_rec := v_rec || jsonb_build_object('codigo', 'despesas_acima_receitas', 'severidade', 'media',
                        'dados', jsonb_build_object('variacao_despesas', v_var_desp, 'variacao_receitas', v_var_rec));
  END IF;
  IF v_inad IS NOT NULL AND v_inad >= 10 THEN
    v_rec := v_rec || jsonb_build_object('codigo', 'inadimplencia_alta', 'severidade', 'media',
                        'dados', jsonb_build_object('percentual', v_inad, 'valor', l.inad_aberto, 'qtd', l.inad_qtd));
  END IF;
  IF v_qtd_cats >= 2 AND (v_categorias -> 0 ->> 'percentual')::numeric >= 50 THEN
    v_rec := v_rec || jsonb_build_object('codigo', 'concentracao_despesas', 'severidade', 'media',
                        'dados', jsonb_build_object('categoria', v_categorias -> 0 ->> 'categoria', 'percentual', (v_categorias -> 0 ->> 'percentual')::numeric,
                                                    'valor', (v_categorias -> 0 ->> 'valor')::numeric));
  END IF;
  IF v_saldo IS NULL THEN
    v_rec := v_rec || jsonb_build_object('codigo', 'sem_contas', 'severidade', 'info', 'dados', '{}'::jsonb);
  END IF;
  IF v_indice IS NULL THEN
    v_rec := v_rec || jsonb_build_object('codigo', 'dados_insuficientes', 'severidade', 'info', 'dados', jsonb_build_object('motivos', v_insuf, 'lancamentos', l.qtd_op));
  END IF;
  IF v_cobertura IS NOT NULL AND v_cobertura >= 1.5 AND v_res > 0 AND l.venc_qtd = 0 THEN
    v_rec := v_rec || jsonb_build_object('codigo', 'caixa_saudavel', 'severidade', 'positiva', 'dados', jsonb_build_object('cobertura', v_cobertura, 'resultado', v_res));
  END IF;

  RETURN jsonb_build_object(
    'metodologia', 'saude-v1',
    'hoje', v_hoje, 'meses', p_meses,
    'periodo_inicio', v_ini, 'periodo_fim', v_hoje,
    'periodo_anterior_inicio', v_ini_ant, 'periodo_anterior_fim', v_ini - 1,
    'tem_lancamentos', l.total > 0,
    'receita_operacional', l.rec_op, 'receita_operacional_anterior', l.rec_op_ant, 'variacao_receita', v_var_rec,
    'despesa_operacional', l.desp_op, 'despesa_operacional_anterior', l.desp_op_ant, 'variacao_despesa', v_var_desp,
    'resultado_operacional', v_res, 'resultado_operacional_anterior', v_res_ant, 'variacao_resultado', v_var_res,
    'lancamentos_operacionais', l.qtd_op,
    'saldo_registrado', v_saldo, 'qtd_contas', v_qtd_contas,
    'obrigacoes', jsonb_build_object('vencidas_valor', l.venc_valor, 'vencidas_qtd', l.venc_qtd,
                                     'a_vencer_valor', l.avencer_valor, 'a_vencer_qtd', l.avencer_qtd, 'total', v_obrig),
    'indicadores', jsonb_build_object(
      'margem', v_margem,
      'cobertura', v_cobertura,
      'comprometimento', v_comprom,
      'inadimplencia', v_inad, 'inadimplencia_base', l.inad_base, 'inadimplencia_aberto', l.inad_aberto,
      'prazo_medio_recebimento', v_pmr, 'prazo_medio_base', l.pmr_qtd,
      'regularidade', v_regular, 'regularidade_base', l.reg_total),
    'indice', jsonb_build_object(
      'valor', v_indice,
      'faixa', CASE WHEN v_indice IS NULL THEN NULL WHEN v_indice >= 80 THEN 'boa' WHEN v_indice >= 60 THEN 'estavel' WHEN v_indice >= 40 THEN 'atencao' ELSE 'critica' END,
      'cobertura_pesos', v_soma_pesos,
      'componentes', v_comp,
      'insuficiencias', v_insuf),
    'recomendacoes', v_rec,
    'despesas_por_categoria', v_categorias,
    'serie_operacional', (public.resumo_financeiro(p_id_empresa, v_hoje)) -> 'serie',
    'fluxo_caixa', v_fluxo,
    'contas_a_vencer', v_contas
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.saude_empresarial(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.saude_empresarial(uuid, integer) TO authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.saude_empresarial(uuid,integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.saude_empresarial(uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'E5: permissões de saude_empresarial inesperadas.';
  END IF;
END;
$$;
