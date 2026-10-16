-- Excluir imposto (avulso/recorrente e parcela) e parcelamento tributário (migration 045). EXCLUSÃO LÓGICA: nada é apagado do banco —
-- o registro, o histórico e os arquivos ficam guardados para auditoria; o item some das listas, dos totais e de Contas a pagar
-- (o lançamento vinculado também recebe exclusão lógica). Quem pode: dono/sócio ou contador com "gerenciar_impostos".
-- Bloqueios: imposto pago (estorne o pagamento no Financeiro antes) e parcelamento com parcela paga. Um item excluído não pode mais ser alterado.
-- O mesmo tributo/competência e o mesmo número de acordo podem ser cadastrados de novo depois da exclusão.
-- Reversão: rollback/20261015000050_excluir_impostos_reverter.sql

ALTER TABLE public.impostos ADD COLUMN excluido_em timestamptz, ADD COLUMN excluido_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL;
ALTER TABLE public.parcelamentos_tributarios ADD COLUMN excluido_em timestamptz, ADD COLUMN excluido_por uuid REFERENCES public.perfis(id_usuario) ON DELETE SET NULL;

-- Sem duplicidade só entre itens que NÃO foram excluídos
DROP INDEX public.impostos_sem_duplicidade;
CREATE UNIQUE INDEX impostos_sem_duplicidade ON public.impostos (id_empresa, tipo, lower(btrim(nome)), competencia) WHERE id_parcelamento IS NULL AND status <> 'cancelado' AND excluido_em IS NULL;
DROP INDEX public.parcelamentos_tributarios_acordo;
CREATE UNIQUE INDEX parcelamentos_tributarios_acordo ON public.parcelamentos_tributarios (id_empresa, lower(btrim(numero_acordo))) WHERE excluido_em IS NULL;

DO $$
DECLARE v_nome text;
BEGIN
  SELECT conname INTO v_nome FROM pg_constraint
   WHERE conrelid = 'public.historico_impostos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%guia_enviada%';
  IF v_nome IS NULL THEN RAISE EXCEPTION 'Constraint de ações do histórico de impostos não encontrada.'; END IF;
  EXECUTE format('ALTER TABLE public.historico_impostos DROP CONSTRAINT %I', v_nome);
END $$;
ALTER TABLE public.historico_impostos ADD CONSTRAINT historico_impostos_acao_check CHECK (acao IN ('criado', 'editado', 'guia_enviada', 'guia_excluida', 'comprovante_enviado',
  'pagamento_informado', 'pagamento_confirmado', 'cancelado', 'excluido', 'parcelamento_criado', 'parcelamento_cancelado', 'parcelamento_excluido'));

-- Item excluído é imutável (nenhuma função antiga consegue alterá-lo nem anexar arquivo a ele)
CREATE OR REPLACE FUNCTION public.bloquear_imposto_excluido()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'arquivos_impostos' THEN
    IF EXISTS (SELECT 1 FROM public.impostos i WHERE i.id = NEW.id_imposto AND i.excluido_em IS NOT NULL) THEN RAISE EXCEPTION 'Imposto excluído.' USING ERRCODE = 'check_violation'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.excluido_em IS NOT NULL THEN RAISE EXCEPTION 'Item excluído não pode ser alterado.' USING ERRCODE = 'check_violation'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER bloquear_imposto_excluido BEFORE UPDATE ON public.impostos FOR EACH ROW EXECUTE FUNCTION public.bloquear_imposto_excluido();
CREATE TRIGGER bloquear_parcelamento_excluido BEFORE UPDATE ON public.parcelamentos_tributarios FOR EACH ROW EXECUTE FUNCTION public.bloquear_imposto_excluido();
CREATE TRIGGER bloquear_arquivo_imposto_excluido BEFORE INSERT ON public.arquivos_impostos FOR EACH ROW EXECUTE FUNCTION public.bloquear_imposto_excluido();

-- Consultas: itens excluídos não aparecem
CREATE OR REPLACE FUNCTION public.buscar_impostos(p_id_empresa uuid, p_busca text DEFAULT NULL, p_situacao text DEFAULT NULL, p_tipo text DEFAULT NULL,
  p_vencimento text DEFAULT NULL, p_origem text DEFAULT 'correntes', p_limite integer DEFAULT 50, p_deslocamento integer DEFAULT 0)
RETURNS TABLE (id uuid, id_parcelamento uuid, numero_parcela integer, tipo text, nome text, orgao text, competencia date, vencimento date, valor numeric, descricao text,
               situacao text, data_pagamento date, data_pagamento_informada date, id_lancamento uuid, guia_caminho text, guia_nome text, guia_tamanho bigint, guia_enviada_em timestamptz,
               comprovantes bigint, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b text := nullif(btrim(coalesce(p_busca, '')), ''); h date := public.hoje_brasil();
BEGIN
  IF NOT public.pode_gerenciar_impostos(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso aos impostos desta empresa.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    WITH base AS (
      SELECT i.*, public.situacao_imposto(i.status, l.status, i.vencimento) AS sit, l.data_pagamento AS pago_em, l.id AS lanc
        FROM public.impostos i JOIN public.lancamentos_financeiros l ON l.id_imposto = i.id
       WHERE i.id_empresa = p_id_empresa AND i.excluido_em IS NULL
         AND (coalesce(p_origem, 'correntes') = 'todos' OR (p_origem = 'correntes' AND i.id_parcelamento IS NULL) OR (p_origem = 'parcelas' AND i.id_parcelamento IS NOT NULL))
         AND (p_tipo IS NULL OR i.tipo = p_tipo)
         AND (b IS NULL OR i.nome ILIKE '%' || b || '%' OR i.orgao ILIKE '%' || b || '%' OR to_char(i.competencia, 'MM/YYYY') LIKE '%' || b || '%'))
    SELECT base.id, base.id_parcelamento, base.numero_parcela, base.tipo, base.nome, base.orgao, base.competencia, base.vencimento, base.valor, base.descricao, base.sit,
           base.pago_em, base.data_pagamento_informada, base.lanc, g.caminho, g.nome_arquivo, g.tamanho, g.criado_em,
           (SELECT count(*) FROM public.arquivos_impostos a WHERE a.id_imposto = base.id AND a.tipo = 'comprovante'), count(*) OVER ()
      FROM base LEFT JOIN LATERAL (SELECT a.caminho, a.nome_arquivo, a.tamanho, a.criado_em FROM public.arquivos_impostos a WHERE a.id_imposto = base.id AND a.tipo = 'guia' ORDER BY a.criado_em DESC LIMIT 1) g ON true
     WHERE (p_situacao IS NULL OR base.sit = p_situacao)
       AND (p_vencimento IS NULL OR (p_vencimento = 'vencidos' AND base.sit = 'vencido') OR (p_vencimento = '7' AND base.vencimento BETWEEN h AND h + 7)
            OR (p_vencimento = '30' AND base.vencimento BETWEEN h AND h + 30) OR (p_vencimento = 'mes' AND date_trunc('month', base.vencimento) = date_trunc('month', h)))
     ORDER BY base.vencimento, base.nome
     LIMIT least(greatest(coalesce(p_limite, 50), 1), 200) OFFSET greatest(coalesce(p_deslocamento, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_parcelamentos_tributarios(p_id_empresa uuid)
RETURNS TABLE (id uuid, tributo text, orgao text, numero_acordo text, valor_negociado numeric, observacoes text, situacao text, parcelas bigint, pagas bigint,
               saldo numeric, proximo_vencimento date, atrasadas bigint, criado_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.pode_gerenciar_impostos(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso aos impostos desta empresa.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT p.id, p.tributo, p.orgao, p.numero_acordo, p.valor_negociado, p.observacoes,
           CASE WHEN p.cancelado_em IS NOT NULL THEN 'cancelado' WHEN count(*) FILTER (WHERE l.status <> 'pago' AND i.status <> 'cancelado') = 0 THEN 'concluido' ELSE 'em_andamento' END,
           count(*), count(*) FILTER (WHERE l.status = 'pago'),
           coalesce(sum(i.valor) FILTER (WHERE l.status <> 'pago' AND i.status <> 'cancelado'), 0),
           min(i.vencimento) FILTER (WHERE l.status <> 'pago' AND i.status <> 'cancelado'),
           count(*) FILTER (WHERE l.status <> 'pago' AND i.status = 'pendente' AND i.vencimento < public.hoje_brasil()), p.criado_em
      FROM public.parcelamentos_tributarios p JOIN public.impostos i ON i.id_parcelamento = p.id AND i.excluido_em IS NULL JOIN public.lancamentos_financeiros l ON l.id_imposto = i.id
     WHERE p.id_empresa = p_id_empresa AND p.excluido_em IS NULL
     GROUP BY p.id ORDER BY p.criado_em DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.resumo_impostos(p_id_empresa uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE h date := public.hoje_brasil();
BEGIN
  IF NOT public.pode_gerenciar_impostos(p_id_empresa) THEN RAISE EXCEPTION 'Sem acesso aos impostos desta empresa.' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT jsonb_build_object(
    'a_pagar', coalesce(sum(i.valor) FILTER (WHERE l.status = 'pendente' AND i.status <> 'cancelado'), 0),
    'qtd_a_pagar', count(*) FILTER (WHERE l.status = 'pendente' AND i.status <> 'cancelado'),
    'vencidos', count(*) FILTER (WHERE l.status = 'pendente' AND i.status = 'pendente' AND i.vencimento < h),
    'vencendo_7', count(*) FILTER (WHERE l.status = 'pendente' AND i.status <> 'cancelado' AND i.vencimento BETWEEN h AND h + 7),
    'guias', (SELECT count(DISTINCT a.id_imposto) FROM public.arquivos_impostos a JOIN public.impostos x ON x.id = a.id_imposto AND x.excluido_em IS NULL WHERE a.id_empresa = p_id_empresa AND a.tipo = 'guia'),
    'pagos_90', count(*) FILTER (WHERE l.status = 'pago' AND l.data_pagamento >= h - 90))
    FROM public.impostos i JOIN public.lancamentos_financeiros l ON l.id_imposto = i.id WHERE i.id_empresa = p_id_empresa AND i.excluido_em IS NULL);
END;
$$;

-- Excluir um imposto (avulso, recorrente ou parcela): some das listas e de Contas a pagar; o histórico fica
CREATE OR REPLACE FUNCTION public.excluir_imposto(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.impostos; l public.lancamentos_financeiros;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO i FROM public.impostos WHERE id = p_id AND excluido_em IS NULL FOR UPDATE;
  IF i.id IS NULL OR NOT public.pode_gerenciar_impostos(i.id_empresa) THEN RAISE EXCEPTION 'Imposto não encontrado.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO l FROM public.lancamentos_financeiros WHERE id_imposto = i.id FOR UPDATE;
  IF l.status = 'pago' THEN RAISE EXCEPTION 'Imposto pago: estorne o pagamento no Financeiro antes de excluí-lo.' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.impostos SET excluido_em = now(), excluido_por = auth.uid(), atualizado_em = now() WHERE id = i.id;
  PERFORM set_config('unnify.operacao_imposto', 'sim', true);
  UPDATE public.lancamentos_financeiros SET excluido_em = now(), excluido_por = auth.uid(), atualizado_por = auth.uid() WHERE id = l.id AND excluido_em IS NULL;
  PERFORM set_config('unnify.operacao_imposto', '', true);
  INSERT INTO public.historico_impostos (id_empresa, id_imposto, id_parcelamento, acao, dados, id_usuario)
  VALUES (i.id_empresa, i.id, i.id_parcelamento, 'excluido', jsonb_build_object('nome', i.nome, 'vencimento', i.vencimento, 'valor', i.valor, 'parcela', i.numero_parcela), auth.uid());
END;
$$;

-- Excluir um parcelamento inteiro: todas as parcelas e seus lançamentos pendentes. Recusa se houver parcela paga.
CREATE OR REPLACE FUNCTION public.excluir_parcelamento_tributario(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.parcelamentos_tributarios; r record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM public.parcelamentos_tributarios WHERE id = p_id AND excluido_em IS NULL FOR UPDATE;
  IF p.id IS NULL OR NOT public.pode_gerenciar_impostos(p.id_empresa) THEN RAISE EXCEPTION 'Parcelamento não encontrado.' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.impostos i JOIN public.lancamentos_financeiros l ON l.id_imposto = i.id WHERE i.id_parcelamento = p.id AND i.excluido_em IS NULL AND l.status = 'pago') THEN
    RAISE EXCEPTION 'Há parcelas pagas: estorne os pagamentos no Financeiro antes de excluir o parcelamento.' USING ERRCODE = 'check_violation';
  END IF;
  FOR r IN SELECT i.id FROM public.impostos i WHERE i.id_parcelamento = p.id AND i.excluido_em IS NULL ORDER BY i.numero_parcela LOOP
    UPDATE public.impostos SET excluido_em = now(), excluido_por = auth.uid(), atualizado_em = now() WHERE id = r.id;
    PERFORM set_config('unnify.operacao_imposto', 'sim', true);
    UPDATE public.lancamentos_financeiros SET excluido_em = now(), excluido_por = auth.uid(), atualizado_por = auth.uid() WHERE id_imposto = r.id AND excluido_em IS NULL;
    PERFORM set_config('unnify.operacao_imposto', '', true);
  END LOOP;
  UPDATE public.parcelamentos_tributarios SET excluido_em = now(), excluido_por = auth.uid(), atualizado_em = now() WHERE id = p.id;
  INSERT INTO public.historico_impostos (id_empresa, id_parcelamento, acao, dados, id_usuario)
  VALUES (p.id_empresa, p.id, 'parcelamento_excluido', jsonb_build_object('tributo', p.tributo, 'acordo', p.numero_acordo), auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.excluir_imposto(uuid), public.excluir_parcelamento_tributario(uuid), public.bloquear_imposto_excluido() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_imposto(uuid), public.excluir_parcelamento_tributario(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.bloquear_imposto_excluido() FROM authenticated;
NOTIFY pgrst, 'reload schema';
