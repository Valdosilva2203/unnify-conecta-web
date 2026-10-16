-- Reverte a 20261016000054_ajuste_percentual.sql. Ajustes percentuais já lançados PERMANECEM como valor fixo (o valor em R$ não muda);
-- perdem só o detalhe do cálculo (percentual e base). Restaura as funções da 038.
DROP FUNCTION IF EXISTS public.adicionar_ajuste_percentual_folha(uuid, text, text, numeric);

CREATE OR REPLACE FUNCTION public.adicionar_ajuste_folha(p_id_folha uuid, p_tipo text, p_descricao text, p_valor numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.folhas_competencia; v_id uuid;
BEGIN
  SELECT * INTO f FROM public.folhas_competencia WHERE id = p_id_folha FOR UPDATE;
  IF f.id IS NULL OR NOT public.pode_gerenciar_folha(f.id_empresa) THEN RAISE EXCEPTION 'Competência não encontrada.' USING ERRCODE = '42501'; END IF;
  IF f.cancelada_em IS NOT NULL THEN RAISE EXCEPTION 'Competência cancelada (funcionário desligado).' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(p_tipo, '') NOT IN ('adicional', 'desconto') THEN RAISE EXCEPTION 'Tipo inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(btrim(coalesce(p_descricao, ''))) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Descreva o ajuste (2 a 120 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  IF p_valor IS NULL OR p_valor <= 0 OR p_valor <> round(p_valor, 2) OR p_valor > 9999999.99 THEN RAISE EXCEPTION 'Informe um valor válido.' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.ajustes_folha (id_empresa, id_folha, tipo, descricao, valor, criado_por)
  VALUES (f.id_empresa, f.id, p_tipo, btrim(p_descricao), p_valor, auth.uid()) RETURNING id INTO v_id;
  PERFORM public.recalcular_folha(f.id);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remover_ajuste_folha(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.ajustes_folha;
BEGIN
  SELECT * INTO a FROM public.ajustes_folha WHERE id = p_id AND excluido_em IS NULL FOR UPDATE;
  IF a.id IS NULL OR NOT public.pode_gerenciar_folha(a.id_empresa) THEN RAISE EXCEPTION 'Ajuste não encontrado.' USING ERRCODE = '42501'; END IF;
  UPDATE public.ajustes_folha SET excluido_em = now(), excluido_por = auth.uid() WHERE id = p_id;
  PERFORM public.recalcular_folha(a.id_folha);
END;
$$;

CREATE OR REPLACE FUNCTION public.historico_funcionario(p_id_funcionario uuid)
RETURNS TABLE (tipo text, data date, competencia date, descricao text, valor numeric, situacao text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.funcionarios;
BEGIN
  SELECT * INTO v FROM public.funcionarios WHERE id = p_id_funcionario;
  IF v.id IS NULL OR NOT public.pode_ver_folha(v.id_empresa) THEN RAISE EXCEPTION 'Funcionário não encontrado.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT 'pagamento'::text, l.data_pagamento, fo.competencia, l.descricao, l.valor, 'pago'::text
      FROM public.lancamentos_financeiros l JOIN public.folhas_competencia fo ON fo.id = l.id_folha
     WHERE fo.id_funcionario = v.id AND l.status = 'pago' AND l.excluido_em IS NULL
    UNION ALL
    SELECT a.tipo, a.criado_em::date, fo.competencia, a.descricao, a.valor, NULL::text
      FROM public.ajustes_folha a JOIN public.folhas_competencia fo ON fo.id = a.id_folha
     WHERE fo.id_funcionario = v.id AND a.excluido_em IS NULL
    UNION ALL
    SELECT 'salario'::text, h.criado_em::date, h.vigente_desde, 'Salário-base a partir desta competência', h.salario, NULL::text
      FROM public.historico_salarios h WHERE h.id_funcionario = v.id
    ORDER BY 2 DESC, 3 DESC;
END;
$$;

DROP FUNCTION IF EXISTS public.exigir_folha_nao_aprovada(public.folhas_competencia), public.texto_calculo_ajuste(numeric, numeric);
ALTER TABLE public.ajustes_folha DROP CONSTRAINT IF EXISTS ajustes_folha_modalidade,
  DROP COLUMN IF EXISTS modalidade, DROP COLUMN IF EXISTS percentual, DROP COLUMN IF EXISTS base_calculo, DROP COLUMN IF EXISTS valor_base;
