-- Reverte a 060: encargos aprovados deixam de criar imposto. Os impostos já criados a partir da folha ficam (desligados da folha)
-- e continuam ligados às contas a pagar — remova-os em Impostos se quiser (a trava sai junto com esta reversão).
DROP TRIGGER IF EXISTS proteger_imposto_da_folha ON public.impostos;
DROP FUNCTION IF EXISTS public.proteger_imposto_da_folha();
CREATE OR REPLACE FUNCTION public.integrar_folha_financeiro(p_id_devolucao uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d public.devolucoes_folha;
  c public.competencias_folha;
  r record;
  v_folha public.folhas_competencia;
  t record;
  v_dif numeric;
  v_lanc uuid;
BEGIN
  SELECT * INTO d FROM public.devolucoes_folha WHERE id = p_id_devolucao;
  SELECT * INTO c FROM public.competencias_folha WHERE id = d.id_competencia;
  FOR r IN SELECT v.* FROM public.valores_folha v WHERE v.id_devolucao = d.id AND v.tipo = 'liquido' LOOP
    PERFORM public.gerar_folha_funcionario(r.id_funcionario, c.competencia);
    SELECT * INTO v_folha FROM public.folhas_competencia WHERE id_funcionario = r.id_funcionario AND competencia = c.competencia FOR UPDATE;
    IF v_folha.id IS NULL OR v_folha.cancelada_em IS NOT NULL THEN
      PERFORM public.registrar_evento_folha(c.id, r.id_funcionario, 'financeiro_divergencia', 'Salário não integrado: funcionário sem previsão ativa nesta competência.', NULL, NULL);
      CONTINUE;
    END IF;
    SELECT * INTO t FROM public.totais_folha(v_folha.id);
    v_dif := r.valor - t.total;
    IF r.valor < t.pago THEN
      PERFORM public.registrar_evento_folha(c.id, r.id_funcionario, 'financeiro_divergencia',
        'Salário não ajustado: o líquido aprovado é menor que o já pago no Financeiro.', NULL, jsonb_build_object('liquido', r.valor, 'pago', t.pago));
      CONTINUE;
    END IF;
    IF v_dif <> 0 THEN
      INSERT INTO public.ajustes_folha (id_empresa, id_folha, tipo, descricao, valor, criado_por, id_devolucao_folha)
      VALUES (c.id_empresa, v_folha.id, CASE WHEN v_dif > 0 THEN 'adicional' ELSE 'desconto' END, 'Ajuste conforme folha aprovada', abs(v_dif), auth.uid(), d.id);
      PERFORM public.recalcular_folha(v_folha.id);
    END IF;
  END LOOP;
  PERFORM set_config('unnify.operacao_folha', 'sim', true);
  FOR r IN SELECT v.* FROM public.valores_folha v WHERE v.id_devolucao = d.id AND v.tipo = 'encargo' ORDER BY v.vencimento, v.descricao LOOP
    INSERT INTO public.lancamentos_financeiros (id_empresa, tipo, descricao, valor, id_categoria, data_competencia, data_vencimento, status,
                                                contraparte, criado_por, atualizado_por, natureza_financeira, id_valor_folha)
    VALUES (c.id_empresa, 'despesa', left(r.descricao || ' — folha ' || to_char(c.competencia, 'MM/YYYY'), 200), r.valor, public.categoria_encargos_folha(c.id_empresa),
            c.competencia, r.vencimento, 'pendente', NULL, auth.uid(), auth.uid(), 'operacional', r.id)
    ON CONFLICT (id_valor_folha) WHERE id_valor_folha IS NOT NULL DO NOTHING;
  END LOOP;
  PERFORM set_config('unnify.operacao_folha', '', true);
END;
$$;


DROP FUNCTION IF EXISTS public.imposto_de_encargo_folha(uuid);
DROP FUNCTION IF EXISTS public.tipo_imposto_do_encargo(text);
DROP INDEX IF EXISTS public.impostos_um_por_encargo_folha;
ALTER TABLE public.impostos DROP COLUMN IF EXISTS id_valor_folha;
NOTIFY pgrst, 'reload schema';
