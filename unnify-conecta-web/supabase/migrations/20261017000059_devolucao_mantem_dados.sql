-- 059: a devolução do contador não se perde quando a folha volta a ele.
--  * Revisão pedida pela empresa ou nova versão após correção: o rascunho já abre com líquidos, encargos, holerites e documentos
--    da devolução anterior (só dos funcionários que continuam na versão). Arquivos não são duplicados no Storage.
--  * Rascunho do contador (nunca enviado) fica oculto da empresa mesmo quando a empresa reenvia uma nova versão; é reaproveitado.
--  * Empresa só vê devoluções efetivamente enviadas (enviada_em), inclusive no Storage.
-- Reversão: rollback/20261017000059_devolucao_mantem_dados_reverter.sql
ALTER TABLE public.devolucoes_folha ADD COLUMN IF NOT EXISTS numero_origem integer;

CREATE OR REPLACE FUNCTION public.devolucao_rascunho_folha(c public.competencias_folha)
RETURNS public.devolucoes_folha LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.devolucoes_folha; v_ant public.devolucoes_folha; v_pacote uuid; v_num integer; v_snap jsonb;
BEGIN
  SELECT id, snapshot INTO v_pacote, v_snap FROM public.pacotes_folha WHERE id_competencia = c.id AND situacao = 'vigente';
  SELECT * INTO d FROM public.devolucoes_folha WHERE id_competencia = c.id AND situacao = 'rascunho';
  IF d.id IS NOT NULL THEN
    -- Rascunho de uma versão anterior (empresa reenviou após correção): segue com o que o contador já preencheu,
    -- só sem líquidos/holerites de funcionários que saíram da folha
    IF d.id_pacote IS DISTINCT FROM v_pacote THEN
      UPDATE public.devolucoes_folha SET id_pacote = v_pacote WHERE id = d.id RETURNING * INTO d;
      DELETE FROM public.valores_folha v WHERE v.id_devolucao = d.id AND v.id_funcionario IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_snap -> 'funcionarios') f WHERE f ->> 'id' = v.id_funcionario::text);
      UPDATE public.documentos_folha x SET excluido_em = now(), excluido_por = auth.uid()
       WHERE x.id_devolucao = d.id AND x.excluido_em IS NULL AND x.id_funcionario IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_snap -> 'funcionarios') f WHERE f ->> 'id' = x.id_funcionario::text);
    END IF;
    RETURN d;
  END IF;
  SELECT coalesce(max(numero), 0) + 1 INTO v_num FROM public.devolucoes_folha WHERE id_competencia = c.id;
  -- Parte da devolução anterior (revisão pedida pela empresa ou devolução substituída): o contador troca só o necessário.
  -- Líquidos e holerites só dos funcionários que continuam na versão atual.
  SELECT * INTO v_ant FROM public.devolucoes_folha WHERE id_competencia = c.id AND situacao IN ('revisao_solicitada', 'substituida')
   ORDER BY numero DESC LIMIT 1;
  INSERT INTO public.devolucoes_folha (id_empresa, id_competencia, id_pacote, numero, criado_por, numero_origem)
  VALUES (c.id_empresa, c.id, v_pacote, v_num, auth.uid(), v_ant.numero) RETURNING * INTO d;
  IF v_ant.id IS NOT NULL THEN
    INSERT INTO public.valores_folha (id_empresa, id_devolucao, tipo, id_funcionario, descricao, valor, vencimento)
    SELECT v.id_empresa, d.id, v.tipo, v.id_funcionario, v.descricao, v.valor, v.vencimento FROM public.valores_folha v
     WHERE v.id_devolucao = v_ant.id
       AND (v.id_funcionario IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_snap -> 'funcionarios') f WHERE f ->> 'id' = v.id_funcionario::text));
    INSERT INTO public.documentos_folha (id_empresa, id_competencia, categoria, id_funcionario, id_devolucao, caminho, nome_arquivo, tipo_mime, tamanho, enviado_por, enviado_em)
    SELECT x.id_empresa, x.id_competencia, x.categoria, x.id_funcionario, d.id, x.caminho, x.nome_arquivo, x.tipo_mime, x.tamanho, x.enviado_por, x.enviado_em
      FROM public.documentos_folha x
     WHERE x.id_devolucao = v_ant.id AND x.excluido_em IS NULL
       AND (x.id_funcionario IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_snap -> 'funcionarios') f WHERE f ->> 'id' = x.id_funcionario::text));
    IF v_ant.situacao = 'revisao_solicitada' THEN UPDATE public.devolucoes_folha SET situacao = 'substituida' WHERE id = v_ant.id; END IF;
  END IF;
  RETURN d;
END;
$$;

CREATE OR REPLACE FUNCTION public.iniciar_processamento_folha(p_id_competencia uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.competencias_folha;
BEGIN
  c := public.competencia_do_contador_folha(p_id_competencia, ARRAY['enviada', 'revisao_solicitada']);
  UPDATE public.competencias_folha SET status = 'em_processamento', atualizado_em = now() WHERE id = c.id;
  PERFORM public.devolucao_rascunho_folha(c); -- já abre o rascunho com o que foi preenchido/devolvido antes
  PERFORM public.registrar_evento_folha(c.id, NULL, 'processamento_iniciado', 'Contador iniciou o processamento', c.versao_atual, NULL);
  PERFORM public.notificar_folha(c.id_empresa, 'empresa', 'Folha em processamento', 'O contador iniciou o processamento da folha de ' || to_char(c.competencia, 'MM/YYYY') || '.');
END;
$$;

-- Competência já em processamento sem rascunho (iniciada antes desta migration): o contador abre o rascunho ao entrar na tela
CREATE OR REPLACE FUNCTION public.abrir_devolucao_folha(p_id_competencia uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.competencias_folha;
BEGIN
  c := public.competencia_do_contador_folha(p_id_competencia, ARRAY['em_processamento']);
  PERFORM public.devolucao_rascunho_folha(c);
END;
$$;

CREATE OR REPLACE FUNCTION public.enviar_folha_contador(p_id_empresa uuid, p_competencia date, p_responsavel text, p_observacoes text, p_confirmo boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.competencias_folha;
  v_total integer; v_aptos integer;
  v_snap jsonb;
  v_id uuid;
  v_versao integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login.' USING ERRCODE = '42501'; END IF;
  c := public.competencia_editavel_folha(p_id_empresa, p_competencia);
  IF p_confirmo IS NOT TRUE THEN RAISE EXCEPTION 'Confirme o envio.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(btrim(coalesce(p_responsavel, ''))) NOT BETWEEN 3 AND 120 THEN RAISE EXCEPTION 'Informe o responsável pelo envio.' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(coalesce(p_observacoes, '')) > 1000 THEN RAISE EXCEPTION 'Observações muito longas (máximo de 1000 caracteres).' USING ERRCODE = 'check_violation'; END IF;
  SELECT count(*), count(*) FILTER (WHERE public.situacao_funcionario_folha(c.id, f.id) = 'apto') INTO v_total, v_aptos
    FROM public.funcionarios_da_competencia(c.id_empresa, c.competencia) f;
  IF v_total = 0 THEN RAISE EXCEPTION 'Não há funcionários nesta competência.' USING ERRCODE = 'check_violation'; END IF;
  IF v_aptos < v_total THEN RAISE EXCEPTION 'Ainda há % funcionário(s) a conferir ou com pendência.', v_total - v_aptos USING ERRCODE = 'check_violation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vinculos_contabeis v WHERE v.id_empresa = c.id_empresa AND v.status = 'ativo' AND v.permissoes @> ARRAY['ver_folha', 'processar_folha']) THEN
    RAISE EXCEPTION 'Nenhum contador com vínculo ativo e permissão para processar a folha.' USING ERRCODE = 'check_violation';
  END IF;
  v_snap := public.snapshot_folha(c);
  v_versao := c.versao_atual + 1;
  UPDATE public.pacotes_folha SET situacao = 'substituido' WHERE id_competencia = c.id AND situacao = 'vigente';
  UPDATE public.devolucoes_folha SET situacao = 'substituida' WHERE id_competencia = c.id AND situacao IN ('enviada', 'revisao_solicitada');
  INSERT INTO public.pacotes_folha (id_empresa, id_competencia, versao, snapshot, responsavel, observacoes, enviado_por)
  VALUES (c.id_empresa, c.id, v_versao, v_snap, btrim(p_responsavel), nullif(btrim(coalesce(p_observacoes, '')), ''), auth.uid()) RETURNING id INTO v_id;
  UPDATE public.competencias_folha SET status = 'enviada', versao_atual = v_versao, atualizado_em = now() WHERE id = c.id;
  PERFORM public.registrar_evento_folha(c.id, NULL, 'folha_enviada', 'Folha enviada ao contador (versão ' || v_versao || ') por ' || btrim(p_responsavel), v_versao,
    jsonb_build_object('funcionarios', v_total));
  PERFORM public.notificar_folha(c.id_empresa, 'contador', 'Folha de pagamento recebida',
    'A folha de ' || to_char(c.competencia, 'MM/YYYY') || ' foi enviada (versão ' || v_versao || ', ' || v_total || ' funcionário(s)).');
  RETURN v_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.pode_ler_arquivo_folha(p_nome text, p_dono text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.documentos_folha d WHERE d.caminho = p_nome AND d.excluido_em IS NULL AND public.pode_ver_folha(d.id_empresa)
                   AND (d.id_devolucao IS NULL OR EXISTS (SELECT 1 FROM public.devolucoes_folha v WHERE v.id = d.id_devolucao AND (v.enviada_em IS NOT NULL OR public.pode_processar_folha(v.id_empresa)))))
      OR (p_dono = auth.uid()::text AND NOT EXISTS (SELECT 1 FROM public.documentos_folha d WHERE d.caminho = p_nome));
$$;


DROP POLICY IF EXISTS "Devoluções da folha: empresa autorizada" ON public.devolucoes_folha;
CREATE POLICY "Devoluções da folha: empresa autorizada" ON public.devolucoes_folha FOR SELECT TO authenticated
  USING (public.pode_ver_folha(id_empresa) AND (enviada_em IS NOT NULL OR public.pode_processar_folha(id_empresa)));
DROP POLICY IF EXISTS "Valores da folha: empresa autorizada" ON public.valores_folha;
CREATE POLICY "Valores da folha: empresa autorizada" ON public.valores_folha FOR SELECT TO authenticated
  USING (public.pode_ver_folha(id_empresa) AND EXISTS (SELECT 1 FROM public.devolucoes_folha d WHERE d.id = id_devolucao AND (d.enviada_em IS NOT NULL OR public.pode_processar_folha(d.id_empresa))));
DROP POLICY IF EXISTS "Documentos da folha: empresa autorizada" ON public.documentos_folha;
CREATE POLICY "Documentos da folha: empresa autorizada" ON public.documentos_folha FOR SELECT TO authenticated
  USING (excluido_em IS NULL AND public.pode_ver_folha(id_empresa)
         AND (id_devolucao IS NULL OR EXISTS (SELECT 1 FROM public.devolucoes_folha d WHERE d.id = id_devolucao AND (d.enviada_em IS NOT NULL OR public.pode_processar_folha(d.id_empresa)))));

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
      'ajustes', public.ajustes_funcionario_folha(f.id, v_comp),
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
                              'numero_origem', d.numero_origem,
                              'motivo_revisao', d.motivo_revisao, 'aprovada_em', d.aprovada_em, 'faltas', public.faltas_devolucao_folha(d.id),
                              'aprovada_por', (SELECT nome_completo FROM public.perfis WHERE id_usuario = d.aprovada_por))
      INTO v_dev FROM public.devolucoes_folha d
     WHERE d.id_competencia = c.id AND (d.enviada_em IS NOT NULL OR (v_contador AND d.situacao = 'rascunho'))
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


REVOKE ALL ON FUNCTION public.abrir_devolucao_folha(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abrir_devolucao_folha(uuid) TO authenticated;
