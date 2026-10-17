-- Reverte a 058: painel e snapshot voltam à versão da 052 (sem adicionais/descontos) e sai a trava de ajustes após o envio.
-- Pacotes já enviados com "ajustes" no snapshot continuam como estão (são registros imutáveis).
DROP TRIGGER IF EXISTS controlar_ajuste_folha_enviada ON public.ajustes_folha;
DROP FUNCTION IF EXISTS public.controlar_ajuste_folha_enviada();
CREATE OR REPLACE FUNCTION public.painel_folha_pagamento(p_id_empresa uuid, p_competencia date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_comp date := date_trunc('month', p_competencia)::date;
  c public.competencias_folha;
  v_func jsonb; v_pend jsonb; v_dev jsonb; v_pac jsonb; v_pag jsonb;
  v_contador boolean := public.pode_processar_folha(p_id_empresa);
BEGIN
  IF v_comp IS NULL OR NOT public.pode_ver_folha(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso à folha desta empresa.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO c FROM public.competencias_folha WHERE id_empresa = p_id_empresa AND competencia = v_comp;

  -- Depois do envio, o contador vê a versão enviada; antes, a lista viva da competência
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'nome', f.nome, 'matricula', f.matricula, 'cargo', f.cargo, 'vinculo', f.vinculo, 'data_admissao', f.data_admissao,
      'status_funcionario', f.status, 'salario_base', public.salario_vigente(f.id, v_comp),
      'ocorrencias', CASE WHEN c.id IS NULL THEN 0 ELSE (SELECT count(*) FROM public.ocorrencias_folha o WHERE o.id_competencia = c.id AND o.id_funcionario = f.id AND o.excluido_em IS NULL) END,
      'pendencias', CASE WHEN c.id IS NULL THEN 0 ELSE (SELECT count(*) FROM public.pendencias_abertas_folha(c.id, f.id)) END,
      'situacao', CASE WHEN c.id IS NULL THEN 'a_conferir' ELSE public.situacao_funcionario_folha(c.id, f.id) END,
      'conferencia', (SELECT jsonb_build_object('sem_ocorrencias', k.sem_ocorrencias, 'confirmado_em', k.confirmado_em,
                        'confirmado_por', (SELECT p.nome_completo FROM public.perfis p WHERE p.id_usuario = k.confirmado_por))
                        FROM public.conferencias_folha k WHERE k.id_competencia = c.id AND k.id_funcionario = f.id AND k.invalidada_em IS NULL)
    ) ORDER BY f.nome, f.id), '[]'::jsonb)
    INTO v_func FROM public.funcionarios_da_competencia(p_id_empresa, v_comp) f;

  IF c.id IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id_funcionario', f.id, 'origem', p.origem, 'id', p.id, 'descricao', p.descricao)), '[]'::jsonb) INTO v_pend
      FROM public.funcionarios_da_competencia(p_id_empresa, v_comp) f CROSS JOIN LATERAL public.pendencias_abertas_folha(c.id, f.id) p;
    SELECT jsonb_build_object('id', p.id, 'versao', p.versao, 'responsavel', p.responsavel, 'enviado_em', p.enviado_em, 'observacoes', p.observacoes,
                              'enviado_por', (SELECT nome_completo FROM public.perfis WHERE id_usuario = p.enviado_por))
      INTO v_pac FROM public.pacotes_folha p WHERE p.id_competencia = c.id AND p.situacao = 'vigente';
    SELECT jsonb_build_object('id', d.id, 'numero', d.numero, 'situacao', d.situacao, 'enviada_em', d.enviada_em, 'observacoes', d.observacoes,
                              'motivo_revisao', d.motivo_revisao, 'aprovada_em', d.aprovada_em, 'faltas', public.faltas_devolucao_folha(d.id),
                              'aprovada_por', (SELECT nome_completo FROM public.perfis WHERE id_usuario = d.aprovada_por))
      INTO v_dev FROM public.devolucoes_folha d
     WHERE d.id_competencia = c.id AND (d.situacao <> 'rascunho' OR v_contador)
     ORDER BY (d.situacao IN ('rascunho', 'enviada', 'aprovada')) DESC, d.numero DESC LIMIT 1;
    IF c.status = 'aprovada' THEN
      SELECT jsonb_build_object(
        'salarios', coalesce((SELECT jsonb_agg(jsonb_build_object('id_funcionario', v.id_funcionario, 'liquido', v.valor, 'id_folha', fo.id,
                      'pago', t.pago, 'pendente', t.pendente, 'total', t.total) ORDER BY fu.nome)
                    FROM public.valores_folha v JOIN public.funcionarios fu ON fu.id = v.id_funcionario
                    LEFT JOIN public.folhas_competencia fo ON fo.id_funcionario = v.id_funcionario AND fo.competencia = c.competencia
                    LEFT JOIN LATERAL public.totais_folha(fo.id) t ON true
                   WHERE v.id_devolucao = (v_dev ->> 'id')::uuid AND v.tipo = 'liquido'), '[]'::jsonb),
        'encargos', coalesce((SELECT jsonb_agg(jsonb_build_object('id_valor', v.id, 'descricao', v.descricao, 'valor', v.valor, 'vencimento', v.vencimento,
                      'id_lancamento', l.id, 'status', l.status) ORDER BY v.vencimento, v.descricao)
                    FROM public.valores_folha v LEFT JOIN public.lancamentos_financeiros l ON l.id_valor_folha = v.id AND l.excluido_em IS NULL
                   WHERE v.id_devolucao = (v_dev ->> 'id')::uuid AND v.tipo = 'encargo'), '[]'::jsonb)) INTO v_pag;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'competencia', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id', c.id, 'competencia', c.competencia, 'status', c.status, 'versao_atual', c.versao_atual,
                     'atualizado_em', c.atualizado_em) END,
    'funcionarios', v_func,
    'pendencias', coalesce(v_pend, '[]'::jsonb),
    'pacote', v_pac,
    'devolucao', v_dev,
    'pagamento', v_pag,
    'pode_preparar', public.pode_gerenciar_folha(p_id_empresa),
    'pode_processar', v_contador,
    'contador_habilitado', EXISTS (SELECT 1 FROM public.vinculos_contabeis v WHERE v.id_empresa = p_id_empresa AND v.status = 'ativo' AND v.permissoes @> ARRAY['ver_folha', 'processar_folha']));
END;
$$;


CREATE OR REPLACE FUNCTION public.snapshot_folha(c public.competencias_folha)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'competencia', c.competencia,
    'empresa', (SELECT coalesce(nullif(e.nome_comercial, ''), e.razao_social) FROM public.empresas e WHERE e.id = c.id_empresa),
    'funcionarios', coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'nome', f.nome, 'matricula', f.matricula, 'cargo', f.cargo, 'vinculo', f.vinculo, 'data_admissao', f.data_admissao,
      'salario_base', public.salario_vigente(f.id, c.competencia),
      'sem_ocorrencias', k.sem_ocorrencias, 'conferido_em', k.confirmado_em,
      'conferido_por', (SELECT p.nome_completo FROM public.perfis p WHERE p.id_usuario = k.confirmado_por),
      'ocorrencias', (SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', o.id, 'tipo', o.tipo, 'quantidade', o.quantidade, 'valor', o.valor,
                        'data_inicio', o.data_inicio, 'data_fim', o.data_fim, 'situacao_justificativa', o.situacao_justificativa,
                        'justificativa', o.justificativa, 'observacoes', o.observacoes,
                        'documentos', (SELECT jsonb_agg(jsonb_build_object('id', d.id, 'nome', d.nome_arquivo)) FROM public.documentos_folha d WHERE d.id_ocorrencia = o.id AND d.excluido_em IS NULL)))
                        ORDER BY o.criado_em), '[]'::jsonb)
                      FROM public.ocorrencias_folha o WHERE o.id_competencia = c.id AND o.id_funcionario = f.id AND o.excluido_em IS NULL)
    ) ORDER BY f.nome, f.id), '[]'::jsonb))
  FROM public.funcionarios_da_competencia(c.id_empresa, c.competencia) f
  LEFT JOIN public.conferencias_folha k ON k.id_competencia = c.id AND k.id_funcionario = f.id AND k.invalidada_em IS NULL;
$$;


DROP FUNCTION IF EXISTS public.ajustes_funcionario_folha(uuid, date);
NOTIFY pgrst, 'reload schema';
