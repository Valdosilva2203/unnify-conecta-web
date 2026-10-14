-- Parcelamentos — edição dos dados cadastrais de um contrato: nome, credor/fornecedor, categoria, descrição e conta sugerida.
-- Valores, quantidade, vencimentos, juros e tipo NÃO mudam (definem as parcelas e a classificação financeira).
-- Mudanças refletem nas parcelas PENDENTES (descrição, credor, categoria); parcelas pagas/canceladas ficam como registradas.
-- Escrita só por esta função (SECURITY DEFINER) com pode_gerenciar_financeiro; histórico registra o antes/depois.
-- Reversão: rollback/20261013000036_editar_contrato_parcelado_reverter.sql

ALTER TABLE public.historico_contratos DROP CONSTRAINT historico_contratos_acao;
ALTER TABLE public.historico_contratos ADD CONSTRAINT historico_contratos_acao
  CHECK (acao IN ('criado', 'editado', 'cancelado', 'excluido', 'anexo_adicionado', 'anexo_removido'));

CREATE OR REPLACE FUNCTION public.atualizar_contrato_parcelado(
  p_id uuid, p_nome text, p_contraparte text, p_id_categoria uuid, p_descricao text, p_id_conta_financeira uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_c public.contratos_parcelados;
  v_cat public.categorias_financeiras;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_contraparte text := nullif(btrim(coalesce(p_contraparte, '')), '');
  v_descricao text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_qtd integer;
BEGIN
  SELECT * INTO v_c FROM public.contratos_parcelados WHERE id = p_id AND excluido_em IS NULL FOR UPDATE;
  IF v_c.id IS NULL OR NOT public.pode_gerenciar_financeiro(v_c.id_empresa) THEN
    RAISE EXCEPTION 'Contrato não encontrado.' USING ERRCODE = '42501';
  END IF;
  IF v_c.cancelado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Contratos cancelados não podem ser editados.' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_nome) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Informe o nome do contrato (2 a 120 caracteres).' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(coalesce(v_contraparte, '')) > 120 OR char_length(coalesce(v_descricao, '')) > 1000 THEN
    RAISE EXCEPTION 'Credor ou descrição muito longos.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_cat FROM public.categorias_financeiras WHERE id = p_id_categoria;
  IF v_cat.id IS NULL OR v_cat.id_empresa <> v_c.id_empresa OR v_cat.tipo <> 'despesa' OR (NOT v_cat.ativa AND v_cat.id <> v_c.id_categoria) THEN
    RAISE EXCEPTION 'Escolha uma categoria de despesa ativa desta empresa.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_id_conta_financeira IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.contas_financeiras WHERE id = p_id_conta_financeira AND id_empresa = v_c.id_empresa AND arquivada_em IS NULL) THEN
    RAISE EXCEPTION 'Escolha uma conta ativa desta empresa.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.contratos_parcelados
     SET nome = v_nome, contraparte = v_contraparte, id_categoria = p_id_categoria, descricao = v_descricao,
         id_conta_financeira = p_id_conta_financeira, atualizado_em = now()
   WHERE id = p_id;

  -- Parcelas pendentes acompanham o contrato (mesmo padrão de descrição usado na criação)
  PERFORM set_config('unnify.operacao_contrato', 'sim', true);
  UPDATE public.lancamentos_financeiros l
     SET descricao = CASE WHEN l.numero_parcela = 0 THEN left(v_nome, 180) || ' — entrada'
                          ELSE left(v_nome, 170) || ' — parcela ' || l.numero_parcela || '/' ||
                               (SELECT count(*) FROM public.lancamentos_financeiros x WHERE x.id_contrato = p_id AND x.numero_parcela > 0 AND x.excluido_em IS NULL) END,
         contraparte = v_contraparte, id_categoria = p_id_categoria, atualizado_por = auth.uid()
   WHERE l.id_contrato = p_id AND l.status = 'pendente' AND l.excluido_em IS NULL;
  GET DIAGNOSTICS v_qtd = ROW_COUNT;
  PERFORM set_config('unnify.operacao_contrato', '', true);

  INSERT INTO public.historico_contratos (id_empresa, id_contrato, acao, dados, id_usuario)
  VALUES (v_c.id_empresa, p_id, 'editado', jsonb_build_object(
    'antes', jsonb_build_object('nome', v_c.nome, 'contraparte', v_c.contraparte, 'id_categoria', v_c.id_categoria, 'descricao', v_c.descricao, 'id_conta_financeira', v_c.id_conta_financeira),
    'depois', jsonb_build_object('nome', v_nome, 'contraparte', v_contraparte, 'id_categoria', p_id_categoria, 'descricao', v_descricao, 'id_conta_financeira', p_id_conta_financeira),
    'parcelas_pendentes_atualizadas', v_qtd), auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.atualizar_contrato_parcelado(uuid, text, text, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_contrato_parcelado(uuid, text, text, uuid, text, uuid) TO authenticated;
