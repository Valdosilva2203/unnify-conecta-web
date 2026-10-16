-- Reverte a 20261016000055_recorrencias_folha.sql. Os ajustes já gerados PERMANECEM nas folhas (viram ajustes comuns, com o mesmo valor);
-- some só a configuração da recorrência, suas exceções e o histórico. Restaura gerar_folha (038), remover_ajuste_folha e historico_funcionario (054).
CREATE OR REPLACE FUNCTION public.gerar_folha(p_id_empresa uuid, p_competencia date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_comp date := date_trunc('month', p_competencia)::date;
  v_qtd integer := 0;
  r record;
BEGIN
  IF NOT public.pode_gerenciar_folha(p_id_empresa) THEN RAISE EXCEPTION 'Sem permissão para gerenciar a folha desta empresa.' USING ERRCODE = '42501'; END IF;
  IF v_comp IS NULL OR v_comp > (date_trunc('month', public.hoje_brasil()) + interval '1 month')::date OR v_comp < DATE '2000-01-01' THEN
    RAISE EXCEPTION 'Competência inválida (até o mês seguinte ao atual).' USING ERRCODE = 'check_violation';
  END IF;
  FOR r IN SELECT id FROM public.funcionarios WHERE id_empresa = p_id_empresa LOOP
    IF public.gerar_folha_funcionario(r.id, v_comp) IS NOT NULL THEN v_qtd := v_qtd + 1; END IF;
  END LOOP;
  RETURN v_qtd;
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

DROP FUNCTION IF EXISTS public.salvar_recorrencia_folha(uuid, uuid, text, text, text, numeric, numeric, date, date, text, text), public.suspender_recorrencia_folha(uuid, date, date, text),
  public.reativar_recorrencia_folha(uuid, text), public.encerrar_recorrencia_folha(uuid, date, text), public.nao_aplicar_recorrencia_folha(uuid, date, text),
  public.sincronizar_recorrencias_funcionario(uuid, date), public.sincronizar_recorrencias_folha(uuid),
  public.registrar_historico_recorrencia(public.recorrencias_folha, text, text, jsonb), public.recorrencia_gerenciavel(uuid), public.exigir_motivo_recorrencia(text),
  public.recorrencia_vale_na_competencia(public.recorrencias_folha, date), public.folha_aberta_para_recorrencia(public.folhas_competencia);
DROP INDEX IF EXISTS public.ajustes_folha_um_por_recorrencia;
ALTER TABLE public.ajustes_folha DROP COLUMN IF EXISTS id_recorrencia, DROP COLUMN IF EXISTS versao_recorrencia;
DROP TABLE IF EXISTS public.historico_recorrencias_folha, public.excecoes_recorrencia_folha, public.recorrencias_folha;
