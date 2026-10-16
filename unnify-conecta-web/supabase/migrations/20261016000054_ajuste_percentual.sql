-- Adicional/desconto por PORCENTAGEM em Funcionários (ajustes_folha da 038). Lançamento manual: não calcula INSS/IRRF/FGTS/horas extras legais.
--   * Base única e confiável: o salário-base GRAVADO na folha da competência (folhas_competencia.salario_base), lido no servidor.
--     O navegador só envia o percentual; base e valor são calculados aqui: valor = round(base × percentual / 100, 2).
--   * O ajuste guarda modalidade, percentual, base usada e valor da base: mudança futura de salário não altera o que foi lançado.
--   * Ajustes fixos continuam iguais. Folha de Pagamento APROVADA (052) não aceita novos ajustes nem remoções (sem mudança silenciosa).
-- Reversão: rollback/20261016000054_ajuste_percentual_reverter.sql

ALTER TABLE public.ajustes_folha
  ADD COLUMN modalidade text NOT NULL DEFAULT 'fixo',
  ADD COLUMN percentual numeric(9, 4),
  ADD COLUMN base_calculo text,
  ADD COLUMN valor_base numeric(14, 2),
  ADD CONSTRAINT ajustes_folha_modalidade CHECK (
    (modalidade = 'fixo' AND percentual IS NULL AND base_calculo IS NULL AND valor_base IS NULL)
    OR (modalidade = 'percentual' AND percentual > 0 AND base_calculo = 'salario_base' AND valor_base > 0));

-- Competência da Folha de Pagamento aprovada: ajustes travados
CREATE OR REPLACE FUNCTION public.exigir_folha_nao_aprovada(f public.folhas_competencia)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.competencias_folha c WHERE c.id_empresa = f.id_empresa AND c.competencia = f.competencia AND c.status = 'aprovada') THEN
    RAISE EXCEPTION 'A Folha de Pagamento desta competência já foi aprovada: adicionais e descontos não podem mais ser alterados.' USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.adicionar_ajuste_folha(p_id_folha uuid, p_tipo text, p_descricao text, p_valor numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.folhas_competencia; v_id uuid;
BEGIN
  SELECT * INTO f FROM public.folhas_competencia WHERE id = p_id_folha FOR UPDATE;
  IF f.id IS NULL OR NOT public.pode_gerenciar_folha(f.id_empresa) THEN RAISE EXCEPTION 'Competência não encontrada.' USING ERRCODE = '42501'; END IF;
  IF f.cancelada_em IS NOT NULL THEN RAISE EXCEPTION 'Competência cancelada (funcionário desligado).' USING ERRCODE = 'check_violation'; END IF;
  PERFORM public.exigir_folha_nao_aprovada(f);
  IF coalesce(p_tipo, '') NOT IN ('adicional', 'desconto') THEN RAISE EXCEPTION 'Tipo inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(btrim(coalesce(p_descricao, ''))) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Descreva o ajuste (2 a 120 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  IF p_valor IS NULL OR p_valor <= 0 OR p_valor <> round(p_valor, 2) OR p_valor > 9999999.99 THEN RAISE EXCEPTION 'Informe um valor válido.' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.ajustes_folha (id_empresa, id_folha, tipo, descricao, valor, criado_por)
  VALUES (f.id_empresa, f.id, p_tipo, btrim(p_descricao), p_valor, auth.uid()) RETURNING id INTO v_id;
  PERFORM public.recalcular_folha(f.id); -- se o desconto passar do saldo, tudo é desfeito
  RETURN v_id;
END;
$$;

-- Percentual: adicional até 1000%, desconto até 100% (um desconto não passa do próprio salário-base); até 4 casas decimais
CREATE OR REPLACE FUNCTION public.adicionar_ajuste_percentual_folha(p_id_folha uuid, p_tipo text, p_descricao text, p_percentual numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.folhas_competencia; v_valor numeric; v_id uuid;
BEGIN
  SELECT * INTO f FROM public.folhas_competencia WHERE id = p_id_folha FOR UPDATE;
  IF f.id IS NULL OR NOT public.pode_gerenciar_folha(f.id_empresa) THEN RAISE EXCEPTION 'Competência não encontrada.' USING ERRCODE = '42501'; END IF;
  IF f.cancelada_em IS NOT NULL THEN RAISE EXCEPTION 'Competência cancelada (funcionário desligado).' USING ERRCODE = 'check_violation'; END IF;
  PERFORM public.exigir_folha_nao_aprovada(f);
  IF coalesce(p_tipo, '') NOT IN ('adicional', 'desconto') THEN RAISE EXCEPTION 'Tipo inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(btrim(coalesce(p_descricao, ''))) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Descreva o ajuste (2 a 120 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  IF p_percentual IS NULL OR p_percentual <= 0 OR p_percentual <> round(p_percentual, 4) THEN
    RAISE EXCEPTION 'Informe uma porcentagem maior que zero (até 4 casas decimais).' USING ERRCODE = 'check_violation';
  END IF;
  IF p_tipo = 'desconto' AND p_percentual > 100 THEN RAISE EXCEPTION 'Um desconto percentual não pode passar de 100%% do salário-base.' USING ERRCODE = 'check_violation'; END IF;
  IF p_tipo = 'adicional' AND p_percentual > 1000 THEN RAISE EXCEPTION 'Porcentagem acima do limite (1000%%).' USING ERRCODE = 'check_violation'; END IF;
  IF f.salario_base IS NULL OR f.salario_base <= 0 THEN RAISE EXCEPTION 'Salário-base inválido para o cálculo.' USING ERRCODE = 'check_violation'; END IF;
  v_valor := round(f.salario_base * p_percentual / 100, 2);
  IF v_valor <= 0 THEN RAISE EXCEPTION 'O valor calculado ficou em R$ 0,00: aumente a porcentagem.' USING ERRCODE = 'check_violation'; END IF;
  IF v_valor > 9999999.99 THEN RAISE EXCEPTION 'Valor calculado acima do limite.' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.ajustes_folha (id_empresa, id_folha, tipo, descricao, valor, criado_por, modalidade, percentual, base_calculo, valor_base)
  VALUES (f.id_empresa, f.id, p_tipo, btrim(p_descricao), v_valor, auth.uid(), 'percentual', p_percentual, 'salario_base', f.salario_base) RETURNING id INTO v_id;
  PERFORM public.recalcular_folha(f.id);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remover_ajuste_folha(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.ajustes_folha; f public.folhas_competencia;
BEGIN
  SELECT * INTO a FROM public.ajustes_folha WHERE id = p_id AND excluido_em IS NULL FOR UPDATE;
  IF a.id IS NULL OR NOT public.pode_gerenciar_folha(a.id_empresa) THEN RAISE EXCEPTION 'Ajuste não encontrado.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO f FROM public.folhas_competencia WHERE id = a.id_folha;
  PERFORM public.exigir_folha_nao_aprovada(f);
  UPDATE public.ajustes_folha SET excluido_em = now(), excluido_por = auth.uid() WHERE id = p_id;
  PERFORM public.recalcular_folha(a.id_folha);
END;
$$;

-- Texto do cálculo para o histórico: "10% sobre o salário-base de R$ 2.200,00"
CREATE OR REPLACE FUNCTION public.texto_calculo_ajuste(p_percentual numeric, p_base numeric)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT replace(rtrim(rtrim(to_char(p_percentual, 'FM999990.0000'), '0'), '.'), '.', ',') || '% sobre o salário-base de R$ '
         || translate(to_char(p_base, 'FM999,999,990.00'), ',.', '.,');
$$;

-- Histórico individual: mesmo formato; ajustes percentuais trazem o cálculo na descrição
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
    SELECT a.tipo, a.criado_em::date, fo.competencia,
           a.descricao || CASE WHEN a.modalidade = 'percentual' THEN ' — ' || public.texto_calculo_ajuste(a.percentual, a.valor_base) ELSE '' END, a.valor, NULL::text
      FROM public.ajustes_folha a JOIN public.folhas_competencia fo ON fo.id = a.id_folha
     WHERE fo.id_funcionario = v.id AND a.excluido_em IS NULL
    UNION ALL
    SELECT 'salario'::text, h.criado_em::date, h.vigente_desde, 'Salário-base a partir desta competência', h.salario, NULL::text
      FROM public.historico_salarios h WHERE h.id_funcionario = v.id
    ORDER BY 2 DESC, 3 DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.exigir_folha_nao_aprovada(public.folhas_competencia) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adicionar_ajuste_percentual_folha(uuid, text, text, numeric), public.texto_calculo_ajuste(numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adicionar_ajuste_percentual_folha(uuid, text, text, numeric), public.texto_calculo_ajuste(numeric, numeric) TO authenticated;
